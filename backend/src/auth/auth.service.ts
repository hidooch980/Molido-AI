import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { DatabaseService } from '../database/database.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import {
  generateRecoveryCodes,
  generateSecret,
  otpauthUrl,
  verifyCode,
} from './totp';

type UserRow = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  password: string;
  role: string;
  status: string;
  avatar: string | null;
  companyId: string | null;
  createdAt: Date;
  /** تا این لحظه ورود پذیرفته نمی‌شود؛ تهی = قفل نیست. */
  lockedUntil: Date | null;
  /** دیرترینِ «تغییر رمز» و «خروج از همهٔ دستگاه‌ها»؛ تهی = هرگز. */
  validFrom: Date | null;
  /** رازِ TOTP به قالب base32؛ تهی = راه‌اندازی نشده. */
  mfaSecret: string | null;
  /** لحظهٔ تأییدِ اولین کدِ درست؛ تهی = راز هست ولی فعال نیست. */
  mfaEnabledAt: Date | null;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly db: DatabaseService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.findUser('email', dto.email);
    if (existing) throw new ConflictException('A user with this email already exists');

    const password = await bcrypt.hash(dto.password, 10);
    const user = await this.db.transaction(async (client) => {
      let companyId: string | null = null;
      if (dto.companyName) {
        companyId = randomUUID();
        await client.query('INSERT INTO "Company" (id, name) VALUES ($1, $2)', [
          companyId,
          dto.companyName,
        ]);
      }

      const rows = await client.query<UserRow>(
        `INSERT INTO "User" (id, "firstName", "lastName", email, phone, password, role, "companyId")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, "firstName", "lastName", email, phone, password, role, status, avatar, "companyId", "createdAt"`,
        [
          randomUUID(),
          dto.firstName,
          dto.lastName,
          dto.email,
          dto.phone ?? null,
          password,
          dto.companyName ? 'ADMIN' : 'EMPLOYEE',
          companyId,
        ],
      );
      return rows.rows[0];
    });
    return this.buildAuthResponse(user);
  }

  /**
   * پنجرهٔ شمارشِ تلاش‌های ناموفق، و مدتِ قفل.
   *
   * ⚠️ قفل **موقت** است، نه دائمی.
   *
   *    قفلِ دائمی یعنی مهاجم می‌تواند با چند تلاشِ عمداً غلط، حسابِ
   *    هر کسی را ببندد — یعنی خودش می‌شود ابزارِ حمله.
   *
   *    پانزده دقیقه، حدسِ رمز را غیرعملی می‌کند (۱۰ تلاش در ربع
   *    ساعت) بی‌آنکه سلاحِ آزار شود.
   */
  private static readonly LOCK_WINDOW_MIN = 15;
  private static readonly LOCK_THRESHOLD = 10;
  private static readonly LOCK_MINUTES = 15;

  /**
   * تلاشِ ورود را ثبت می‌کند.
   *
   * ⚠️ خطایش **بلعیده** می‌شود.
   *
   *    ثبتِ رویداد نباید ورود را بشکند: اگر جدولِ لاگ پر شد یا قفل
   *    خورد، کاربر باید بتواند وارد شود.  امنیت نباید به قیمتِ
   *    از کار افتادنِ سامانه باشد.
   */
  private async recordAttempt(
    email: string,
    success: boolean,
    reason?: string,
    meta?: { ip?: string; userAgent?: string },
  ): Promise<void> {
    try {
      await this.db.query(
        `INSERT INTO "LoginAttempt" (id, email, ip, "userAgent", success, reason)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          randomUUID(),
          email.slice(0, 200),
          meta?.ip ?? null,
          meta?.userAgent?.slice(0, 300) ?? null,
          success,
          reason ?? null,
        ],
      );
    } catch {
      /* ثبت نشد — ورود نباید بشکند */
    }
  }

  async login(dto: LoginDto, meta?: { ip?: string; userAgent?: string }) {
    const email = String(dto.email ?? '');
    const user = await this.findUser('email', email);

    // ⚠️ قفل **پیش از** بررسی رمز سنجیده می‌شود.
    //
    //    وگرنه مهاجم می‌فهمد رمزش درست بوده یا نه، حتی وقتی حساب قفل
    //    است — و قفل فقط تأخیر می‌شود، نه محافظت.
    if (user?.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      await this.recordAttempt(email, false, 'LOCKED', meta);
      // پیام همان پیامِ رمزِ غلط است: گفتنِ «قفل است» به مهاجم
      // می‌گوید این ایمیل وجود دارد.
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!user || !(await bcrypt.compare(dto.password, user.password))) {
      await this.recordAttempt(email, false, user ? 'BAD_PASSWORD' : 'NO_USER', meta);
      await this.maybeLock(user?.id, email);
      throw new UnauthorizedException('Invalid email or password');
    }

    if (user.status !== 'ACTIVE') {
      await this.recordAttempt(email, false, 'INACTIVE', meta);
      throw new UnauthorizedException('User account is inactive');
    }

    // ⚠️ MFA فعال یعنی رمزِ درست **کافی نیست**.
    //
    //    اینجا توکنِ دسترسی صادر نمی‌شود.  یک «توکنِ چالش» با عمرِ پنج
    //    دقیقه برمی‌گردد که فقط یک کار می‌کند: اثباتِ اینکه مرحلهٔ اولِ
    //    ورود گذشته است.
    //
    //    چالش عمداً با کلیدِ **جدا** امضا می‌شود.  با کلیدِ مشترک، همان
    //    رشته یک توکنِ دسترسیِ معتبر می‌شد: `JwtStrategy` امضا را درست
    //    می‌دید، `sub` را می‌خواند و کاربر را داخل می‌فرستاد — بی‌آنکه
    //    هرگز کدی خواسته شود.  یعنی MFA فقط ظاهرِ محافظت می‌شد.
    if (user.mfaEnabledAt) {
      // ⚠️ اینجا **موفقیت ثبت نمی‌شود** و قفل هم برداشته نمی‌شود.
      //
      //    پیش‌تر هر دو همین‌جا رخ می‌داد و دو حفره می‌ساخت:
      //
      //    ۱) مهاجمی که فقط رمز را داشت و هرگز از مرحلهٔ دوم رد
      //       نمی‌شد، در تاریخچه یک ردیفِ «ورودِ موفق» جا می‌گذاشت.
      //       تاریخچه‌ای که مدیر می‌بیند دروغ می‌گفت.
      //
      //    ۲) همان مهاجم می‌توانست بی‌نهایت بار قفلِ حساب را باز کند —
      //       یعنی برای حساب‌های MFA‌دار قفل عملاً بی‌اثر بود.
      //
      //    ردِ مرحلهٔ اول با `success = false` ثبت می‌شود تا هم دیده
      //    شود و هم در شمارشِ `maybeLock` بیاید: تکرارِ مرحلهٔ اول
      //    بدونِ گذر از مرحلهٔ دوم دقیقاً همان الگویی است که باید به
      //    قفل برسد.
      await this.recordAttempt(email, false, 'MFA_PENDING', meta);
      return {
        mfaRequired: true,
        challenge: this.jwtService.sign(
          { sub: user.id, stage: 'mfa' },
          { secret: this.mfaChallengeSecret(), expiresIn: '5m' },
        ),
      };
    }

    return this.finalizeLogin(user, meta);
  }

  /**
   * پایانِ **واقعی**ِ ورود: ثبتِ موفقیت، برداشتنِ قفل، صدورِ توکن.
   *
   * ⚠️ فقط از جایی صدا زده می‌شود که همهٔ عامل‌ها گذشته باشند.
   *
   *    برای حسابِ بدونِ MFA یعنی پس از رمز؛ برای حسابِ MFA‌دار یعنی
   *    پس از کدِ درست یا کدِ بازیابی — نه پیش از آن.
   */
  private async finalizeLogin(
    user: UserRow,
    meta?: { ip?: string; userAgent?: string },
  ) {
    await this.recordAttempt(user.email, true, undefined, meta);

    // ورودِ موفق قفل را برمی‌دارد — کسی که رمز را می‌داند، نباید
    // به‌خاطر تلاش‌های مهاجم بیرون بماند.
    if (user.lockedUntil) {
      await this.db
        .query('UPDATE "User" SET "lockedUntil" = NULL WHERE id = $1', [user.id])
        .catch(() => undefined);
    }

    return this.buildAuthResponse(user);
  }

  /**
   * ورودِ کاربرِ پنل از راهِ ورودِ یکپارچهٔ دولت.
   *
   * ⚠️ همان مسیرِ پایانیِ ورودِ رمزی را می‌رود، نه مسیرِ میان‌بر.
   *
   *    وسوسه این بود که مستقیم توکن صادر شود — درگاهِ دولت خودش قوی
   *    است.  ولی آن‌وقت سه چیز دور زده می‌شد: ثبتِ تلاش در تاریخچه،
   *    برداشتنِ قفل، و مهم‌تر از همه **MFA**.
   *
   * ⚠️ MFA دور زده نمی‌شود، حتی با هویتِ دولتی.
   *
   *    کاربری که عمداً عاملِ دوم را روشن کرده، انتظار دارد همیشه
   *    خواسته شود.  اگر ورودِ دولتی از کنارش رد شود، هر کسی که به
   *    حسابِ دولتیِ او دسترسی پیدا کند، عاملِ دوم را بی‌اثر کرده —
   *    یعنی افزودنِ یک راهِ ورود، محافظتِ موجود را **کم** کرده است.
   *
   *    پس همان `mfaRequired` و همان چالش برمی‌گردد و رابط همان مرحلهٔ
   *    دومِ همیشگی را نشان می‌دهد.
   */
  async loginWithGovIdentity(
    userId: string,
    meta?: { ip?: string; userAgent?: string },
  ) {
    const rows = await this.db.query<UserRow>(
      'SELECT * FROM "User" WHERE id = $1 LIMIT 1',
      [userId],
    );
    const user = rows[0];
    if (!user) throw new UnauthorizedException('حساب کاربری یافت نشد');

    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      await this.recordAttempt(user.email, false, 'LOCKED', meta);
      throw new UnauthorizedException('حساب شما موقتاً قفل شده است');
    }

    if (user.mfaEnabledAt) {
      await this.recordAttempt(user.email, false, 'MFA_PENDING', meta);
      return {
        mfaRequired: true,
        challenge: this.jwtService.sign(
          { sub: user.id, stage: 'mfa' },
          { secret: this.mfaChallengeSecret(), expiresIn: '5m' },
        ),
      };
    }

    return this.finalizeLogin(user, meta);
  }

  /**
   * کلیدِ امضای توکنِ چالش — جدا از توکنِ دسترسی.
   *
   * ⚠️ جدا بودنش تمامِ محافظت است.  با کلیدِ مشترک، مرحلهٔ دوم قابل
   *    دور زدن بود.
   */
  private mfaChallengeSecret(): string {
    const jwtSecret = this.configService.get<string>('JWT_SECRET');
    if (!jwtSecret) throw new Error('JWT_SECRET is required');
    return `${jwtSecret}_mfa_challenge`;
  }

  /**
   * اگر تلاش‌های ناموفقِ اخیر از حد گذشت، حساب را موقتاً قفل می‌کند.
   *
   * ⚠️ فقط برای کاربرِ **موجود**.
   *
   *    ایمیلِ ناشناس چیزی برای قفل کردن ندارد؛ تلاشش ثبت می‌شود ولی
   *    قفلی در کار نیست.  سقفِ نرخ آنجا کار می‌کند.
   */
  private async maybeLock(userId: string | undefined, email: string): Promise<void> {
    if (!userId) return;
    try {
      const rows = await this.db.query<{ n: string }>(
        // ⚠️ فقط شکست‌های **پس از آخرین ورودِ موفق** شمرده می‌شوند.
        //
        //    وگرنه ورودِ موفق شمارنده را صفر نمی‌کرد و شکست‌های کهنه
        //    روی هم می‌ماندند: کاربری که دیروز چند بار رمز را اشتباه
        //    زده و بعد وارد شده، با یک اشتباهِ تازه قفل می‌شد.
        //
        //    از وقتی مرحلهٔ اولِ MFA ردِ `MFA_PENDING` می‌گذارد این
        //    لازم‌تر هم شد: بدونش، کاربرِ MFA‌داری که ده بار وارد شده
        //    بود — همه با موفقیت — قفل می‌شد.
        `SELECT count(*)::text AS n FROM "LoginAttempt"
          WHERE email = $1 AND success = false
            AND "createdAt" > now() - ($2 || ' minutes')::interval
            AND "createdAt" > COALESCE(
                  (SELECT max("createdAt") FROM "LoginAttempt"
                    WHERE email = $1 AND success = true),
                  'epoch'::timestamptz)`,
        [email, String(AuthService.LOCK_WINDOW_MIN)],
      );
      if (Number(rows[0]?.n ?? 0) < AuthService.LOCK_THRESHOLD) return;

      await this.db.query(
        `UPDATE "User" SET "lockedUntil" = now() + ($1 || ' minutes')::interval
          WHERE id = $2`,
        [String(AuthService.LOCK_MINUTES), userId],
      );
    } catch {
      /* قفل نشد — ورود همچنان با سقفِ نرخ محافظت می‌شود */
    }
  }

  /**
   * خروج از همهٔ دستگاه‌ها.
   *
   * ⚠️ ستونِ جدا از `passwordChangedAt` دارد، عمداً.
   *
   *    «رمزم را عوض کردم» و «می‌خواهم همه‌جا خارج شوم» دو کارند.
   *    یکی کردنشان یعنی کاربری که فقط گوشی‌اش را جا گذاشته، مجبور
   *    شود رمزِ تازه‌ای بسازد و به خاطر بسپارد — بی‌هیچ دلیلی.
   */
  async revokeAllSessions(userId: string) {
    await this.db.query(
      'UPDATE "User" SET "sessionsRevokedAt" = now() WHERE id = $1',
      [userId],
    );
    return { revoked: true };
  }

  // ══════════════════════════════════════════════ رمز دومرحله‌ای

  /**
   * مرحلهٔ یک: ساختِ راز و نمایشِ QR.
   *
   * ⚠️ اینجا MFA **فعال نمی‌شود**.
   *
   *    فقط راز ساخته و ذخیره می‌شود.  اگر همین‌جا فعال می‌شد، کاربری
   *    که QR را دید و پنجره را بست، دفعهٔ بعد نمی‌توانست وارد شود:
   *    سامانه کد می‌خواست و هیچ برنامه‌ای راز را نداشت.
   *
   *    یعنی خودِ سخت‌سازی، کاربر را از حسابش بیرون می‌انداخت.
   */
  async mfaSetup(userId: string) {
    const user = await this.findUser('id', userId);
    if (!user) throw new UnauthorizedException('حساب کاربری یافت نشد');
    if (user.mfaEnabledAt) {
      throw new BadRequestException('رمز دومرحله‌ای از قبل فعال است');
    }

    const secret = generateSecret();
    await this.db.execute(
      'UPDATE "User" SET "mfaSecret" = $1, "updatedAt" = now() WHERE id = $2',
      [secret, userId],
    );

    // ⚠️ راز فقط همین یک بار برمی‌گردد و دیگر هرگز خوانده نمی‌شود.
    return { secret, otpauth: otpauthUrl(secret, user.email) };
  }

  /**
   * مرحلهٔ دو: تأییدِ اولین کد و فعال‌سازی.
   *
   * ⚠️ کدهای بازیابی همین‌جا و فقط یک بار داده می‌شوند.
   *
   *    بدونشان، گم شدنِ گوشی یعنی از دست رفتنِ حساب — و برای مدیرِ یک
   *    فروشگاه یعنی کلِ کسب‌وکار خوابیده.  MFA بدون راهِ بازیابی،
   *    امنیت نیست؛ خطرِ عملیاتی است.
   */
  async mfaConfirm(userId: string, code: string) {
    const user = await this.findUser('id', userId);
    if (!user?.mfaSecret) {
      throw new BadRequestException('ابتدا رمز دومرحله‌ای را راه‌اندازی کنید');
    }
    if (user.mfaEnabledAt) {
      throw new BadRequestException('رمز دومرحله‌ای از قبل فعال است');
    }
    if (!verifyCode(user.mfaSecret, code, Date.now())) {
      throw new UnauthorizedException('کد نادرست است');
    }

    const codes = generateRecoveryCodes();
    const hashes = await Promise.all(codes.map((c) => bcrypt.hash(c, 10)));

    await this.db.transaction(async (tx) => {
      await tx.query(
        'UPDATE "User" SET "mfaEnabledAt" = now(), "updatedAt" = now() WHERE id = $1',
        [userId],
      );
      // راه‌اندازیِ دوباره نباید کدهای قدیمی را زنده نگه دارد.
      await tx.query('DELETE FROM "MfaRecoveryCode" WHERE "userId" = $1', [userId]);
      for (const hash of hashes) {
        await tx.query(
          'INSERT INTO "MfaRecoveryCode" (id, "userId", "codeHash") VALUES ($1,$2,$3)',
          [randomUUID(), userId, hash],
        );
      }
    });

    return { enabled: true, recoveryCodes: codes };
  }

  /**
   * مرحلهٔ دومِ ورود: چالش + کد ← توکنِ واقعی.
   *
   * ⚠️ کدِ بازیابی هم پذیرفته می‌شود، ولی فقط یک بار.
   */
  async mfaVerify(challenge: string, code: string) {
    let payload: { sub: string; stage?: string };
    try {
      payload = await this.jwtService.verifyAsync(challenge, {
        secret: this.mfaChallengeSecret(),
      });
    } catch {
      throw new UnauthorizedException('چالش منقضی شده — دوباره وارد شوید');
    }

    // ⚠️ `stage` سنجیده می‌شود، نه فقط امضا.
    //
    //    کلید جداست، ولی اگر روزی توکنِ دیگری با همین کلید امضا شود،
    //    این بررسی جلوی استفادهٔ متقابلش را می‌گیرد.
    if (payload?.stage !== 'mfa') {
      throw new UnauthorizedException('چالش نامعتبر است');
    }

    const user = await this.findUser('id', payload.sub);
    if (!user || user.status !== 'ACTIVE' || !user.mfaEnabledAt || !user.mfaSecret) {
      throw new UnauthorizedException('حساب کاربری معتبر نیست');
    }

    if (verifyCode(user.mfaSecret, code, Date.now())) {
      return this.finalizeLogin(user);
    }

    if (await this.consumeRecoveryCode(user.id, code)) {
      return this.finalizeLogin(user);
    }

    // ⚠️ تلاشِ ناموفقِ مرحلهٔ دوم هم ثبت می‌شود.
    //
    //    وگرنه حدسِ کدِ شش‌رقمی هیچ ردی نمی‌گذاشت — همان نقصی که برای
    //    مرحلهٔ اول رفعش کردیم، برای مرحلهٔ دوم باز می‌ماند.
    await this.recordAttempt(user.email, false, 'BAD_MFA');

    // ⚠️ مرحلهٔ دوم هم باید به قفل برسد، مثل مرحلهٔ اول.
    //
    //    پیش‌تر تنها سدّ، سقفِ نرخِ ده‌تا-در-دقیقه روی کنترلر بود —
    //    یعنی حدس زدن کند می‌شد ولی هرگز متوقف نمی‌شد.  مرحلهٔ اول
    //    پس از ده شکست قفل می‌شد و مرحلهٔ دوم نمی‌شد؛ همان درِ پشتی
    //    که MFA قرار بود ببندد.
    await this.maybeLock(user.id, user.email);
    throw new UnauthorizedException('کد نادرست است');
  }

  /**
   * مصرفِ کدِ بازیابی — یک بار و تمام.
   *
   * ⚠️ کدها هش‌شده‌اند، پس باید یکی‌یکی مقایسه شوند.
   *
   *    هزینه‌اش هشت مقایسهٔ bcrypt است و فقط وقتی رخ می‌دهد که کدِ
   *    TOTP جواب نداده باشد — یعنی مسیرِ نادر.  ذخیرهٔ خام برای
   *    سریع‌تر شدن، همان چیزی را نابود می‌کرد که MFA برایش هست.
   */
  private async consumeRecoveryCode(userId: string, entered: string): Promise<boolean> {
    const clean = (entered ?? '').trim().toUpperCase();
    if (!clean) return false;

    const rows = await this.db.query<{ id: string; codeHash: string }>(
      'SELECT id, "codeHash" FROM "MfaRecoveryCode" WHERE "userId" = $1 AND "usedAt" IS NULL',
      [userId],
    );

    for (const row of rows) {
      if (await bcrypt.compare(clean, row.codeHash)) {
        // ⚠️ شرطِ `"usedAt" IS NULL` در خودِ UPDATE تکرار شده.
        //
        //    دو درخواستِ هم‌زمان با یک کد می‌توانستند هر دو از حلقهٔ
        //    بالا رد شوند.  این شرط یکی‌شان را قطعاً بی‌اثر می‌کند.
        const done = await this.db.execute(
          'UPDATE "MfaRecoveryCode" SET "usedAt" = now() WHERE id = $1 AND "usedAt" IS NULL',
          [row.id],
        );
        return done > 0;
      }
    }
    return false;
  }

  /**
   * خاموش کردنِ MFA — رمز **و** کد، هر دو.
   *
   * ⚠️ فقط توکنِ معتبر کافی نیست.
   *
   *    توکن ممکن است دزدیده شده باشد؛ اگر با آن بشود MFA را خاموش
   *    کرد، مهاجم اولین کاری که می‌کند همین است و از آن پس محافظتی
   *    نیست.  خواستنِ رمز و کد یعنی مهاجم باید هر دو عامل را داشته
   *    باشد — که اگر داشت، اصلاً به MFA نیازی نبود.
   */
  async mfaDisable(userId: string, password: string, code: string) {
    const user = await this.findUser('id', userId);
    if (!user?.mfaEnabledAt || !user.mfaSecret) {
      throw new BadRequestException('رمز دومرحله‌ای فعال نیست');
    }
    if (!(await bcrypt.compare(password ?? '', user.password))) {
      throw new UnauthorizedException('رمز عبور نادرست است');
    }
    if (
      !verifyCode(user.mfaSecret, code, Date.now()) &&
      !(await this.consumeRecoveryCode(userId, code))
    ) {
      throw new UnauthorizedException('کد نادرست است');
    }

    await this.db.transaction(async (tx) => {
      await tx.query(
        'UPDATE "User" SET "mfaSecret" = NULL, "mfaEnabledAt" = NULL, "updatedAt" = now() WHERE id = $1',
        [userId],
      );
      await tx.query('DELETE FROM "MfaRecoveryCode" WHERE "userId" = $1', [userId]);
    });

    return { disabled: true };
  }

  /** وضعیتِ MFA برای نمایش در رابط. */
  async mfaStatus(userId: string) {
    const user = await this.findUser('id', userId);
    const left = await this.db.query<{ n: string }>(
      'SELECT count(*) AS n FROM "MfaRecoveryCode" WHERE "userId" = $1 AND "usedAt" IS NULL',
      [userId],
    );
    return {
      enabled: Boolean(user?.mfaEnabledAt),
      pending: Boolean(user?.mfaSecret && !user?.mfaEnabledAt),
      recoveryCodesLeft: Number(left[0]?.n ?? 0),
    };
  }

  /** تاریخچهٔ تلاش‌های ورودِ یک ایمیل — برای بررسیِ مدیر. */
  async loginHistory(email: string, limit = 50) {
    return this.db.query(
      `SELECT email, ip, "userAgent", success, reason, "createdAt"
         FROM "LoginAttempt"
        WHERE email = $1
        ORDER BY "createdAt" DESC
        LIMIT $2`,
      [email, Math.min(Math.max(Number(limit) || 50, 1), 200)],
    );
  }

  async refresh(refreshToken: string) {
    if (!refreshToken) throw new UnauthorizedException('Refresh token is required');
    let payload: { sub: string; iat: number; iatMs?: number };
    try {
      payload = await this.jwtService.verifyAsync(refreshToken, { secret: this.refreshSecret() });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
    const user = await this.findUser('id', payload.sub);
    if (!user || user.status !== 'ACTIVE') throw new UnauthorizedException('User not found or inactive');

    // ⚠️ نوسازی هم باید مُهرِ ابطال را بسنجد — وگرنه «خروج از همهٔ
    //    دستگاه‌ها» فقط **نیمی** از کار را می‌کند.
    //
    //    نگهبانِ JWT توکنِ دسترسی را می‌کشد، ولی این مسیر تا امروز فقط
    //    امضا و وضعیت را می‌سنجید.  یعنی مهاجمی که توکنِ نوسازی را
    //    دزدیده بود، **پس از** کلیکِ کاربر روی «خروج از همه‌جا» هم
    //    می‌توانست توکنِ دسترسیِ تازه بگیرد — و از آن به بعد هر بار
    //    دوباره، چون هر نوسازی توکنِ نوسازیِ تازه هم می‌دهد.
    //
    //    توکنِ نوسازی **سی روز** عمر دارد، نه هفت.  یعنی این حفره از
    //    آنکه در توکنِ دسترسی بستیم بزرگ‌تر بود، و دقیقاً همان دکمه‌ای
    //    را بی‌اثر می‌کرد که کاربر برای نجاتِ حسابش می‌زند.
    if (user.validFrom) {
      const issuedMs = payload.iatMs ?? (payload.iat + 1) * 1000;
      if (issuedMs < user.validFrom.getTime()) {
        throw new UnauthorizedException('نشست باطل شده — دوباره وارد شوید');
      }
    }

    return this.buildAuthResponse(user);
  }

  async me(userId: string) {
    const rows = await this.db.query<UserRow & { companyName: string | null }>(
      `SELECT u.id, u."firstName", u."lastName", u.email, u.phone, u.role, u.status, u.avatar,
              u."companyId", u."createdAt", c.name AS "companyName"
       FROM "User" u LEFT JOIN "Company" c ON c.id = u."companyId" WHERE u.id = $1`,
      [userId],
    );
    const user = rows[0];
    if (!user) throw new UnauthorizedException('User not found');
    const { companyName, ...safeUser } = user;
    return { ...safeUser, company: user.companyId ? { id: user.companyId, name: companyName } : null };
  }

  /**
   * تغییر رمز خودِ کاربر.
   *
   * جدا از `PATCH /users/:id` که کار مدیر است: آنجا رمز فعلی پرسیده
   * نمی‌شود (مدیر رمز کارمند را نمی‌داند) و صندوق‌دار هم اصلاً دسترسی
   * ندارد.  بدون این مسیر، رمز پیش‌فرض `admin123` عملاً غیرقابل تغییر
   * می‌ماند — هشداری که هیچ راه رفعی ندارد.
   */
  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.findUser('id', userId);
    if (!user) throw new UnauthorizedException('کاربر یافت نشد');

    if (!(await bcrypt.compare(dto.currentPassword, user.password))) {
      // پیام عمداً مبهم نیست: کاربر وارد شده و می‌داند کیست؛ ابهام اینجا
      // فقط او را سردرگم می‌کند بی‌آنکه چیزی را امن‌تر کند.
      throw new UnauthorizedException('رمز فعلی درست نیست');
    }

    if (await bcrypt.compare(dto.newPassword, user.password)) {
      throw new BadRequestException('رمز تازه با رمز فعلی یکی است');
    }

    // ⚠️ `passwordChangedAt` همراه رمز نوشته می‌شود، در همان دستور.
    //
    //    نگهبانِ JWT این ستون را با `iat` توکن می‌سنجد و هر توکنِ
    //    قدیمی‌تر را رد می‌کند.  بدونش، تغییر رمز فقط جلوی **ورودِ
    //    تازه** را می‌گرفت و نشست‌های باز — از جمله نشستِ مهاجم — تا
    //    هفت روز زنده می‌ماندند.
    await this.db.query(
      `UPDATE "User"
          SET password = $1, "passwordChangedAt" = now(), "updatedAt" = now()
        WHERE id = $2`,
      [await bcrypt.hash(dto.newPassword, 10), userId],
    );

    // ⚠️ توکنِ تازه برگردانده می‌شود، عمداً.
    //
    //    نگهبان هر توکنِ صادرشده پیش از `passwordChangedAt` را باطل
    //    می‌کند — از جمله توکنِ خودِ همین درخواست.  بدون توکنِ تازه،
    //    کاربر لحظه‌ای پس از عوض کردنِ رمز از سامانه بیرون می‌افتاد.
    //
    //    نسخهٔ اول به‌جای این، در نگهبان یک ثانیه ارفاق می‌داد — و
    //    همان یک ثانیه یک حفره بود: توکنی که ۰٫۴۹ ثانیه پیش از
    //    «خروج از همهٔ دستگاه‌ها» صادر شده بود، زنده می‌ماند.
    //
    //    امنیت را نباید با ارفاقِ زمانی درست کرد؛ باید علتِ نیاز به
    //    ارفاق را برداشت.
    const fresh = await this.findUser('id', userId);
    return {
      changed: true,
      ...(fresh ? this.buildAuthResponse(fresh) : {}),
    };
  }

  private async findUser(field: 'id' | 'email', value: string): Promise<UserRow | undefined> {
    const rows = await this.db.query<UserRow>(
      `SELECT id, "firstName", "lastName", email, phone, password, role, status, avatar,
              "companyId", "createdAt", "lockedUntil", "mfaSecret", "mfaEnabledAt",
              GREATEST("passwordChangedAt", "sessionsRevokedAt") AS "validFrom"
       FROM "User" WHERE ${field === 'id' ? 'id' : 'email'} = $1`,
      [value],
    );
    return rows[0];
  }

  private refreshSecret(): string {
    const refreshSecret = this.configService.get<string>('JWT_REFRESH_SECRET');
    if (refreshSecret) return refreshSecret;
    const jwtSecret = this.configService.get<string>('JWT_SECRET');
    if (!jwtSecret) throw new Error('JWT_SECRET is required');
    return `${jwtSecret}_refresh`;
  }

  private buildAuthResponse(user: Pick<UserRow, 'id' | 'firstName' | 'lastName' | 'email' | 'role' | 'companyId'>) {
    // ⚠️ `iatMs` — لحظهٔ صدور با دقتِ **میلی‌ثانیه**.
    //
    //    `iat` استانداردِ JWT رزولوشنِ **ثانیه** دارد، ولی
    //    `passwordChangedAt` و `sessionsRevokedAt` میلی‌ثانیه‌اند.
    //    مقایسهٔ این دو با هم یک اشکالِ زمان‌وابسته می‌سازد که فقط
    //    گاهی دیده می‌شود:
    //
    //      تغییر رمز در ۱۰:۰۰:۰۵٫۷۰۰
    //      ورودِ بلافاصله بعدش -> iat = ۱۰:۰۰:۰۵  (بریده شده)
    //      سنجش: ۰۵٫۰۰۰ < ۰۵٫۷۰۰  ->  توکنِ **سالم** باطل اعلام شد
    //
    //    یعنی کاربری که رمزش را عوض می‌کرد، گاهی بلافاصله بیرون
    //    انداخته می‌شد — و گاهی نه، بسته به کسرِ ثانیه.  در آزمونِ
    //    سه‌دوره فقط دورِ دوم می‌افتاد.
    //
    //    نسخهٔ اول این را با یک ثانیه ارفاق پوشانده بود، که خودش
    //    حفره بود: توکنی که ۰٫۴۹ ثانیه **پیش از** ابطال صادر شده
    //    بود، با ارفاق زنده می‌ماند.
    //
    //    درمانِ درست پوشاندن نیست — برداشتنِ حدس است.  توکن را خودمان
    //    امضا می‌کنیم، پس دقتِ لازم را خودمان می‌گذاریم.
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      companyId: user.companyId,
      iatMs: Date.now(),
    };
    return {
      accessToken: this.jwtService.sign(payload),
      refreshToken: this.jwtService.sign(payload, {
        secret: this.refreshSecret(),
        expiresIn: (this.configService.get<string>('JWT_REFRESH_EXPIRES_IN') || '30d') as never,
      }),
      user,
    };
  }
}

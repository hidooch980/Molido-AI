import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { DatabaseService } from '../database/database.service';

type JwtPayload = {
  sub: string;
  email: string;
  role: string;
  companyId: string | null;
  /** زمان صدور با رزولوشنِ **ثانیه** — استانداردِ JWT. */
  iat: number;
  /**
   * زمان صدور با رزولوشنِ **میلی‌ثانیه** — افزودهٔ خودمان.
   *
   * ⚠️ اختیاری است، چون توکن‌هایی که پیش از این تغییر صادر شده‌اند
   *    آن را ندارند و تا سی روز (عمرِ توکنِ نوسازی) در گردش‌اند.
   */
  iatMs?: number;
};

type UserState = {
  status: string;
  /**
   * دیرترینِ «تغییر رمز» و «خروج از همهٔ دستگاه‌ها».
   *
   * ⚠️ دو ستونِ جدا در پایگاه داده‌اند و اینجا با `GREATEST` یکی
   *    می‌شوند.  معنایشان فرق دارد ولی اثرشان یکی است: هر توکنِ
   *    قدیمی‌تر از این لحظه باطل است.
   */
  validFrom: Date | null;
  role: string;
  companyId: string | null;
};

/**
 * ⚠️ این نگهبان حالا به پایگاه داده می‌زند.  عمدی است.
 *
 *    پیش از این فقط محتوای توکن را برمی‌گرداند — یعنی توکنِ امضاشده
 *    تا لحظهٔ انقضا معتبر بود، **هرچه هم که بعدش اتفاق می‌افتاد**.
 *
 *    دو حفره از همین یک ریشه، هر دو با آزمون زنده تأیید شدند:
 *
 *      **۱) تغییر رمز نشست‌ها را باطل نمی‌کرد**
 *         کاربر رمز را عوض می‌کرد -> {"changed":true}
 *         ورود با رمز قدیمی -> ۴۰۱  (درست)
 *         ولی توکنِ قدیمی روی /users -> **۲۰۰**
 *
 *      **۲) غیرفعال کردن کاربر بیرونش نمی‌کرد**
 *         وضعیت -> INACTIVE، ورود تازه -> ۴۰۱  (درست)
 *         ولی توکنِ موجود روی /users -> **۲۰۰**
 *
 *    عمر توکن **۷ روز** است.  یعنی کارمندی که اخراج شده یا حسابی که
 *    لو رفته، تا یک هفته دسترسی داشت — و مدیر فکر می‌کرد بسته است.
 *
 *    این دقیقاً برعکسِ کاری است که کاربر باور دارد انجام داده.
 *
 * ⚠️ هزینه‌اش یک پرس‌وجو به‌ازای هر درخواست است.
 *
 *    وسوسه‌اش هست که کش شود، ولی کشِ مجوز همان مسئله را برمی‌گرداند:
 *    پنجره‌ای که در آن کاربرِ بسته هنوز باز است.  این پرس‌وجو روی
 *    کلید اصلی است و ارزانِ ارزان.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly db: DatabaseService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: JwtStrategy.requireSecret(configService),
    });
  }

  private static requireSecret(configService: ConfigService): string {
    const secret = configService.get<string>('JWT_SECRET');

    if (!secret) {
      throw new Error(
        'JWT_SECRET is required. Set it in your .env file (e.g. openssl rand -hex 32).',
      );
    }

    return secret;
  }

  async validate(payload: JwtPayload) {
    const rows = await this.db.query<UserState>(
      `SELECT status, role, "companyId",
              GREATEST("passwordChangedAt", "sessionsRevokedAt") AS "validFrom"
         FROM "User" WHERE id = $1`,
      [payload.sub],
    );

    const user = rows[0];

    // کاربرِ حذف‌شده: توکنش امضای معتبر دارد ولی پشتش کسی نیست.
    if (!user) throw new UnauthorizedException('حساب کاربری یافت نشد');

    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedException('حساب کاربری غیرفعال است');
    }

    // ⚠️ تهی یعنی «هرگز عوض نشده» — نه «همین الان».
    //
    //    مهاجرت عمداً مقدارِ اولیه نمی‌گذارد: اگر `now()` می‌گذاشت،
    //    همهٔ کاربران در لحظهٔ استقرار از سامانه بیرون می‌افتادند.
    //
    //    `GREATEST` در SQL با تهی کنار می‌آید: اگر یکی تهی باشد،
    //    دیگری برمی‌گردد؛ اگر هر دو تهی باشند، تهی.
    if (user.validFrom) {
      // ⚠️ **بدون ارفاق**.  نسخهٔ اول یک ثانیه ارفاق می‌داد و همان
      //    یک ثانیه یک حفره بود.
      //
      //    اندازه‌گیری‌شده: توکنی که ۰٫۴۹ ثانیه **پیش از** «خروج از
      //    همهٔ دستگاه‌ها» صادر شده بود، با ارفاق به یک ثانیه **پس
      //    از** آن می‌رفت و زنده می‌ماند.  یعنی کاربری که دکمهٔ خروج
      //    را می‌زد، توکنِ تازه‌اش باطل نمی‌شد.
      //
      //    ارفاق برای این بود که تغییر رمز، توکنِ خودِ درخواست‌کننده
      //    را نکشد.  ولی راهش این نیست — راهش این است که
      //    `changePassword` توکنِ تازه برگرداند، که حالا برمی‌گرداند.
      //
      //    امنیت را نباید با ارفاقِ زمانی درست کرد؛ باید علتِ نیاز به
      //    ارفاق را برداشت.
      // ⚠️ لحظهٔ صدور با دقتِ میلی‌ثانیه، نه بریده به ثانیه.
      //
      //    `iat` استاندارد رزولوشنِ ثانیه دارد و `validFrom`
      //    میلی‌ثانیه.  سنجشِ مستقیمشان یعنی توکنی که در همان ثانیهٔ
      //    ابطال ولی **پس از** آن صادر شده، به اشتباه باطل شود —
      //    دقیقاً همان چیزی که کاربر پس از تغییر رمز تجربه می‌کرد.
      //
      //    برای توکن‌های قدیمی که `iatMs` ندارند، به **ثانیهٔ بعد**
      //    گرد می‌شود، نه ثانیهٔ جاری.  یعنی در حالتِ مبهم به سمتِ
      //    **بستن** خطا می‌کنیم، نه باز گذاشتن: توکنِ قدیمیِ مشکوک
      //    باطل می‌شود و کاربر دوباره وارد می‌شود.  ارفاق در جهتِ
      //    عکس، همان حفره‌ای است که برداشتیم.
      const issuedMs = payload.iatMs ?? (payload.iat + 1) * 1000;

      if (issuedMs < user.validFrom.getTime()) {
        throw new UnauthorizedException('نشست باطل شده — دوباره وارد شوید');
      }
    }

    // ⚠️ نقش و شرکت از **پایگاه داده** می‌آیند، نه از توکن.
    //
    //    وگرنه کارمندی که به سرپرست ارتقا یافته تا هفت روز کارمند
    //    می‌ماند، و — مهم‌تر — سرپرستی که تنزل یافته تا هفت روز
    //    سرپرست می‌ماند.
    return {
      userId: payload.sub,
      email: payload.email,
      role: user.role,
      companyId: user.companyId,
    };
  }
}

import { randomBytes, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import { DatabaseService } from '../database/database.service';
import { runAsSystem, runInTenant } from '../database/tenant-context';
import { OidcGovSsoProvider } from './gov-sso.provider';
import { GovAudience, GovIdentity } from './gov-sso.types';

type StateRow = {
  id: string;
  state: string;
  nonce: string;
  codeVerifier: string;
  audience: GovAudience;
  redirectTo: string | null;
  usedAt: Date | null;
};

/** مهلتِ کوتاه: کاربر یا همین حالا وارد می‌شود یا از اول شروع می‌کند. */
const STATE_TTL_MS = 10 * 60 * 1000;

@Injectable()
export class GovSsoService {
  constructor(
    private readonly db: DatabaseService,
    private readonly provider: OidcGovSsoProvider,
  ) {}

  isConfigured(): boolean {
    return this.provider.isConfigured();
  }

  /**
   * شروعِ جریان.
   *
   * ⚠️ `audience` روی همین سطر قفل می‌شود.
   *
   *    اگر در بازگشت از پارامترِ درخواست خوانده می‌شد، کسی می‌توانست
   *    جریان را با `citizen` شروع کند و در callback بنویسد `staff` —
   *    یعنی با حسابِ شخصیِ دولتی‌اش به پنلِ مدیریت برسد.
   */
  async start(input: {
    audience: GovAudience;
    redirectTo?: string | null;
  }): Promise<{ url: string }> {
    const state = randomBytes(24).toString('base64url');
    const nonce = randomBytes(24).toString('base64url');
    const codeVerifier = OidcGovSsoProvider.newVerifier();

    // نشانی پیش از ثبتِ سطر ساخته می‌شود: اگر پیکربندی ناقص باشد،
    // خطا می‌دهد و سطرِ بی‌مصرفی جا نمی‌ماند.
    const url = this.provider.authorizeUrl({
      state,
      nonce,
      codeChallenge: OidcGovSsoProvider.challengeFor(codeVerifier),
    });

    await runAsSystem(() =>
      this.db.execute(
        `INSERT INTO "GovSsoState"
           (id, state, nonce, "codeVerifier", audience, "redirectTo", "expiresAt")
         VALUES ($1, $2, $3, $4, $5, $6, now() + interval '${STATE_TTL_MS} milliseconds')`,
        [
          randomUUID(),
          state,
          nonce,
          codeVerifier,
          input.audience,
          // ⚠️ فقط مسیرِ نسبی پذیرفته می‌شود؛ دلیلش در `safeRedirect`.
          safeRedirect(input.redirectTo),
        ],
      ),
    );

    return { url };
  }

  /**
   * مصرفِ `state` — **یک‌بارمصرف و اتمی**.
   *
   * ⚠️ شرطِ `usedAt IS NULL` داخلِ همان `UPDATE` است، نه یک `SELECT`
   *    جدا.  با خواندنِ جدا، دو بازگشتِ هم‌زمان هر دو سطر را
   *    «استفاده‌نشده» می‌دیدند و هر دو رد می‌شدند — بازپخش دقیقاً همین
   *    است.
   */
  private async consumeState(state: string): Promise<StateRow> {
    const rows = await runAsSystem(() =>
      this.db.query<StateRow>(
        `UPDATE "GovSsoState"
            SET "usedAt" = now()
          WHERE state = $1 AND "usedAt" IS NULL AND "expiresAt" > now()
        RETURNING id, state, nonce, "codeVerifier", audience, "redirectTo", "usedAt"`,
        [state],
      ),
    );

    if (!rows[0]) {
      // پیام عمداً یکسان است برای «نبود»، «مصرف‌شده» و «منقضی»:
      // تفکیکشان به مهاجم می‌گوید کدام حدسش نزدیک بوده.
      throw new UnauthorizedException('درخواست ورود معتبر نیست یا منقضی شده است');
    }
    return rows[0];
  }

  /** پاک‌سازیِ سطرهای مرده — از مسیرِ شروع، بی‌نیاز به زمان‌بند. */
  private async sweep(): Promise<void> {
    await runAsSystem(() =>
      this.db.execute(
        `DELETE FROM "GovSsoState" WHERE "expiresAt" < now() - interval '1 day'`,
      ),
    ).catch(() => undefined);
  }

  /**
   * بازگشت از درگاه: راستی‌آزمایی و یافتنِ حساب.
   *
   * خروجی فقط **هویتِ محلی** است؛ صدورِ توکن کارِ لایهٔ بالاتر است تا
   * قواعدِ موجودِ ورود (ثبتِ تلاش، قفل، MFA) دور زده نشود.
   */
  async complete(input: { code: string; state: string }): Promise<{
    audience: GovAudience;
    identity: GovIdentity;
    row: StateRow;
  }> {
    if (!input.code || !input.state) {
      throw new BadRequestException('پاسخ درگاه ناقص است');
    }

    const row = await this.consumeState(input.state);
    void this.sweep();

    const exchange = await this.provider.exchangeCode({
      code: input.code,
      codeVerifier: row.codeVerifier,
    });

    // ⚠️ `nonce` وقتی بررسی می‌شود که ارائه‌دهنده داده باشد.
    //
    //    نبودنش دلیلِ رد نیست — همهٔ ارائه‌دهنده‌ها `id_token`
    //    نمی‌دهند — ولی بودنِ مقدارِ **نادرست** حتماً دلیلِ رد است:
    //    یعنی پاسخ برای درخواستِ دیگری بوده.
    const claimedNonce = exchange.idTokenClaims?.nonce;
    if (typeof claimedNonce === 'string' && claimedNonce !== row.nonce) {
      throw new UnauthorizedException('پاسخ درگاه با درخواست هم‌خوان نیست');
    }

    const identity = await this.provider.fetchIdentity(exchange.accessToken);
    return { audience: row.audience, identity, row };
  }

  /**
   * یافتنِ کاربرِ پنل.
   *
   * ⚠️ **هرگز کاربرِ تازه نمی‌سازد.**  مهم‌ترین تصمیمِ این ماژول.
   *
   *    درگاهِ دولت برای هر شهروندی حساب دارد.  اگر ورودِ ناموفق به
   *    ساختِ کاربر منجر شود، هر کسی در کشور می‌تواند به پنلِ مدیریتِ
   *    شهرداری وارد شود — یعنی کلِ سامانهٔ نقش‌ها بی‌معنی می‌شود.
   *
   *    پس اتصال باید **از قبل** برقرار شده باشد: یا `govSubject` روی
   *    کاربر نشسته، یا مدیر کد ملیِ او را در پرونده‌اش ثبت کرده.
   *
   * ⚠️ اتصالِ خودکار با کد ملی فقط **یک بار** و فقط وقتی کاربر هنوز
   *    `govSubject` ندارد.  پس از آن، `sub` مرجع است.
   */
  async resolveStaff(identity: GovIdentity, companyId: string | null) {
    type UserRow = {
      id: string;
      firstName: string;
      lastName: string;
      email: string;
      role: string;
      companyId: string;
      /**
       * ⚠️ `status`، نه `isActive`.
       *
       *    نسخهٔ اول این را `isActive` نوشت — ستونی که روی `User`
       *    وجود ندارد (روی `Customer` هست).  `tsc` چیزی نگفت چون
       *    SQL خام است، و خطا فقط در اجرای واقعیِ جریان دیده شد:
       *    `column "isActive" does not exist`.
       *
       *    `auth.service.ts:156` همین سنجه را با `status !== 'ACTIVE'`
       *    می‌زند و اینجا هم باید همان باشد — دو تعریف از «کاربرِ
       *    فعال» یعنی روزی یکی‌شان عقب می‌ماند.
       */
      status: string;
      govSubject: string | null;
    };

    const find = (sql: string, values: unknown[]) =>
      runAsSystem(() => this.db.query<UserRow>(sql, values));

    const scope = companyId ? 'AND "companyId" = $2' : '';
    const scopeValues = companyId ? [companyId] : [];

    let rows = await find(
      `SELECT id, "firstName", "lastName", email, role, "companyId", status, "govSubject"
         FROM "User" WHERE "govSubject" = $1 ${scope} LIMIT 2`,
      [identity.subject, ...scopeValues],
    );

    if (!rows.length && identity.nationalCode) {
      rows = await find(
        `SELECT id, "firstName", "lastName", email, role, "companyId", status, "govSubject"
           FROM "User"
          WHERE "nationalCode" = $1 AND "govSubject" IS NULL ${scope}
          LIMIT 2`,
        [identity.nationalCode, ...scopeValues],
      );
    }

    if (!rows.length) {
      throw new ForbiddenException(
        'حساب کاربری متناظری در این سامانه یافت نشد. مدیر باید ابتدا حساب شما را ایجاد و کد ملی‌تان را ثبت کند.',
      );
    }

    // ⚠️ بیش از یک تطبیق یعنی داده مبهم است — انتخابِ خودکار یعنی
    //    ممکن است کسی به حسابِ فردِ دیگری وارد شود.
    if (rows.length > 1) {
      throw new ForbiddenException(
        'بیش از یک حساب با این مشخصات یافت شد؛ با مدیر سامانه تماس بگیرید.',
      );
    }

    const user = rows[0];
    if (user.status !== 'ACTIVE') {
      throw new ForbiddenException('حساب کاربری شما غیرفعال است');
    }

    if (!user.govSubject) {
      await runInTenant({ companyId: user.companyId, userId: null }, () =>
        this.db.execute('UPDATE "User" SET "govSubject" = $1 WHERE id = $2', [
          identity.subject,
          user.id,
        ]),
      );
    }

    return user;
  }

  /**
   * یافتن یا ساختنِ مشتری/شهروند.
   *
   * ⚠️ اینجا ساختِ خودکار **درست** است و در `resolveStaff` نبود.
   *
   *    مشتری و شهروند حسابِ خودسرویس دارند؛ همین حالا هم می‌توانند با
   *    شمارهٔ تلفن ثبت‌نام کنند.  ورودِ دولتی فقط راهِ مطمئن‌تری برای
   *    همان کار است.  کارمند اما دسترسیِ اعطایی دارد، نه خودسرویس.
   */
  async resolveCustomer(identity: GovIdentity, companyId: string) {
    type CustomerRow = {
      id: string;
      companyId: string;
      phone: string;
      isActive: boolean;
    };

    const inTenant = <T>(work: () => Promise<T>) =>
      runInTenant({ companyId, userId: null }, work);

    let rows = await inTenant(() =>
      this.db.query<CustomerRow>(
        `SELECT id, "companyId", phone, "isActive"
           FROM "Customer" WHERE "govSubject" = $1 AND "companyId" = $2 LIMIT 1`,
        [identity.subject, companyId],
      ),
    );

    // اتصالِ یک‌بارهٔ پروندهٔ موجود — با کد ملی، سپس با موبایل.
    if (!rows.length && identity.nationalCode) {
      rows = await inTenant(() =>
        this.db.query<CustomerRow>(
          `SELECT id, "companyId", phone, "isActive"
             FROM "Customer"
            WHERE "nationalCode" = $1 AND "govSubject" IS NULL AND "companyId" = $2
            LIMIT 2`,
          [identity.nationalCode, companyId],
        ),
      );
      if (rows.length > 1) {
        throw new ForbiddenException('بیش از یک پرونده با این کد ملی وجود دارد');
      }
    }

    if (!rows.length && identity.mobile) {
      rows = await inTenant(() =>
        this.db.query<CustomerRow>(
          `SELECT id, "companyId", phone, "isActive"
             FROM "Customer"
            WHERE phone = $1 AND "govSubject" IS NULL AND "companyId" = $2
            LIMIT 2`,
          [identity.mobile, companyId],
        ),
      );
      if (rows.length > 1) {
        throw new ForbiddenException('بیش از یک پرونده با این شماره وجود دارد');
      }
    }

    if (rows.length) {
      const found = rows[0];
      if (!found.isActive) {
        throw new ForbiddenException('حساب شما غیرفعال شده است');
      }
      await inTenant(() =>
        this.db.execute('UPDATE "Customer" SET "govSubject" = $1 WHERE id = $2', [
          identity.subject,
          found.id,
        ]),
      );
      return found;
    }

    // ⚠️ شماره‌ای که درگاه نداده، ساخته نمی‌شود.
    //
    //    `Customer.phone` الزامی است.  گذاشتنِ مقدارِ ساختگی یعنی
    //    پرونده‌ای که هرگز نمی‌شود با آن تماس گرفت — و بدتر، ممکن است
    //    با شمارهٔ واقعیِ فردِ دیگری تصادم کند.
    if (!identity.mobile) {
      throw new BadRequestException(
        'درگاه دولت شماره موبایل نداد؛ ثبت‌نام با شماره تلفن را استفاده کنید',
      );
    }

    const created = await inTenant(() =>
      this.db.query<CustomerRow>(
        `INSERT INTO "Customer"
           (id, "companyId", "firstName", "lastName", phone, "nationalCode", "govSubject", "isActive")
         VALUES ($1, $2, $3, $4, $5, $6, $7, true)
         RETURNING id, "companyId", phone, "isActive"`,
        [
          randomUUID(),
          companyId,
          identity.firstName ?? 'کاربر',
          identity.lastName ?? 'دولت‌من',
          identity.mobile,
          identity.nationalCode ?? null,
          identity.subject,
        ],
      ),
    );

    return created[0];
  }
}

/**
 * فقط مسیرِ نسبیِ داخلی.
 *
 * ⚠️ بدونِ این، `redirectTo` یک open redirect بود: مهاجم لینکِ
 *    «ورود با درگاه دولت» می‌فرستاد که پس از ورودِ **واقعی**، کاربر را
 *    به سایتِ خودش می‌برد — با ظاهرِ اینکه از سامانهٔ رسمی آمده.
 *
 *    `//evil.example` هم مسیرِ نسبی به نظر می‌رسد ولی مرورگر آن را
 *    نشانیِ بیرونی می‌خواند؛ پس دو اسلشِ آغازین هم رد می‌شود.
 */
function safeRedirect(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith('/')) return null;
  if (trimmed.startsWith('//')) return null;
  if (trimmed.includes('\\')) return null;
  return trimmed;
}

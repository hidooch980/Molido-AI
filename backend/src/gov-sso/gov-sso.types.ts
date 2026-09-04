/**
 * ورود با درگاه دولت — قرارداد.
 *
 * ⚠️ چرا لایهٔ آداپتور و نه فراخوانیِ مستقیم؟
 *
 *    همان استدلالِ `payment.types.ts`.  درگاهِ دولت تنها ارائه‌دهندهٔ
 *    ممکن نیست — شهرداری‌ها گاهی سامانهٔ استانیِ خودشان را دارند و
 *    نصب‌های آزمایشی به یک ارائه‌دهندهٔ ساختگی نیاز دارند.  اگر مسیرها
 *    مستقیم در سرویس بیایند، افزودنِ دومی یعنی بازنویسیِ همان سرویس.
 *
 * ⚠️ نشانی‌های نقاط **حدس زده نشده‌اند** و نباید بشوند.
 *
 *    مشخصاتِ دقیقِ `sso.my.gov.ir` (نوعِ flow، نامِ scopeها، نامِ
 *    ادعاها) در مستنداتِ رسمیِ یکپارچگی می‌آید که فقط به سازمانِ
 *    ثبت‌شده داده می‌شود.  نوشتنِ یک نشانیِ محتمل و رها کردنش یعنی
 *    کدی که در تولید می‌شکند و کسی نمی‌داند چرا.
 *
 *    پس همه از متغیرهای محیطی می‌آیند و نبودشان خطای روشن می‌دهد.
 */

/** هویتی که از درگاه برمی‌گردد — پس از راستی‌آزمایی. */
export type GovIdentity = {
  /**
   * شناسهٔ پایدارِ کاربر نزدِ ارائه‌دهنده (`sub` در OIDC).
   *
   * ⚠️ **این** مبنای اتصالِ حساب است، نه کد ملی.
   *
   *    کد ملی می‌تواند در پروندهٔ ما اشتباه وارد شده باشد یا اصلاً
   *    نباشد؛ `sub` چیزی است که ارائه‌دهنده تضمین می‌کند برای همیشه
   *    به همان فرد اشاره می‌کند.
   */
  subject: string;
  /** کد ملیِ **تأییدشده** — فقط از ادعاهای امضاشده، هرگز از ورودی کاربر. */
  nationalCode?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  mobile?: string | null;
};

/** نتیجهٔ تبادلِ کد — آنچه درگاه پس از بازگشت می‌دهد. */
export type GovTokenExchange = {
  accessToken: string;
  /** برای بررسیِ `nonce`؛ همهٔ ارائه‌دهنده‌ها نمی‌دهند. */
  idTokenClaims?: Record<string, unknown> | null;
};

export interface GovSsoProvider {
  /** آیا پیکربندی کامل است؟ بدونِ آن هیچ مسیری نباید کار کند. */
  isConfigured(): boolean;

  /** نشانیِ صفحهٔ ورودِ درگاه، با PKCE و state و nonce. */
  authorizeUrl(input: {
    state: string;
    nonce: string;
    codeChallenge: string;
  }): string;

  /** تبادلِ کد با توکن — همیشه از کانالِ پشتی، هرگز از مرورگر. */
  exchangeCode(input: {
    code: string;
    codeVerifier: string;
  }): Promise<GovTokenExchange>;

  /** خواندنِ هویت با توکنِ دسترسی. */
  fetchIdentity(accessToken: string): Promise<GovIdentity>;
}

/**
 * مخاطبِ ورود.
 *
 * ⚠️ این مقدار روی **سطرِ state** ذخیره می‌شود، نه در پارامترِ بازگشت.
 *
 *    اگر از پارامترِ callback خوانده می‌شد، کسی می‌توانست جریان را با
 *    `citizen` شروع کند و در بازگشت `staff` بنویسد — یعنی با حسابِ
 *    شخصیِ دولتی‌اش به پنلِ مدیریت برسد.
 */
export type GovAudience = 'staff' | 'citizen' | 'customer';

export const GOV_AUDIENCES: readonly GovAudience[] = ['staff', 'citizen', 'customer'];

export function isGovAudience(value: unknown): value is GovAudience {
  return typeof value === 'string' && (GOV_AUDIENCES as readonly string[]).includes(value);
}

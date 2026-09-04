/**
 * کوکیِ توکنِ نوسازی — `httpOnly`.
 *
 * ⚠️ چرا کوکی، وقتی همه‌جای این برنامه Bearer است؟
 *
 *    توصیهٔ چهارمِ `docs/AUTH.md` کوتاه کردنِ عمرِ توکنِ دسترسی بود
 *    (هفت روز خیلی زیاد است).  ولی کوتاه کردنش بدونِ راهِ نوسازی
 *    یعنی بیرون انداختنِ کاربر هر ساعت.
 *
 *    و راهِ نوسازیِ ساده — گذاشتنِ توکنِ نوسازی در `localStorage` —
 *    وضع را **بدتر** می‌کرد: XSS به‌جای هفت روز، سی روز می‌گرفت.
 *
 *    کوکیِ `httpOnly` تنها جایی است که جاوااسکریپت **نمی‌تواند**
 *    بخواندش.  یعنی حتی اگر مهاجم اسکریپت در صفحه اجرا کند، توکنِ
 *    سی‌روزه از دسترسش بیرون است.
 *
 * ⚠️ کوکی، CSRF را برمی‌گرداند — و اینجا سه لایه جلویش را می‌گیرد.
 *
 *    با Bearer، حملهٔ CSRF ساختاراً ناممکن بود: مرورگر هدر
 *    `Authorization` را خودکار نمی‌فرستد.  کوکی را می‌فرستد.
 *
 *      ۱) `SameSite=Strict` — مرورگر کوکی را در درخواستی که از سایتِ
 *         دیگری آغاز شده اصلاً نمی‌فرستد.
 *      ۲) `Path=/auth/refresh` — کوکی فقط به همین یک مسیر می‌رود، نه
 *         به هیچ مسیرِ دیگری از API.
 *      ۳) پاسخِ نوسازیِ کوکی‌محور **توکنِ نوسازیِ تازه را در بدنه
 *         برنمی‌گرداند** (پایین‌تر).  پس مهاجمی که با CSRF نوسازی را
 *         تحریک کند، چیزی به دست نمی‌آورد: پاسخ را نمی‌تواند بخواند
 *         (Same-Origin Policy) و کوکیِ تازه هم دستش نیست.
 */

/** نامِ کوکی. تغییرش یعنی خروجِ همهٔ کاربران — عمداً ثابت. */
export const REFRESH_COOKIE = 'molido_rt';

/** فقط همین مسیر کوکی را می‌بیند. */
export const REFRESH_PATH = '/auth/refresh';

type CookieCarrier = {
  headers?: Record<string, string | string[] | undefined>;
};

type HeaderSetter = {
  setHeader: (name: string, value: string | string[]) => void;
  getHeader?: (name: string) => string | string[] | number | undefined;
};

/**
 * خواندنِ کوکی از هدرِ خام.
 *
 * ⚠️ عمداً بدون `cookie-parser`.
 *
 *    یک وابستگیِ تازه برای خواندنِ یک مقدار، هزینه‌اش از فایده‌اش
 *    بیشتر است — به‌ویژه در مسیری که امنیت روی آن سوار است.
 */
export function readRefreshCookie(req: CookieCarrier): string | null {
  const raw = req.headers?.cookie;
  const header = Array.isArray(raw) ? raw[0] : raw;
  if (!header) return null;

  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() !== REFRESH_COOKIE) continue;
    const value = part.slice(eq + 1).trim();
    return value ? decodeURIComponent(value) : null;
  }

  return null;
}

/**
 * ⚠️ `Secure` فقط روی HTTPS.
 *
 *    مرورگر کوکیِ `Secure` را روی `http://` **دور می‌اندازد** — بی‌هیچ
 *    خطایی.  یعنی اگر همیشه بگذاریمش، نصبِ محلی و شبکهٔ داخلی (که
 *    HTTPS ندارند) بی‌صدا از کار می‌افتند: کاربر وارد می‌شود، کوکی
 *    نمی‌نشیند، و ساعتی بعد بیرون انداخته می‌شود بی‌آنکه کسی بفهمد
 *    چرا.
 *
 *    و برعکسش هم بد است: روی HTTPS بدونِ `Secure`، کوکی روی یک
 *    درخواستِ `http` لو می‌رود.
 *
 *    پس از خودِ درخواست تشخیص داده می‌شود، نه از حدس.
 */
function isSecure(req: CookieCarrier): boolean {
  const proto = req.headers?.['x-forwarded-proto'];
  const first = Array.isArray(proto) ? proto[0] : proto;
  return (first ?? '').split(',')[0]?.trim() === 'https';
}

function append(res: HeaderSetter, cookie: string): void {
  const existing = res.getHeader?.('Set-Cookie');
  if (existing === undefined) {
    res.setHeader('Set-Cookie', cookie);
    return;
  }
  const list = Array.isArray(existing) ? existing : [String(existing)];
  res.setHeader('Set-Cookie', [...list, cookie]);
}

/** روزهای عمرِ کوکی — همان عمرِ توکنِ نوسازی. */
const MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export function setRefreshCookie(
  req: CookieCarrier,
  res: HeaderSetter,
  token: string,
): void {
  append(
    res,
    [
      `${REFRESH_COOKIE}=${encodeURIComponent(token)}`,
      `Path=${REFRESH_PATH}`,
      `Max-Age=${MAX_AGE_SECONDS}`,
      'HttpOnly',
      'SameSite=Strict',
      ...(isSecure(req) ? ['Secure'] : []),
    ].join('; '),
  );
}

/**
 * پاک کردنِ کوکی.
 *
 * ⚠️ `Path` باید **دقیقاً** همان باشد که موقع نشاندن بود.
 *
 *    مرورگر کوکی را با سه‌تاییِ (نام، دامنه، مسیر) می‌شناسد.  پاک
 *    کردن با مسیرِ متفاوت، کوکیِ اصلی را دست‌نخورده می‌گذارد و فقط یک
 *    کوکیِ خالیِ تازه می‌سازد — یعنی «خروج» ظاهراً کار می‌کند و توکن
 *    سی روز زنده می‌ماند.
 */
export function clearRefreshCookie(res: HeaderSetter): void {
  append(
    res,
    `${REFRESH_COOKIE}=; Path=${REFRESH_PATH}; Max-Age=0; HttpOnly; SameSite=Strict`,
  );
}

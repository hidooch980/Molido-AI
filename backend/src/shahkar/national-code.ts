/**
 * اعتبارسنجیِ کد ملیِ ایران — **پیش از** هر تماسِ بیرونی.
 *
 * ⚠️ چرا محلی و نه سپردنش به شاهکار؟
 *
 *    هر استعلامِ شاهکار هزینه دارد و سهمیهٔ روزانه‌اش محدود است.  کدِ
 *    ملیِ بدریخت — غلطِ تایپی، ده رقم نبودن، رقمِ کنترلیِ نادرست —
 *    قطعاً رد می‌شود؛ فرستادنش فقط سهمیه می‌سوزاند و کاربر را منتظر
 *    نگه می‌دارد تا همان «نامعتبر» را از سرورِ دیگری بشنود.
 *
 * ⚠️ الگوریتم رقمِ کنترلی است، نه فهرستِ کدهای واقعی.
 *
 *    یعنی می‌گوید «این عدد **می‌تواند** کد ملی باشد»، نه «این کد ملیِ
 *    فلانی است».  تنها شاهکار می‌تواند دومی را بگوید.  خلط کردنِ این
 *    دو یعنی تصورِ احرازِ هویتی که انجام نشده.
 */

/**
 * کدهای تک‌رقمیِ تکراری (`0000000000` تا `9999999999`).
 *
 * ⚠️ این‌ها در الگوریتمِ رقمِ کنترلی **درست** از آب درمی‌آیند.
 *    بدونِ این استثنا، `1111111111` معتبر شمرده می‌شد — و همان چیزی
 *    است که آدم موقعِ پر کردنِ فرمِ اجباری تایپ می‌کند.
 */
const REPEATED = new Set(
  Array.from({ length: 10 }, (_, d) => String(d).repeat(10)),
);

/** ارقامِ فارسی و عربی به لاتین. */
export function toLatinDigits(input: string): string {
  return input.replace(/[۰-۹٠-٩]/g, (ch) => {
    const code = ch.charCodeAt(0);
    const base = code >= 0x06f0 ? 0x06f0 : 0x0660;
    return String(code - base);
  });
}

/**
 * ریختِ استانداردِ کد ملی: ده رقمِ لاتین.
 *
 * ⚠️ صفرهای ابتدایی حفظ می‌شوند.
 *
 *    کد ملیِ بعضی استان‌ها با صفر شروع می‌شود.  تبدیل به عدد — که
 *    وسوسه‌کننده است — آن صفر را می‌خورَد و کد را نُه‌رقمی می‌کند.
 */
export function normalizeNationalCode(input: unknown): string {
  const raw = toLatinDigits(String(input ?? '')).replace(/\D/g, '');
  if (!raw) return '';
  // کوتاه‌ترها با صفر پر می‌شوند: `۱۲۳۴۵۶۷۸۹` در عمل `0123456789` است.
  return raw.length < 10 ? raw.padStart(10, '0') : raw;
}

/** رقمِ کنترلی درست است؟ */
export function isValidNationalCode(input: unknown): boolean {
  const code = normalizeNationalCode(input);
  if (!/^\d{10}$/.test(code)) return false;
  if (REPEATED.has(code)) return false;

  let sum = 0;
  for (let i = 0; i < 9; i += 1) sum += Number(code[i]) * (10 - i);

  const remainder = sum % 11;
  const check = Number(code[9]);

  return remainder < 2 ? check === remainder : check === 11 - remainder;
}

/**
 * ریختِ استانداردِ موبایل: `09xxxxxxxxx`.
 *
 * ⚠️ شکل‌های `+98`، `0098` و `9xxxxxxxxx` همه یک شماره‌اند.
 *
 *    اگر یکدست نشوند، حافظهٔ نتایج بی‌فایده می‌شود: یک شماره با سه
 *    ریختِ مختلف سه بار استعلام می‌خورد و سه ردیف می‌سازد.
 */
export function normalizeMobile(input: unknown): string {
  let digits = toLatinDigits(String(input ?? '')).replace(/\D/g, '');

  if (digits.startsWith('0098')) digits = digits.slice(4);
  else if (digits.startsWith('98') && digits.length === 12) digits = digits.slice(2);

  if (digits.length === 10 && digits.startsWith('9')) digits = `0${digits}`;

  return digits;
}

/** موبایلِ ایرانیِ معتبر؟ */
export function isValidMobile(input: unknown): boolean {
  return /^09\d{9}$/.test(normalizeMobile(input));
}

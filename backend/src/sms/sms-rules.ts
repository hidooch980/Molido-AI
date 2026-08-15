/**
 * قاعده‌های پیامک — عمداً خالص و بدون دیتابیس.
 *
 * هزینهٔ اشتباه اینجا بالاست: یک خطای شمارش نویسه یعنی هر پیام دو قبض
 * حساب می‌شود، و یک خطای نرمال‌سازی شماره یعنی هزار پیامک به جایی
 * نمی‌رسد.  هر دو فقط در صورتحساب ماه بعد معلوم می‌شوند، پس باید پیش
 * از ارسال آزموده شوند.
 */

/** شمارهٔ موبایل ایران پس از نرمال‌سازی: ۱۱ رقم با شروع ۰۹. */
const IRAN_MOBILE = /^09\d{9}$/;

const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

/**
 * ارقام فارسی و عربی را به لاتین تبدیل می‌کند.
 *
 * مشتری شماره‌اش را با کیبورد فارسی وارد می‌کند و «۰۹۱۲…» می‌نویسد؛
 * بدون این تبدیل، هیچ‌کدام از آن شماره‌ها معتبر شناخته نمی‌شوند.
 */
export function toLatinDigits(value: string): string {
  return value.replace(/[۰-۹٠-٩]/g, (d) => {
    const fa = PERSIAN_DIGITS.indexOf(d);
    if (fa >= 0) return String(fa);
    return String(ARABIC_DIGITS.indexOf(d));
  });
}

/**
 * شماره را به شکل استاندارد `09xxxxxxxxx` درمی‌آورد، یا `null` اگر
 * موبایل ایران نباشد.
 *
 * شکل‌های پذیرفته‌شده:  ۰۹۱۲۱۲۳۴۵۶۷ · 09121234567 · 9121234567 ·
 * +989121234567 · 00989121234567 · 0912-123-4567 · «0912 123 4567»
 */
export function normalizePhone(input: unknown): string | null {
  if (input === null || input === undefined) return null;

  let text = toLatinDigits(String(input)).trim();

  // جداکننده‌های رایج؛ خط تیره و فاصله و پرانتز در کپی‌پیست فراوان‌اند.
  text = text.replace(/[\s\-()._]/g, '');

  if (text.startsWith('+98')) text = `0${text.slice(3)}`;
  else if (text.startsWith('0098')) text = `0${text.slice(4)}`;
  else if (text.startsWith('98') && text.length === 12) text = `0${text.slice(2)}`;
  else if (text.startsWith('9') && text.length === 10) text = `0${text}`;

  return IRAN_MOBILE.test(text) ? text : null;
}

/**
 * جای‌گذاری متغیرها در قالب.
 *
 * متغیر ناشناخته **خالی** می‌شود، نه اینکه `{name}` در پیام بماند —
 * دیدن «سلام {name} عزیز» روی گوشی مشتری بدتر از دیدن «سلام عزیز» است.
 */
export function renderTemplate(
  body: string,
  vars: Record<string, string | number | null | undefined>,
): string {
  return body
    .replace(/\{(\w+)\}/g, (_, key: string) => {
      const value = vars[key];
      return value === null || value === undefined ? '' : String(value);
    })
    // جای‌گذاریِ خالی، فاصله‌های دوتایی می‌سازد
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/**
 * تعداد قبض یک پیام.
 *
 * اپراتور فارسی را UCS-2 می‌فرستد: ۷۰ نویسه در تک‌پیام، و ۶۷ در هر
 * بخش وقتی چندبخشی شود (۳ نویسه صرف سرآیند پیوستن می‌شود).  متن لاتین
 * GSM-7 است: ۱۶۰ و ۱۵۳.
 *
 * چرا مهم است: پیامی که یک نویسه از مرز رد شود، هزینه‌اش **دو برابر**
 * می‌شود.  روی هزار مشتری یعنی هزار پیامک اضافه در صورتحساب.
 */
export function segmentCount(message: string): number {
  if (!message) return 0;

  const unicode = [...message].some((ch) => (ch.codePointAt(0) ?? 0) > 127);
  const single = unicode ? 70 : 160;
  const multi = unicode ? 67 : 153;

  // طول واقعی به واحد کد UTF-16؛ اموجی دو واحد می‌گیرد و اپراتور هم
  // همان را می‌شمارد.
  const length = message.length;

  if (length <= single) return 1;
  return Math.ceil(length / multi);
}

export type Recipient = {
  customerId?: string | null;
  phone: unknown;
  smsOptOut?: boolean | null;
  name?: string | null;
};

export type Prepared = {
  customerId: string | null;
  phone: string;
  body: string;
  segments: number;
};

export type Skipped = {
  customerId: string | null;
  phone: string;
  reason: 'OPTED_OUT' | 'INVALID_PHONE' | 'DUPLICATE';
};

/**
 * مخاطبان را به دو دستهٔ «بفرست» و «نفرست» تقسیم می‌کند.
 *
 * ردکردن‌ها هم برگردانده می‌شوند، نه اینکه بی‌صدا حذف شوند: کاربر باید
 * ببیند از ۵۰۰ مشتری چرا فقط ۴۲۰ نفر پیام گرفتند — وگرنه فکر می‌کند
 * سامانه خراب است.
 */
export function prepareRecipients(
  recipients: Recipient[],
  template: string,
  extraVars: Record<string, string | number | null | undefined> = {},
): { send: Prepared[]; skipped: Skipped[] } {
  const send: Prepared[] = [];
  const skipped: Skipped[] = [];
  const seen = new Set<string>();

  for (const recipient of recipients) {
    const phone = normalizePhone(recipient.phone);
    const customerId = recipient.customerId ?? null;

    if (!phone) {
      skipped.push({
        customerId,
        phone: String(recipient.phone ?? ''),
        reason: 'INVALID_PHONE',
      });
      continue;
    }

    if (recipient.smsOptOut) {
      skipped.push({ customerId, phone, reason: 'OPTED_OUT' });
      continue;
    }

    // یک شماره یک پیام، حتی اگر دو بار در فهرست باشد.  مشتری‌ای که با
    // دو رکورد ثبت شده نباید دو پیامک بگیرد.
    if (seen.has(phone)) {
      skipped.push({ customerId, phone, reason: 'DUPLICATE' });
      continue;
    }
    seen.add(phone);

    const body = renderTemplate(template, { ...extraVars, name: recipient.name ?? '' });
    send.push({ customerId, phone, body, segments: segmentCount(body) });
  }

  return { send, skipped };
}

/** جمع قبض‌های یک ارسال — برآورد هزینه پیش از زدن دکمه. */
export function totalSegments(prepared: Prepared[]): number {
  return prepared.reduce((sum, item) => sum + item.segments, 0);
}

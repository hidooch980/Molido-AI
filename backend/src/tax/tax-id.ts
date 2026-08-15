/**
 * شمارهٔ منحصربه‌فرد مالیاتی — تابع خالص.
 *
 * ساختار مورد نظر سامانهٔ مؤدیان ۲۲ نویسه است:
 *
 *   [۶] شناسهٔ یکتای حافظهٔ مالیاتی
 *   [۵] تاریخ صدور — شمار روز از مبدأ، در مبنای ۳۲
 *   [۱۰] سریال داخلی صورتحساب، در مبنای ۳۲
 *   [۱] رقم کنترلی
 *
 * جدا از دیتابیس نگه داشته می‌شود چون این عدد **هرگز نباید تکرار شود** و
 * هر اشتباهی در آن، صورتحساب را در سازمان رد می‌کند.  آزمودن ارزان،
 * تنها راه اطمینان است.
 *
 * ⚠️ مبنا و رقم کنترلی طبق مستندات نسخه‌ای که در دست داشتیم پیاده شده؛
 * پیش از ارسال واقعی باید یک صورتحساب آزمایشی به سامانه فرستاده و تأیید
 * شود.  تا آن زمان ماژول در حالت آزمایشی می‌ماند.
 */

/** الفبای مبنای ۳۲ مورد استفادهٔ سامانه. */
const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUV';

/** مبدأ تاریخ: ۱۴۰۰/۰۱/۰۱ شمسی = ۲۰۲۱-۰۳-۲۱ میلادی. */
const EPOCH = Date.UTC(2021, 2, 21);

const DAY = 24 * 60 * 60 * 1000;

/** عدد به مبنای ۳۲ با طول ثابت و صفر ابتدایی. */
export function toBase32(value: number, length: number): string {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error('مقدار نامعتبر برای تبدیل مبنا');
  }

  let n = Math.floor(value);
  let out = '';

  do {
    out = ALPHABET[n % 32] + out;
    n = Math.floor(n / 32);
  } while (n > 0);

  if (out.length > length) {
    // سرریز یعنی سریال از ظرفیت گذشته؛ بی‌سروصدا بریدنش شماره‌های تکراری
    // می‌سازد، که بدترین حالت ممکن است.
    throw new Error(`مقدار ${value} در ${length} نویسه جا نمی‌شود`);
  }

  return out.padStart(length, '0');
}

/** شمار روز از مبدأ تا تاریخ صدور. */
export function daysSinceEpoch(issuedAt: Date): number {
  const utc = Date.UTC(
    issuedAt.getFullYear(),
    issuedAt.getMonth(),
    issuedAt.getDate(),
  );

  const days = Math.floor((utc - EPOCH) / DAY);

  if (days < 0) {
    throw new Error('تاریخ صدور پیش از مبدأ سامانهٔ مؤدیان است');
  }

  return days;
}

/**
 * رقم کنترلی — باقی‌ماندهٔ وزنی بر ۳۲.
 *
 * وزن‌ها از راست به چپ ۲ تا ۹ می‌چرخند؛ هدف گرفتنِ جابه‌جایی دو رقم است
 * که رایج‌ترین خطای تایپ دستی است و جمع ساده آن را نمی‌گیرد.
 */
export function checkChar(body: string): string {
  let sum = 0;
  let weight = 2;

  for (let i = body.length - 1; i >= 0; i -= 1) {
    const digit = ALPHABET.indexOf(body[i]);
    if (digit < 0) throw new Error(`نویسهٔ نامعتبر در شماره: ${body[i]}`);

    sum += digit * weight;
    weight = weight === 9 ? 2 : weight + 1;
  }

  return ALPHABET[sum % 32];
}

/**
 * ساخت شمارهٔ منحصربه‌فرد مالیاتی.
 *
 * `serial` باید از یک شمارندهٔ **اتمیک** بیاید (UPDATE … RETURNING)، نه
 * از شمارش سطرها: دو فروش هم‌زمان با شمارش، یک شماره می‌گیرند.
 */
export function buildTaxId(options: {
  memoryId: string;
  serial: number;
  issuedAt: Date;
}): string {
  const memoryId = options.memoryId.trim().toUpperCase();

  if (memoryId.length !== 6) {
    throw new Error('شناسهٔ حافظهٔ مالیاتی باید ۶ نویسه باشد');
  }

  if (!/^[0-9A-V]{6}$/.test(memoryId)) {
    throw new Error('شناسهٔ حافظه فقط می‌تواند رقم و حروف A تا V داشته باشد');
  }

  const body =
    memoryId +
    toBase32(daysSinceEpoch(options.issuedAt), 5) +
    toBase32(options.serial, 10);

  return body + checkChar(body);
}

/** بررسی صحت یک شمارهٔ مالیاتی — برای واردکردن دستی و آزمون. */
export function isValidTaxId(taxId: string): boolean {
  const value = String(taxId ?? '').trim().toUpperCase();

  if (value.length !== 22) return false;
  if (!/^[0-9A-V]{22}$/.test(value)) return false;

  return checkChar(value.slice(0, 21)) === value[21];
}

/**
 * تقویم جلالی — تبدیلِ دوسویه و مرزهای فصل.
 *
 * ⚠️ چرا ماژولِ جدا و نه چند خط داخلِ گزارش فصلی؟
 *
 *    گزارش فصلی نخستین مصرف‌کننده است، نه تنها مصرف‌کننده.  سال مالی،
 *    اختتامیه، سررسید چک و اقساط همه شمسی‌اند.  اگر تبدیل داخلِ یک
 *    گزارش بماند، نفرِ بعدی نسخهٔ خودش را می‌نویسد و دو تقویم پیدا
 *    می‌کنیم که در روزهای مرزی با هم اختلاف دارند.
 *
 * ⚠️ چرا `Intl` و نه فرمولِ دستیِ ۳۳ساله؟
 *
 *    **نه** به این دلیل که فرمول غلط است.  سنجیده شد: فرمولِ ۳۳ساله و
 *    ICU از ۱۳۰۰ تا ۱۵۰۱ دقیقاً یکی‌اند و نخستین اختلافشان ۱۵۰۲ است.
 *    ادعای اولیهٔ من که «در کبیسه‌ها یک روز خطا می‌دهد» درست نبود.
 *
 *    دلیلِ واقعی ساده‌تر است: قاعدهٔ تقویم داده است نه منطقِ ما، و ICU
 *    نگهدارنده‌اش را دارد.  کدِ دست‌نویس یعنی ما مسئولِ قاعده‌ای می‌شویم
 *    که ننوشته‌ایم — بی‌آنکه چیزی به‌دست آورده باشیم.
 *
 *    سنجیده شد که ایمیجِ `node:22-alpine` ICU کامل دارد — با
 *    small-icu نتیجه بی‌صدا غلط می‌شد، نه اینکه خطا بدهد.
 *
 * ⚠️ همه‌چیز در وقتِ **تهران** حساب می‌شود، نه UTC.
 *
 *    فروشِ ساعت ۲۱:۰۰ UTCِ ۲۱ ژوئن در تهران ۰۰:۳۰ بامدادِ روز بعد است
 *    — یعنی «۱ تیر»، فصلِ تابستان، نه بهار.  با UTC آن فاکتور در فصلِ
 *    اشتباه گزارش می‌شد و مغایرت با دفاتر پیدا می‌کرد.
 */

export interface JalaliDate {
  jy: number;
  jm: number;
  jd: number;
}

const TZ = 'Asia/Tehran';
const DAY_MS = 86_400_000;

/** روزهای سپری‌شده پیش از آغاز هر ماه، در سالِ عادی. */
const DAYS_BEFORE_MONTH = [0, 31, 62, 93, 124, 155, 186, 216, 246, 276, 306, 336];

const partsFmt = new Intl.DateTimeFormat('en-US-u-ca-persian', {
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  timeZone: TZ,
});

/** میلادی ← جلالی، در وقتِ تهران. */
export function toJalali(date: Date): JalaliDate {
  const p = Object.fromEntries(
    partsFmt.formatToParts(date).map((x) => [x.type, x.value]),
  ) as Record<string, string>;

  // ⚠️ ICU سالِ پیش از هجرت را با پسوندِ دوره برمی‌گرداند؛ برای
  //    تاریخ‌های این سامانه هرگز پیش نمی‌آید، ولی parseInt آن را هم
  //    بی‌صدا می‌پذیرد، پس صریح می‌سنجیم.
  const jy = Number(p.year);
  const jm = Number(p.month);
  const jd = Number(p.day);
  if (!Number.isInteger(jy) || !Number.isInteger(jm) || !Number.isInteger(jd)) {
    throw new Error(`تبدیل تاریخ شکست خورد: ${date.toISOString()}`);
  }
  return { jy, jm, jd };
}

/**
 * اختلافِ وقتِ تهران با UTC در یک لحظهٔ مشخص، بر حسب میلی‌ثانیه.
 *
 * ⚠️ عددِ ثابتِ +۳:۳۰ ننوشتم گرچه ایران از ۱۴۰۱ ساعتِ تابستانی را
 *    برداشته.  تاریخ‌های پیش از آن هنوز در سامانه هستند و آن سال‌ها
 *    +۴:۳۰ داشتند.  یک ثابت یعنی گزارشِ فصلی سال‌های قدیم یک ساعت
 *    جابه‌جا شود — و در فاکتورِ نیمه‌شب، یک روز.
 */
function tehranOffsetMs(date: Date): number {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const p = Object.fromEntries(
    f.formatToParts(date).map((x) => [x.type, x.value]),
  ) as Record<string, string>;
  const asUtc = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour) % 24,
    Number(p.minute),
    Number(p.second),
  );
  return asUtc - date.getTime();
}

/**
 * جلالی ← میلادی: لحظهٔ **آغازِ آن روز به وقتِ تهران**، به‌صورت UTC.
 *
 * ⚠️ روشِ «تخمین و تصحیح» به‌کار می‌رود، نه فرمولِ معکوس.
 *
 *    فرمولِ معکوس باید قاعدهٔ کبیسه را بازتولید کند — یعنی همان چیزی
 *    که عمداً به ICU سپرده شد.  تخمین + تصحیحِ چندروزه از `toJalali`
 *    استفاده می‌کند، پس هر دو سو **قطعاً** یک تقویم را می‌بینند.
 */
export function fromJalali(jy: number, jm: number, jd: number): Date {
  if (jm < 1 || jm > 12) throw new Error(`ماه نامعتبر: ${jm}`);
  if (jd < 1 || jd > 31) throw new Error(`روز نامعتبر: ${jd}`);

  // نوروز نزدیکِ ۲۰ مارسِ سالِ (jy + 621) است.
  let guess =
    Date.UTC(jy + 621, 2, 20, 12) +
    (DAYS_BEFORE_MONTH[jm - 1] + jd - 1) * DAY_MS;

  // تصحیح: حداکثر چند روز جابه‌جایی لازم می‌شود.
  let found: Date | null = null;
  for (let i = 0; i <= 6 && !found; i++) {
    for (const sign of i === 0 ? [0] : [-1, 1]) {
      const c = new Date(guess + sign * i * DAY_MS);
      const j = toJalali(c);
      if (j.jy === jy && j.jm === jm && j.jd === jd) {
        found = c;
        break;
      }
    }
  }
  if (!found) {
    throw new Error(`تاریخ جلالی وجود ندارد: ${jy}/${jm}/${jd}`);
  }

  // حالا از ظهرِ آن روز به نیمه‌شبِ تهرانِ همان روز برگرد.
  const off = tehranOffsetMs(found);
  const localMidday = found.getTime() + off;
  const localMidnight = Math.floor(localMidday / DAY_MS) * DAY_MS;
  return new Date(localMidnight - off);
}

/** آیا سالِ جلالی کبیسه است؟ (اسفندِ ۳۰ روزه) */
export function isLeapJalaliYear(jy: number): boolean {
  try {
    return toJalali(fromJalali(jy, 12, 30)).jd === 30;
  } catch {
    return false;
  }
}

/** شمارِ روزهای یک ماهِ جلالی. */
export function jalaliMonthLength(jy: number, jm: number): number {
  if (jm <= 6) return 31;
  if (jm <= 11) return 30;
  return isLeapJalaliYear(jy) ? 30 : 29;
}

export const QUARTER_NAMES = ['بهار', 'تابستان', 'پاییز', 'زمستان'] as const;

/**
 * بازهٔ یک فصلِ مالیاتی: `[from, to)` — آغاز شامل، پایان **نا**شامل.
 *
 * ⚠️ بازهٔ نیم‌باز عمدی است.  با `BETWEEN`ِ دوسرشامل، فاکتورِ دقیقاً
 *    نیمه‌شبِ پایانِ فصل در **هر دو** فصل شمرده می‌شود و جمعِ چهار فصل
 *    از کلِ سال بیشتر درمی‌آید — خطایی که فقط سالی چهار بار و فقط اگر
 *    کسی رأسِ ساعت بفروشد پیدا می‌شود.
 *
 * فصل‌ها: ۱ بهار (فروردین‌–خرداد)، ۲ تابستان، ۳ پاییز، ۴ زمستان.
 */
export function quarterRange(jy: number, quarter: number): { from: Date; to: Date } {
  if (quarter < 1 || quarter > 4) throw new Error(`فصل نامعتبر: ${quarter}`);
  const startMonth = (quarter - 1) * 3 + 1;
  const from = fromJalali(jy, startMonth, 1);
  const to =
    quarter === 4
      ? fromJalali(jy + 1, 1, 1)
      : fromJalali(jy, startMonth + 3, 1);
  return { from, to };
}

/** فصلی که یک لحظه در آن می‌افتد. */
export function quarterOf(date: Date): { jy: number; quarter: number } {
  const { jy, jm } = toJalali(date);
  return { jy, quarter: Math.floor((jm - 1) / 3) + 1 };
}

/** «۱۴۰۵/۰۶/۱۱» — ارقامِ لاتین، برای کلید و مقایسه. */
export function formatJalali(date: Date): string {
  const { jy, jm, jd } = toJalali(date);
  return `${jy}/${String(jm).padStart(2, '0')}/${String(jd).padStart(2, '0')}`;
}

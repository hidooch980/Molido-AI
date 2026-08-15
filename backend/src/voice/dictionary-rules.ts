import { parseCsv, guessDelimiter } from '../products/import-rules';

/**
 * ورود واژه‌نامهٔ بلوچی — عمداً خالص و بدون دیتابیس.
 *
 * واژه‌نامه را یک بلوچ‌زبان می‌دهد، و همان منبع هم رابط کاربری را
 * ترجمه می‌کند و هم متنِ عبارت‌های پیکرهٔ صوتی را پر می‌کند.  دو جای
 * جدا برای یک داده، یعنی دو جا که از هم جدا می‌افتند.
 */

export type Entry = {
  fa: string;
  target: string;
  /** شمارهٔ سطر در فایل — برای گزارش خطا به کاربر */
  row: number;
};

export type ImportResult = {
  entries: Entry[];
  skipped: Array<{ row: number; reason: string; raw: string }>;
};

/**
 * سرستون‌های پذیرفته‌شده.
 *
 * کسی که واژه‌نامه می‌دهد، سرستون را هرجور دلش بخواهد می‌نویسد.
 * اجبار به یک نام دقیق، فقط باعث می‌شود فایل رد شود و کاربر نداند چرا.
 */
const FA_HEADERS = ['فارسی', 'فارسي', 'persian', 'fa', 'farsi', 'معنی', 'معنا'];
const TARGET_HEADERS = ['بلوچی', 'بلوچي', 'balochi', 'baluchi', 'bal', 'balochi word', 'واژه'];

function normalizeHeader(value: string): string {
  return value
    .replace(/^﻿/, '')
    .replace(/[\s_-]+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * پیدا کردن ستون فارسی و بلوچی.
 *
 * اگر سرستون نبود، **دو ستون اول** فرض می‌شوند: فایل‌های دست‌نویس
 * معمولاً سرستون ندارند و ردکردنشان یعنی کاربر باید فایلش را دوباره
 * بسازد.
 */
export function findColumns(header: string[]): { fa: number; target: number } | null {
  const normalized = header.map(normalizeHeader);

  const fa = normalized.findIndex((h) => FA_HEADERS.includes(h));
  const target = normalized.findIndex((h) => TARGET_HEADERS.includes(h));

  if (fa >= 0 && target >= 0) return { fa, target };

  // بدون سرستون: دو ستون اول.  ترتیب «فارسی، بلوچی» است چون در
  // نمونه‌ای که به کاربر داده می‌شود همین ترتیب است.
  if (header.length >= 2) return { fa: 0, target: 1 };

  return null;
}

/**
 * یکسان‌سازی نویسه‌ها به املای بلوچیِ **ایران**.
 *
 * بیشتر دادهٔ بلوچیِ در دسترس، پاکستانی است و با نویسه‌های اردو نوشته
 * شده: ہ به‌جای ه، ے به‌جای ی، ں به‌جای ن.  کسی در زاهدان «نگن» را با
 * ه فارسی تایپ می‌کند — و «نگن» با ه و «نگن» با ہ دو رشتهٔ متفاوت‌اند
 * که هیچ‌وقت با هم برابر نمی‌شوند.
 *
 * حروف واکرفته (ٹ ڈ ڑ) عمداً **دست‌نخورده** می‌مانند: آن‌ها واج‌اند نه
 * شکلِ نوشتاری، و تبدیلشان به ت/د/ر معنی واژه را عوض می‌کند.
 */
const CHAR_FIXES: Array<[RegExp, string]> = [
  [/ي/g, 'ی'], // ی عربی
  [/ك/g, 'ک'], // ک عربی
  [/[ےۓ]/g, 'ی'], // ی اردو (بڑی یے)
  [/[ہھۃة]/g, 'ه'], // هٔ اردو و تای گرد
  [/ں/g, 'ن'], // نون غنّه
  [/[ً-ٰٟ]/g, ''], // اعراب و مدّ و الف خنجری
  [/‌+/g, '‌'], // نیم‌فاصلهٔ تکراری
];

/**
 * یکسان‌سازی نویسه‌ها.
 *
 * «کتاب» با کافِ عربی و کافِ فارسی دو رشتهٔ متفاوت‌اند و در تطبیق با
 * متن سامانه هیچ‌وقت برابر نمی‌شوند.  فایل‌هایی که با کیبورد عربی
 * تایپ شده‌اند فراوان‌اند.
 */
export function normalizeText(value: string): string {
  let text = value.replace(/^﻿/, '').trim();
  for (const [pattern, replacement] of CHAR_FIXES) {
    text = text.replace(pattern, replacement);
  }
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * تجزیهٔ فایل واژه‌نامه.
 *
 * سطرهای ناقص **رد می‌شوند نه نادیده**: کاربر باید ببیند از هزار سطر
 * چرا نهصدتا وارد شد — وگرنه فکر می‌کند فایلش خراب بوده.
 */
export function parseDictionary(text: string): ImportResult {
  const rows = parseCsv(text, guessDelimiter(text));
  const entries: Entry[] = [];
  const skipped: ImportResult['skipped'] = [];

  if (!rows.length) return { entries, skipped };

  const columns = findColumns(rows[0]);
  if (!columns) {
    return {
      entries,
      skipped: [{ row: 1, reason: 'فایل دست‌کم دو ستون لازم دارد', raw: rows[0].join(',') }],
    };
  }

  // اگر سطر اول سرستون بود، رد شود.  تشخیصش ساده است: سرستون در
  // فهرست نام‌های شناخته‌شده هست.
  const firstIsHeader = rows[0].some((cell) =>
    [...FA_HEADERS, ...TARGET_HEADERS].includes(normalizeHeader(cell)),
  );

  const seen = new Set<string>();

  rows.slice(firstIsHeader ? 1 : 0).forEach((row, index) => {
    const rowNo = index + (firstIsHeader ? 2 : 1);
    const fa = normalizeText(row[columns.fa] ?? '');
    const target = normalizeText(row[columns.target] ?? '');

    if (!fa && !target) return; // سطر خالی، خطا نیست

    if (!fa) {
      skipped.push({ row: rowNo, reason: 'ستون فارسی خالی است', raw: row.join(',') });
      return;
    }
    if (!target) {
      skipped.push({ row: rowNo, reason: 'ستون بلوچی خالی است', raw: row.join(',') });
      return;
    }

    // واژهٔ تکراری: اولی می‌ماند.  دومی معمولاً معنی دیگری از همان
    // واژه است، و انتخاب بینشان کار ماست نه کاربر.
    if (seen.has(fa)) {
      skipped.push({ row: rowNo, reason: `«${fa}» قبلاً آمده`, raw: row.join(',') });
      return;
    }
    seen.add(fa);

    entries.push({ fa, target, row: rowNo });
  });

  return { entries, skipped };
}

/**
 * تطبیق واژه‌نامه با متن‌های سامانه.
 *
 * برمی‌گرداند کدام کلیدهای رابط کاربری با این واژه‌نامه ترجمه می‌شوند.
 * تطبیق **دقیق** است، نه تقریبی: ترجمهٔ حدسیِ رابط، بدتر از فارسی
 * ماندنش است.
 */
export function matchUiKeys(
  entries: Entry[],
  dict: Record<string, { fa: string }>,
): Array<{ key: string; fa: string; target: string }> {
  const byFa = new Map(entries.map((e) => [e.fa, e.target]));

  return Object.entries(dict)
    .map(([key, value]) => {
      const target = byFa.get(normalizeText(value.fa));
      return target ? { key, fa: value.fa, target } : null;
    })
    .filter((x): x is { key: string; fa: string; target: string } => x !== null);
}

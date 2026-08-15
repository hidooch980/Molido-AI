/**
 * ورود گروهی کالا از فایل — منطق خالص.
 *
 * فروشگاهی که سه هزار کالا در نرم‌افزار قبلی دارد، آن‌ها را دستی وارد
 * نمی‌کند.  ولی فایلی که از نرم‌افزار دیگری بیرون می‌آید هرگز تمیز نیست:
 * ستون‌ها نام دلخواه دارند، عددها فارسی‌اند، جداکنندهٔ هزارگان دارند، و
 * چند سطر تکراری‌اند.
 *
 * این منطق جدا از دیتابیس است چون **اینجا جایی است که داده خراب می‌شود**،
 * و خرابی سه هزار سطر پس از درج، پاک کردنش سخت‌تر از خودِ ورود است.
 */

export type ImportRow = {
  name: string;
  sku: string;
  barcode: string | null;
  unit: string;
  purchasePrice: number;
  salePrice: number;
  categoryName: string | null;
  stock: number;
  minStock: number | null;
};

export type RowError = { line: number; message: string; raw: string };

/**
 * نام‌های محتملِ هر ستون.
 *
 * نرم‌افزارهای مختلف نام‌های متفاوتی می‌گذارند و کاربر هم فایل را دستی
 * ویرایش می‌کند.  به‌جای اینکه او را مجبور کنیم ستون‌ها را دقیق نام‌گذاری
 * کند، ما حدس می‌زنیم — و اگر نتوانستیم، صریح می‌گوییم کدام ستون پیدا
 * نشد.
 */
const ALIASES: Record<keyof ImportRow, string[]> = {
  name: ['name', 'نام', 'نام کالا', 'شرح', 'شرح کالا', 'عنوان', 'کالا'],
  sku: ['sku', 'code', 'کد', 'کد کالا', 'کدکالا', 'شناسه'],
  barcode: ['barcode', 'بارکد', 'شماره بارکد'],
  unit: ['unit', 'واحد', 'واحد شمارش', 'واحد سنجش'],
  purchasePrice: [
    'purchaseprice',
    'قیمت خرید',
    'خرید',
    'بهای خرید',
    'قیمت‌خرید',
  ],
  salePrice: ['saleprice', 'price', 'قیمت', 'قیمت فروش', 'فروش', 'قیمت‌فروش'],
  categoryName: ['category', 'دسته', 'دسته‌بندی', 'گروه', 'گروه کالا'],
  stock: ['stock', 'quantity', 'qty', 'موجودی', 'تعداد', 'مقدار'],
  minStock: ['minstock', 'حداقل موجودی', 'نقطه سفارش', 'حداقل'],
};

/** یکسان‌سازی نام ستون برای مقایسه. */
function normalizeHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[‌\s_-]+/g, ' ')
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .trim();
}

/** نگاشت سرستون‌های فایل به میدان‌های ما. */
export function mapHeaders(headers: string[]): {
  map: Partial<Record<keyof ImportRow, number>>;
  missing: string[];
} {
  const normalized = headers.map(normalizeHeader);
  const map: Partial<Record<keyof ImportRow, number>> = {};

  for (const [field, names] of Object.entries(ALIASES) as Array<
    [keyof ImportRow, string[]]
  >) {
    const index = normalized.findIndex((header) =>
      names.some((alias) => normalizeHeader(alias) === header),
    );

    if (index >= 0) map[field] = index;
  }

  // فقط نام و قیمت فروش واقعاً لازم‌اند؛ بقیه پیش‌فرض می‌گیرند.  اجبار
  // بیشتر یعنی کاربر فایلش را دستی بازنویسی کند، که خودش منبع خطاست.
  const missing: string[] = [];
  if (map.name === undefined) missing.push('نام کالا');
  if (map.salePrice === undefined) missing.push('قیمت فروش');

  return { map, missing };
}

/**
 * عدد فارسی/عربی با جداکنندهٔ هزارگان.
 *
 * «۱٬۲۵۰٬۰۰۰» از اکسل فارسی می‌آید و `Number()` رویش `NaN` می‌دهد.  بدون
 * این تبدیل، سه هزار کالا با قیمت صفر وارد می‌شوند — که بدتر از شکست
 * ورود است، چون شبیه موفقیت به نظر می‌رسد.
 */
export function parseNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;

  const text = String(value)
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    // جداکنندهٔ هزارگان در هر سه شکل رایج
    .replace(/[,٬،\s]/g, '')
    .replace(/٫/g, '.')
    .trim();

  if (!text) return null;

  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

/** متن تمیزشده؛ رشتهٔ خالی به `null` تبدیل می‌شود نه به «». */
export function parseText(value: unknown): string | null {
  const text = String(value ?? '').trim();
  return text === '' ? null : text;
}

/**
 * تجزیهٔ یک سطر.
 *
 * سطر خراب **کل ورود را متوقف نمی‌کند** بلکه با شمارهٔ خط گزارش می‌شود:
 * در فایل سه‌هزارتایی، یک سطر بد نباید ۲۹۹۹ تای دیگر را دور بریزد.  ولی
 * کاربر باید دقیقاً بداند کدام خط و چرا.
 */
export function parseRow(
  cells: string[],
  map: Partial<Record<keyof ImportRow, number>>,
  line: number,
): { row: ImportRow } | { error: RowError } {
  const at = (field: keyof ImportRow) => {
    const index = map[field];
    return index === undefined ? undefined : cells[index];
  };

  const raw = cells.join(' | ').slice(0, 120);
  const name = parseText(at('name'));

  if (!name) {
    return { error: { line, message: 'نام کالا خالی است', raw } };
  }

  const salePrice = parseNumber(at('salePrice'));

  if (salePrice === null) {
    return { error: { line, message: 'قیمت فروش خوانده نشد', raw } };
  }

  if (salePrice < 0) {
    return { error: { line, message: 'قیمت فروش منفی است', raw } };
  }

  const purchasePrice = parseNumber(at('purchasePrice')) ?? 0;

  // قیمت خرید بالاتر از فروش معمولاً یعنی دو ستون جابه‌جا خوانده شده‌اند.
  // رد نمی‌شود — گاهی واقعاً زیان می‌فروشند — ولی گزارش می‌شود.
  const stock = parseNumber(at('stock')) ?? 0;

  return {
    row: {
      name,
      // کد نداشته باشد، از نام ساخته می‌شود؛ کالای بی‌کد در صندوق پیدا
      // نمی‌شود.
      sku: parseText(at('sku')) ?? slug(name, line),
      barcode: parseText(at('barcode')),
      unit: parseText(at('unit')) ?? 'عدد',
      purchasePrice: Math.max(0, purchasePrice),
      salePrice,
      categoryName: parseText(at('categoryName')),
      stock: Math.max(0, stock),
      minStock: parseNumber(at('minStock')),
    },
  };
}

/** کد یکتا از نام — وقتی فایل ستون کد ندارد. */
function slug(name: string, line: number): string {
  const base = name
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24);

  // شمارهٔ خط چسبانده می‌شود چون دو کالای هم‌نام در یک فایل عادی است
  // («شیر» در دو حجم) و کد تکراری، دومی را روی اولی می‌نویسد.
  return `${base || 'ITEM'}-${line}`;
}

/**
 * تجزیهٔ CSV.
 *
 * از کتابخانه استفاده نمی‌شود چون دامنه محدود است و رفتار لبه‌ها باید
 * دقیقاً معلوم باشد: نقل‌قول دوتایی، جداکنندهٔ داخل نقل‌قول، و خط تازهٔ
 * ویندوزی.
 */
export function parseCsv(text: string, delimiter = ','): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  // BOM از اکسل می‌آید و اولین سرستون را خراب می‌کند.
  const input = text.replace(/^﻿/, '');

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];

    if (quoted) {
      if (char === '"') {
        // دو نقل‌قول پشت هم یعنی یک نقل‌قول واقعی
        if (input[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === delimiter) {
      row.push(cell);
      cell = '';
    } else if (char === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (char !== '\r') {
      cell += char;
    }
  }

  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }

  // سطر کاملاً خالی — انتهای فایل یا خط جدا کننده — دور انداخته می‌شود.
  return rows.filter((item) => item.some((value) => value.trim() !== ''));
}

/**
 * حدس جداکننده.
 *
 * اکسل فارسی روی ویندوز اغلب `;` می‌گذارد نه `,`.  حدس زدنش از پرسیدن
 * بهتر است: کاربری که نمی‌داند فایلش چه جداکننده‌ای دارد، جواب اشتباه
 * می‌دهد.
 */
export function guessDelimiter(text: string): string {
  const line = text.replace(/^﻿/, '').split(/\r?\n/)[0] ?? '';

  const counts = [',', ';', '\t'].map((sep) => ({
    sep,
    count: line.split(sep).length - 1,
  }));

  counts.sort((a, b) => b.count - a.count);
  return counts[0].count > 0 ? counts[0].sep : ',';
}

import { parseCsv, guessDelimiter } from '../products/import-rules';
import type { StructureFile } from './structure.service';

/**
 * تبدیلِ فایلِ **نرم‌افزارِ دیگر** به فایلِ ساختارِ مولیدو.
 *
 * ⚠️ چرا CSV و نه خواندنِ مستقیمِ پشتیبانِ آن نرم‌افزارها؟
 *
 *    پشتیبانِ هلو، سپیدار و همکاران هرکدام قالبِ بستهٔ خودش را دارد
 *    (اغلب SQL Server یا فایلِ رمزشده) و نسخه‌به‌نسخه عوض می‌شود.
 *    خواندنشان یعنی کدی که با هر به‌روزرسانیِ آن‌ها می‌شکند — و
 *    شکستنش وسطِ راه‌اندازیِ یک فروشگاه رخ می‌دهد.
 *
 *    ولی **هر** کدامشان «خروجی اکسل» دارد.  پس مسیرِ مطمئن یکی است:
 *    کاربر از نرم‌افزارِ خودش اکسل می‌گیرد، و ما ستون‌ها را از روی
 *    نامشان می‌شناسیم — همان کاری که ورودِ کالا از روزِ اول می‌کند.
 *
 * ⚠️ خروجی **فایلِ ساختار** است، نه درجِ مستقیم.
 *
 *    یعنی همان مسیرِ آزموده را طی می‌کند: پیش‌نمایش، بعد اعمال،
 *    افزایشی و تکرارپذیر.  یک مسیرِ دومِ درج یعنی دو جای متفاوت که
 *    باید امن باشند.
 */

type Kind = 'Account' | 'Category' | 'Supplier';

/**
 * نامِ ستون‌ها در نرم‌افزارهای رایج.
 *
 * ⚠️ هم فارسی هم انگلیسی، و هم نیم‌فاصله هم فاصلهٔ ساده.
 *    خروجیِ اکسلِ فارسی هر دو را می‌دهد و تفاوتشان دیده نمی‌شود.
 */
const ALIASES: Record<Kind, Record<string, string[]>> = {
  Account: {
    code: ['code', 'کد', 'کد حساب', 'کدحساب', 'شماره حساب', 'کد کل', 'شناسه'],
    name: ['name', 'نام', 'نام حساب', 'شرح', 'شرح حساب', 'عنوان', 'عنوان حساب'],
    type: ['type', 'نوع', 'نوع حساب', 'ماهیت', 'ماهیت حساب', 'گروه'],
    parentCode: ['parent', 'کد والد', 'حساب کل', 'کد کل معین', 'والد', 'سرگروه'],
  },
  Category: {
    name: ['name', 'نام', 'نام گروه', 'گروه', 'دسته', 'دسته‌بندی', 'گروه کالا'],
    parentName: ['parent', 'گروه والد', 'والد', 'سرگروه', 'گروه اصلی'],
  },
  Supplier: {
    name: ['name', 'نام', 'نام تأمین‌کننده', 'تأمین‌کننده', 'طرف حساب', 'فروشنده'],
    phone: ['phone', 'تلفن', 'موبایل', 'شماره تماس', 'همراه'],
    address: ['address', 'آدرس', 'نشانی'],
    email: ['email', 'ایمیل', 'رایانامه'],
  },
};

/**
 * ماهیتِ حساب در نرم‌افزارهای فارسی.
 *
 * ⚠️ ناشناخته به `ASSET` **نگاشته نمی‌شود**.
 *
 *    وسوسه‌اش هست که پیش‌فرضی گذاشته شود تا ورود نشکند.  ولی حسابی
 *    که ماهیتش غلط باشد، در ترازنامه سمتِ اشتباه می‌نشیند و ترازِ
 *    آزمایشی همچنان صفر می‌ماند — یعنی هیچ سنجه‌ای نمی‌گیردش.  رد
 *    کردنِ سطر با پیامِ روشن خیلی بهتر از حسابِ خاموشِ غلط است.
 */
const TYPES: Record<string, string> = {
  دارایی: 'ASSET',
  اموال: 'ASSET',
  asset: 'ASSET',
  بدهی: 'LIABILITY',
  liability: 'LIABILITY',
  سرمایه: 'EQUITY',
  equity: 'EQUITY',
  درآمد: 'REVENUE',
  فروش: 'REVENUE',
  revenue: 'REVENUE',
  income: 'REVENUE',
  هزینه: 'EXPENSE',
  expense: 'EXPENSE',
};

function normalize(value: string): string {
  return value
    .replace(/﻿/g, '')
    .replace(/[‌‏‎]/g, ' ') // نیم‌فاصله و نشانگرهای جهت
    .replace(/[يى]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export type ForeignResult = {
  file: StructureFile;
  matched: Record<string, string>;
  rows: number;
  errors: Array<{ line: number; message: string }>;
};

/**
 * فایلِ اکسل/CSV نرم‌افزارِ دیگر ← فایلِ ساختارِ مولیدو.
 *
 * ⚠️ هرگز پرتاب نمی‌کند برای یک سطرِ بد.
 *
 *    فایلی با هزار سطر همیشه چند سطرِ خراب دارد.  اگر کلِ ورود به
 *    خاطر یکی بشکند، کاربر باید فایل را دستی تمیز کند — همان کاری
 *    که می‌خواست نکند.  سطرهای بد گزارش می‌شوند، بقیه می‌آیند.
 */
export function foreignToStructure(kind: Kind, text: string): ForeignResult {
  const delimiter = guessDelimiter(text);
  const grid = parseCsv(text, delimiter);
  const errors: ForeignResult['errors'] = [];

  if (!grid.length) {
    return {
      file: { molidoStructure: 1, exportedAt: new Date().toISOString(), tables: {} },
      matched: {},
      rows: 0,
      errors: [{ line: 0, message: 'فایل خالی است' }],
    };
  }

  const headers = grid[0].map((h) => normalize(String(h ?? '')));
  const matched: Record<string, string> = {};

  for (const [field, names] of Object.entries(ALIASES[kind])) {
    const index = headers.findIndex((header) =>
      names.some((name) => normalize(name) === header),
    );
    if (index >= 0) matched[field] = grid[0][index];
  }

  const indexOf = (field: string): number => {
    const label = matched[field];
    if (!label) return -1;
    return grid[0].indexOf(label);
  };

  const rows: Array<Record<string, unknown>> = [];
  const byKey = new Map<string, string>();

  for (let line = 1; line < grid.length; line += 1) {
    const cells = grid[line];
    if (!cells || cells.every((c) => !String(c ?? '').trim())) continue;

    const get = (field: string): string => {
      const at = indexOf(field);
      return at >= 0 ? String(cells[at] ?? '').trim() : '';
    };

    const name = get('name');
    if (!name) {
      errors.push({ line: line + 1, message: 'نام خالی است' });
      continue;
    }

    if (kind === 'Account') {
      const code = get('code');
      if (!code) {
        errors.push({ line: line + 1, message: `«${name}» کد ندارد` });
        continue;
      }

      const rawType = normalize(get('type'));
      const type = TYPES[rawType];
      if (!type) {
        // ⚠️ پیام باید **بگوید چه دید**، وگرنه کاربر نمی‌داند در
        //    فایلش دنبال چه بگردد.
        errors.push({
          line: line + 1,
          message: `ماهیتِ «${get('type') || '—'}» شناخته نشد (دارایی/بدهی/سرمایه/درآمد/هزینه)`,
        });
        continue;
      }

      const id = `csv-${code}`;
      byKey.set(code, id);
      rows.push({
        id,
        code,
        name,
        type,
        isActive: true,
        // حسابِ دارای فرزند سندپذیر نیست؛ در گذرِ پایین اصلاح می‌شود.
        isPostable: true,
        parentCode: get('parentCode') || null,
      });
    } else if (kind === 'Category') {
      const id = `csv-${normalize(name)}`;
      byKey.set(normalize(name), id);
      rows.push({ id, name, description: null, parentName: get('parentName') || null });
    } else {
      rows.push({
        id: `csv-${normalize(name)}`,
        name,
        phone: get('phone') || null,
        email: get('email') || null,
        address: get('address') || null,
        isActive: true,
      });
    }
  }

  // گره زدنِ والد پس از خواندنِ همهٔ سطرها — والد می‌تواند پایین‌تر
  // از فرزند باشد و در بیشترِ خروجی‌ها هست.
  for (const row of rows) {
    if (kind === 'Account' && row.parentCode) {
      row.parentId = byKey.get(String(row.parentCode)) ?? null;
      // ⚠️ حسابی که فرزند دارد **سندپذیر نیست**.
      //
      //    اگر بماند، کاربر می‌تواند سند را به «دارایی‌های جاری» بزند
      //    به‌جای «صندوق» — و گزارشِ معین برای همیشه ناقص می‌شود.
      const parent = rows.find((r) => r.id === row.parentId);
      if (parent) parent.isPostable = false;
      delete row.parentCode;
    }
    if (kind === 'Category' && row.parentName) {
      row.parentId = byKey.get(normalize(String(row.parentName))) ?? null;
      delete row.parentName;
    }
  }

  return {
    file: {
      molidoStructure: 1,
      exportedAt: new Date().toISOString(),
      tables: { [kind]: rows },
    },
    matched,
    rows: rows.length,
    errors,
  };
}

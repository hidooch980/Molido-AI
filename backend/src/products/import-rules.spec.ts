import {
  guessDelimiter,
  mapHeaders,
  parseCsv,
  parseNumber,
  parseRow,
  parseText,
} from './import-rules';

/**
 * فایلی که از نرم‌افزار حسابداری بیرون می‌آید هرگز تمیز نیست.
 *
 * بدترین حالت این نیست که ورود شکست بخورد — آن معلوم است.  بدترین حالت
 * این است که سه هزار کالا با قیمت صفر وارد شوند و شبیه موفقیت به نظر
 * برسد.  پس بیشتر آزمون‌ها دربارهٔ همین‌اند.
 */

describe('عدد فارسی', () => {
  it('رقم فارسی خوانده می‌شود', () => {
    expect(parseNumber('۱۲۳۴')).toBe(1234);
  });

  it('رقم عربی خوانده می‌شود', () => {
    expect(parseNumber('١٢٣٤')).toBe(1234);
  });

  it('جداکنندهٔ هزارگان در هر سه شکل', () => {
    expect(parseNumber('۱٬۲۵۰٬۰۰۰')).toBe(1_250_000);
    expect(parseNumber('1,250,000')).toBe(1_250_000);
    expect(parseNumber('1 250 000')).toBe(1_250_000);
  });

  it('اعشار فارسی', () => {
    expect(parseNumber('۱۲٫۵')).toBe(12.5);
  });

  it('متن نامعدد null می‌دهد، نه صفر', () => {
    // صفر یعنی «قیمت صفر» که در فاکتور می‌نشیند؛ null یعنی «نخواندم» که
    // گزارش می‌شود.  تفاوتشان سه هزار کالای رایگان است.
    expect(parseNumber('نامشخص')).toBeNull();
    expect(parseNumber('')).toBeNull();
    expect(parseNumber(null)).toBeNull();
  });

  it('عدد واقعی دست‌نخورده می‌ماند', () => {
    expect(parseNumber(1500)).toBe(1500);
    expect(parseNumber(0)).toBe(0);
  });
});

describe('نگاشت سرستون', () => {
  it('نام‌های فارسی رایج را می‌شناسد', () => {
    const { map, missing } = mapHeaders([
      'کد کالا',
      'شرح کالا',
      'واحد',
      'قیمت خرید',
      'قیمت فروش',
      'موجودی',
    ]);

    expect(missing).toEqual([]);
    expect(map.sku).toBe(0);
    expect(map.name).toBe(1);
    expect(map.salePrice).toBe(4);
    expect(map.stock).toBe(5);
  });

  it('نام‌های انگلیسی هم کار می‌کنند', () => {
    const { map, missing } = mapHeaders(['SKU', 'Name', 'Price', 'Qty']);

    expect(missing).toEqual([]);
    expect(map.name).toBe(1);
    expect(map.salePrice).toBe(2);
  });

  it('نیم‌فاصله و ی/ک عربی مانع نیست', () => {
    // فایل‌های واقعی هر دو شکل «ی» و «ک» را دارند.
    const { missing } = mapHeaders(['نام كالا', 'قيمت‌فروش']);
    expect(missing).toEqual([]);
  });

  it('ستون‌های گمشده صریح گزارش می‌شوند', () => {
    const { missing } = mapHeaders(['کد', 'واحد']);
    expect(missing).toContain('نام کالا');
    expect(missing).toContain('قیمت فروش');
  });

  it('ستون اختیاری نبودنش مانع نیست', () => {
    const { missing } = mapHeaders(['نام', 'قیمت']);
    expect(missing).toEqual([]);
  });
});

describe('تجزیهٔ سطر', () => {
  const map = { name: 0, sku: 1, salePrice: 2, purchasePrice: 3, stock: 4 };

  it('سطر سالم', () => {
    const result = parseRow(
      ['برنج ایرانی', 'RICE-10', '۱٬۱۰۰٬۰۰۰', '۹۵۰٬۰۰۰', '۲۵'],
      map,
      2,
    );

    expect('row' in result).toBe(true);
    if (!('row' in result)) return;

    expect(result.row.name).toBe('برنج ایرانی');
    expect(result.row.salePrice).toBe(1_100_000);
    expect(result.row.purchasePrice).toBe(950_000);
    expect(result.row.stock).toBe(25);
    expect(result.row.unit).toBe('عدد');
  });

  it('نام خالی، خطای با شمارهٔ خط', () => {
    const result = parseRow(['   ', 'X', '100'], map, 7);

    expect('error' in result).toBe(true);
    if (!('error' in result)) return;
    expect(result.error.line).toBe(7);
  });

  it('قیمت ناخوانا رد می‌شود، نه صفر می‌گیرد', () => {
    const result = parseRow(['کالا', 'X', 'نامشخص'], map, 3);
    expect('error' in result).toBe(true);
  });

  it('قیمت منفی رد می‌شود', () => {
    expect('error' in parseRow(['کالا', 'X', '-500'], map, 3)).toBe(true);
  });

  it('بدون کد، کد از نام ساخته می‌شود', () => {
    const result = parseRow(['شیر پرچرب', '', '50000'], map, 4);
    if (!('row' in result)) throw new Error('باید موفق باشد');

    expect(result.row.sku).toContain('4');
    expect(result.row.sku.length).toBeGreaterThan(1);
  });

  it('دو کالای هم‌نام کد یکسان نمی‌گیرند', () => {
    // «شیر» در دو حجم، در فایل‌های واقعی عادی است؛ کد تکراری دومی را روی
    // اولی می‌نویسد.
    const a = parseRow(['شیر', '', '10'], map, 5);
    const b = parseRow(['شیر', '', '20'], map, 6);

    if (!('row' in a) || !('row' in b)) throw new Error('باید موفق باشند');
    expect(a.row.sku).not.toBe(b.row.sku);
  });

  it('موجودی منفی صفر می‌شود', () => {
    const result = parseRow(['کالا', 'X', '100', '80', '-5'], map, 2);
    if (!('row' in result)) throw new Error('باید موفق باشد');
    expect(result.row.stock).toBe(0);
  });
});

describe('تجزیهٔ CSV', () => {
  it('سطر و ستون ساده', () => {
    expect(parseCsv('a,b\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('کاما داخل نقل‌قول جدا نمی‌کند', () => {
    expect(parseCsv('name,price\n"شیر, پرچرب",100')).toEqual([
      ['name', 'price'],
      ['شیر, پرچرب', '100'],
    ]);
  });

  it('نقل‌قول دوتایی یعنی یک نقل‌قول', () => {
    expect(parseCsv('a\n"او گفت ""سلام"""')).toEqual([['a'], ['او گفت "سلام"']]);
  });

  it('خط تازهٔ ویندوزی', () => {
    expect(parseCsv('a,b\r\n1,2\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('BOM اکسل اولین سرستون را خراب نمی‌کند', () => {
    const [header] = parseCsv('﻿نام,قیمت\nکالا,۱۰۰');
    expect(header[0]).toBe('نام');
  });

  it('سطر خالی دور انداخته می‌شود', () => {
    expect(parseCsv('a,b\n\n1,2\n\n')).toHaveLength(2);
  });
});

describe('حدس جداکننده', () => {
  it('اکسل فارسی ویندوز نقطه‌ویرگول می‌گذارد', () => {
    expect(guessDelimiter('نام;قیمت;موجودی')).toBe(';');
  });

  it('کاما وقتی بیشتر است', () => {
    expect(guessDelimiter('name,price,qty')).toBe(',');
  });

  it('تب', () => {
    expect(guessDelimiter('name\tprice')).toBe('\t');
  });

  it('یک ستونه به کاما برمی‌گردد', () => {
    expect(guessDelimiter('name')).toBe(',');
  });
});

describe('متن', () => {
  it('فاصلهٔ اضافه پاک می‌شود', () => {
    expect(parseText('  کالا  ')).toBe('کالا');
  });

  it('خالی null می‌شود نه رشتهٔ خالی', () => {
    // رشتهٔ خالی در دیتابیس یعنی «بارکد دارد ولی خالی است» که جستجو را
    // خراب می‌کند.
    expect(parseText('   ')).toBeNull();
    expect(parseText(undefined)).toBeNull();
  });
});

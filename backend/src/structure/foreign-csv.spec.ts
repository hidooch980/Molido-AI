import { foreignToStructure } from './foreign-csv';

/**
 * ⚠️ چرا آزمونِ واحد و نه فقط آزمونِ HTTP؟
 *
 *    خطای این تبدیل **خاموش** است.  حسابی که ماهیتش غلط باشد در
 *    ترازنامه سمتِ اشتباه می‌نشیند، ولی ترازِ آزمایشی همچنان صفر
 *    می‌ماند و هیچ سنجهٔ سرتاسری نمی‌گیردش.  تنها جایی که می‌شود
 *    گرفتش همین‌جاست، سطر به سطر.
 */

const rows = (kind: 'Account' | 'Category', csv: string) =>
  foreignToStructure(kind, csv).file.tables[kind];

describe('تبدیلِ فایلِ نرم‌افزارِ دیگر', () => {
  it('کدینگ حساب فارسی را می‌خواند', () => {
    const out = foreignToStructure(
      'Account',
      ['کد حساب,نام حساب,ماهیت', '1000,دارایی‌های جاری,دارایی', '1001,صندوق,دارایی'].join('\n'),
    );

    expect(out.rows).toBe(2);
    expect(out.errors).toHaveLength(0);
    expect(out.file.tables.Account[1]).toMatchObject({
      code: '1001',
      name: 'صندوق',
      type: 'ASSET',
    });
  });

  it('ماهیتِ ناشناخته را رد می‌کند و نه به دارایی نگاشت', () => {
    // ⚠️ سنجهٔ اصلی.  پیش‌فرض گذاشتن یعنی حسابِ خاموشِ غلط، و
    //    حسابِ غلط از حسابِ نبود بدتر است — چون کسی دنبالش نمی‌گردد.
    const out = foreignToStructure(
      'Account',
      ['کد,نام,نوع', '5000,یک چیزی,نامشخص'].join('\n'),
    );

    expect(out.rows).toBe(0);
    expect(out.errors[0].message).toContain('نامشخص');
  });

  it('حسابی که فرزند دارد سندپذیر نمی‌ماند', () => {
    // ⚠️ وگرنه کاربر سند را به «دارایی‌های جاری» می‌زند به‌جای
    //    «صندوق»، و گزارشِ معین برای همیشه ناقص می‌شود.
    const out = rows(
      'Account',
      ['کد,نام,ماهیت,کد والد', '1000,جاری,دارایی,', '1001,صندوق,دارایی,1000'].join('\n'),
    );

    const parent = out.find((r) => r.code === '1000');
    const child = out.find((r) => r.code === '1001');

    expect(parent?.isPostable).toBe(false);
    expect(child?.isPostable).toBe(true);
    expect(child?.parentId).toBe(parent?.id);
  });

  it('والدی که پایین‌تر از فرزند آمده هم گره می‌خورد', () => {
    // بیشترِ خروجی‌های اکسل مرتب نیستند.
    const out = rows(
      'Account',
      ['کد,نام,ماهیت,کد والد', '1001,صندوق,دارایی,1000', '1000,جاری,دارایی,'].join('\n'),
    );

    expect(out.find((r) => r.code === '1001')?.parentId).toBe(
      out.find((r) => r.code === '1000')?.id,
    );
  });

  it('نیم‌فاصله و «ي» عربی در سرستون مانع نمی‌شود', () => {
    // ⚠️ خروجیِ اکسلِ فارسی هر دو را می‌دهد و تفاوتشان دیده نمی‌شود —
    //    سرستونی که با چشم درست است ولی تطبیق نمی‌خورد.
    const out = foreignToStructure(
      'Account',
      ['كد حساب;نام حساب;ماهيت', '1002;بانک;دارایی'].join('\n'),
    );

    expect(out.rows).toBe(1);
    expect(out.file.tables.Account[0]).toMatchObject({ code: '1002', type: 'ASSET' });
  });

  it('یک سطرِ بد کلِ فایل را نمی‌شکند', () => {
    // ⚠️ فایلِ هزار سطری همیشه چند سطرِ خراب دارد.  شکستنِ کل یعنی
    //    کاربر باید فایل را دستی تمیز کند — همان کاری که نمی‌خواست.
    const out = foreignToStructure(
      'Account',
      ['کد,نام,ماهیت', '1000,صندوق,دارایی', '1001,,دارایی', '1002,بانک,دارایی'].join('\n'),
    );

    expect(out.rows).toBe(2);
    expect(out.errors).toHaveLength(1);
    expect(out.errors[0].line).toBe(3);
  });

  it('گروه کالا با سلسله‌مراتب', () => {
    const out = rows(
      'Category',
      ['گروه,گروه والد', 'لبنیات,', 'شیر,لبنیات'].join('\n'),
    );

    expect(out).toHaveLength(2);
    expect(out.find((r) => r.name === 'شیر')?.parentId).toBe(
      out.find((r) => r.name === 'لبنیات')?.id,
    );
  });

  it('خروجی همان قالبِ فایلِ ساختار است', () => {
    // ⚠️ همین است که مسیرِ دومِ درج را لازم نمی‌کند: خروجی مستقیماً
    //    به `/structure/restore` می‌رود که آزموده و افزایشی است.
    const out = foreignToStructure('Supplier', ['نام,تلفن', 'پخش الف,02112345678'].join('\n'));

    expect(out.file.molidoStructure).toBe(1);
    expect(out.file.tables.Supplier[0]).toMatchObject({
      name: 'پخش الف',
      phone: '02112345678',
    });
  });

  it('فایلِ خالی خطا می‌دهد، نه فایلِ تهی', () => {
    const out = foreignToStructure('Supplier', '');
    expect(out.rows).toBe(0);
    expect(out.errors).toHaveLength(1);
  });
});

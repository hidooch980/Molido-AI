import {
  addJalaliMonths,
  toJalali,
  fromJalali,
  quarterRange,
  quarterOf,
  isLeapJalaliYear,
  jalaliMonthLength,
  formatJalali,
  toTehranDateString,
} from './jalali';

describe('تقویم جلالی', () => {
  it('میلادی را به جلالی برمی‌گرداند', () => {
    expect(toJalali(new Date('2026-09-02T09:00:00Z'))).toEqual({ jy: 1405, jm: 6, jd: 11 });
    expect(toJalali(new Date('2026-03-21T09:00:00Z'))).toEqual({ jy: 1405, jm: 1, jd: 1 });
  });

  // ⚠️ مرزِ فصل‌ها؛ همان‌جایی که یک روز خطا کلِ گزارش را جابه‌جا می‌کند.
  it('مرزهای فصل را دقیق می‌شناسد', () => {
    expect(toJalali(new Date('2026-06-21T09:00:00Z'))).toEqual({ jy: 1405, jm: 3, jd: 31 });
    expect(toJalali(new Date('2026-06-22T09:00:00Z'))).toEqual({ jy: 1405, jm: 4, jd: 1 });
    expect(toJalali(new Date('2026-09-22T09:00:00Z'))).toEqual({ jy: 1405, jm: 6, jd: 31 });
    expect(toJalali(new Date('2026-09-23T09:00:00Z'))).toEqual({ jy: 1405, jm: 7, jd: 1 });
  });

  it('رفت‌وبرگشت برای هر روزِ سه سال یکسان می‌ماند', () => {
    for (const jy of [1403, 1404, 1405]) {
      for (let jm = 1; jm <= 12; jm++) {
        for (let jd = 1; jd <= jalaliMonthLength(jy, jm); jd++) {
          expect(toJalali(fromJalali(jy, jm, jd))).toEqual({ jy, jm, jd });
        }
      }
    }
  });

  // ۱۴۰۳ کبیسه است (اسفند ۳۰ روزه) و ۱۴۰۵ نیست.
  //
  // ⚠️ این سنجه با تزریقِ فرمولِ ۳۳ساله **سبز ماند** — چون آن فرمول تا
  //    ۱۵۰۱ با ICU یکی است.  یعنی این آزمون «ICU در برابر فرمول» را
  //    نمی‌سنجد و نباید چنین وانمود کند؛ فقط می‌سنجد که کبیسه درست
  //    شناخته شود.  دو تزریقِ دیگر (وقتِ تهران، و بازهٔ دوسرشامل) قرمز
  //    شدند، پس آن‌ها واقعاً نگهبان‌اند.
  it('کبیسه را درست تشخیص می‌دهد', () => {
    expect(isLeapJalaliYear(1403)).toBe(true);
    expect(isLeapJalaliYear(1405)).toBe(false);
    expect(jalaliMonthLength(1403, 12)).toBe(30);
    expect(jalaliMonthLength(1405, 12)).toBe(29);
    expect(() => fromJalali(1405, 12, 30)).toThrow();
  });

  it('بازهٔ فصل نیم‌باز است و چهار فصل دقیقاً یک سال را می‌پوشانند', () => {
    const q1 = quarterRange(1405, 1);
    const q4 = quarterRange(1405, 4);
    expect(formatJalali(q1.from)).toBe('1405/01/01');
    // پایانِ بهار باید **آغازِ** تابستان باشد، نه آخرین روزِ بهار.
    expect(formatJalali(q1.to)).toBe('1405/04/01');
    expect(formatJalali(q4.to)).toBe('1406/01/01');

    for (let q = 1; q < 4; q++) {
      expect(quarterRange(1405, q).to.getTime()).toBe(quarterRange(1405, q + 1).from.getTime());
    }
  });

  // ⚠️ اصلِ ماجرا: وقتِ تهران، نه UTC.
  //    ۲۱ ژوئن ساعت ۲۱:۰۰ UTC در تهران ۰۰:۳۰ بامدادِ ۱ تیر است.
  it('فاکتورِ نیمه‌شب را در فصلِ درست می‌گذارد', () => {
    expect(quarterOf(new Date('2026-06-21T18:00:00Z'))).toEqual({ jy: 1405, quarter: 1 });
    expect(quarterOf(new Date('2026-06-21T21:00:00Z'))).toEqual({ jy: 1405, quarter: 2 });
  });

  it('آغازِ فصل، نیمه‌شبِ تهران است نه نیمه‌شبِ UTC', () => {
    // تهران +۳:۳۰ ⇒ نیمه‌شبِ محلی = ۲۰:۳۰ UTCِ روزِ پیش.
    expect(quarterRange(1405, 1).from.toISOString()).toBe('2026-03-20T20:30:00.000Z');
  });

  // ⚠️ «ماهِ بعد» با «سی روز بعد» یکی نیست؛ برای سندِ تکرارشونده این
  //    تفاوت روی هم جمع می‌شود تا یک ماه دو سند بخورد و یکی هیچ.
  it('ماهِ شمسی می‌افزاید، نه سی روز', () => {
    const farvardin1 = fromJalali(1405, 1, 1);
    expect(formatJalali(addJalaliMonths(farvardin1, 1))).toBe('1405/02/01');
    expect(formatJalali(addJalaliMonths(farvardin1, 12))).toBe('1406/01/01');

    // سی روز بعد از ۱ فروردین = ۳۱ فروردین، نه ۱ اردیبهشت.
    const thirtyDays = new Date(farvardin1.getTime() + 30 * 86400000);
    expect(formatJalali(thirtyDays)).toBe('1405/01/31');
  });

  // ⚠️ ۳۱ فروردین + شش ماه = ۳۰ مهر، چون مهر سی روز دارد.
  //    بدونِ بریدن، `fromJalali` استثنا می‌داد و سندِ آن ماه صادر نمی‌شد.
  it('روز را به طولِ ماهِ مقصد می‌بُرد', () => {
    expect(formatJalali(addJalaliMonths(fromJalali(1405, 1, 31), 6))).toBe('1405/07/30');
    // اسفندِ ۱۴۰۵ کبیسه نیست ⇒ ۲۹ روز.
    expect(formatJalali(addJalaliMonths(fromJalali(1405, 1, 31), 11))).toBe('1405/12/29');
    // اسفندِ ۱۴۰۳ کبیسه است ⇒ ۳۰ روز.
    expect(formatJalali(addJalaliMonths(fromJalali(1403, 1, 31), 11))).toBe('1403/12/30');
  });

  it('ماهِ منفی هم درست کار می‌کند', () => {
    expect(formatJalali(addJalaliMonths(fromJalali(1405, 1, 15), -1))).toBe('1404/12/15');
    expect(formatJalali(addJalaliMonths(fromJalali(1405, 1, 15), -13))).toBe('1403/12/15');
  });

  // ⚠️ همان تله‌ای که یک بار خوردم: `fromJalali` نیمه‌شبِ تهران می‌دهد
  //    (۲۰:۳۰ UTCِ روزِ پیش)، پس `toISOString().slice(0,10)` یک روز عقب
  //    می‌برد.  سررسیدِ سندِ تکرارشونده هر ماه یک روز عقب می‌رفت.
  it('تاریخِ میلادی را به وقتِ تهران می‌دهد، نه UTC', () => {
    const d = fromJalali(1405, 2, 31);
    expect(toTehranDateString(d)).toBe('2026-05-21');
    // اثباتِ اینکه راهِ ساده غلط است:
    expect(d.toISOString().slice(0, 10)).toBe('2026-05-20');
  });

  it('ورودیِ نامعتبر را رد می‌کند', () => {
    expect(() => quarterRange(1405, 0)).toThrow();
    expect(() => quarterRange(1405, 5)).toThrow();
    expect(() => fromJalali(1405, 13, 1)).toThrow();
  });
});

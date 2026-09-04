import {
  isValidMobile,
  isValidNationalCode,
  normalizeMobile,
  normalizeNationalCode,
} from './national-code';

/**
 * ⚠️ این آزمون **بدونِ سرور** اجرا می‌شود.
 *
 *    منطقِ رقمِ کنترلی هیچ وابستگی‌ای ندارد، پس نباید پشتِ داکر و
 *    پایگاه‌داده قفل شود.  هرچه زودتر بشکند، ارزان‌تر است.
 */
describe('کد ملی', () => {
  it('کدِ درست را می‌پذیرد', () => {
    // نمونه‌های ساختگی با رقمِ کنترلیِ درست.
    expect(isValidNationalCode('0499370899')).toBe(true);
    expect(isValidNationalCode('0790419904')).toBe(true);
    expect(isValidNationalCode('0084575948')).toBe(true);
  });

  it('رقمِ کنترلیِ غلط را رد می‌کند', () => {
    expect(isValidNationalCode('0499370898')).toBe(false);
    expect(isValidNationalCode('1234567890')).toBe(false);
  });

  // ⚠️ مهم‌ترین سنجه: این‌ها در الگوریتم **درست** درمی‌آیند.
  //    همان چیزی که آدم موقعِ پر کردنِ فرمِ اجباری تایپ می‌کند.
  it('کدِ تک‌رقمیِ تکراری را رد می‌کند', () => {
    for (let d = 0; d <= 9; d += 1) {
      expect(isValidNationalCode(String(d).repeat(10))).toBe(false);
    }
  });

  it('ارقامِ فارسی و عربی را می‌فهمد', () => {
    expect(normalizeNationalCode('۰۴۹۹۳۷۰۸۹۹')).toBe('0499370899');
    expect(isValidNationalCode('۰۴۹۹۳۷۰۸۹۹')).toBe(true);
    expect(normalizeNationalCode('٠٤٩٩٣٧٠٨٩٩')).toBe('0499370899');
  });

  // ⚠️ صفرِ ابتدایی: تبدیل به عدد آن را می‌خورَد.
  it('صفرِ ابتدایی را نگه می‌دارد', () => {
    expect(normalizeNationalCode('499370899')).toBe('0499370899');
    expect(normalizeNationalCode('0084575948')).toBe('0084575948');
  });

  it('جداکننده‌ها را نادیده می‌گیرد', () => {
    expect(normalizeNationalCode('049-937-0899')).toBe('0499370899');
  });

  it('ورودیِ تهی و بی‌ربط را رد می‌کند', () => {
    expect(isValidNationalCode('')).toBe(false);
    expect(isValidNationalCode(null)).toBe(false);
    expect(isValidNationalCode(undefined)).toBe(false);
    expect(isValidNationalCode('abc')).toBe(false);
    expect(isValidNationalCode('12345678901')).toBe(false);
  });
});

describe('موبایل', () => {
  it('ریخت‌های گوناگونِ یک شماره را یکی می‌کند', () => {
    for (const form of ['09121234567', '+989121234567', '00989121234567', '9121234567']) {
      expect(normalizeMobile(form)).toBe('09121234567');
    }
  });

  it('ارقامِ فارسی را می‌فهمد', () => {
    expect(normalizeMobile('۰۹۱۲۱۲۳۴۵۶۷')).toBe('09121234567');
  });

  it('شمارهٔ نامعتبر را رد می‌کند', () => {
    expect(isValidMobile('0212345678')).toBe(false);
    expect(isValidMobile('0912123456')).toBe(false);
    expect(isValidMobile('')).toBe(false);
  });
});

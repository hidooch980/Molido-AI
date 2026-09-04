import { generateSecret, verifyCode, otpauthUrl, generateRecoveryCodes } from './totp';

/**
 * ⚠️ بردارهای آزمونِ RFC 6238 عمداً اینجا هستند.
 *
 *    پیاده‌سازیِ خودنوشتهٔ رمزنگاری بدون بردارِ رسمی، فقط «با خودش
 *    سازگار» است — یعنی می‌تواند کاملاً غلط باشد و همهٔ آزمون‌های
 *    خودساخته را رد کند.
 *
 *    اگر این بردارها بگذرند، برنامهٔ احرازکنندهٔ کاربر هم همان کد را
 *    می‌سازد.  بدونشان تنها راهِ فهمیدن، شکست خوردنِ کاربرِ واقعی است.
 */
describe('TOTP', () => {
  // راز نمونهٔ RFC 6238: رشتهٔ ASCII «12345678901234567890» در base32
  const RFC_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

  it('بردارهای رسمی RFC 6238 را بازتولید می‌کند', () => {
    // (زمان یونیکس، کدِ شش‌رقمی) از جدولِ خودِ RFC
    const vectors: Array<[number, string]> = [
      [59, '287082'],
      [1111111109, '081804'],
      [1111111111, '050471'],
      [1234567890, '005924'],
      [2000000000, '279037'],
    ];

    for (const [seconds, expected] of vectors) {
      expect(verifyCode(RFC_SECRET, expected, seconds * 1000)).toBe(true);
    }
  });

  it('کدِ گامِ قبل و بعد پذیرفته می‌شود، ولی نه دورتر', () => {
    // ساعتِ گوشی چند ثانیه اختلاف دارد؛ بدون ارفاق کاربر شکست می‌خورد.
    const t = 1111111109 * 1000;
    expect(verifyCode(RFC_SECRET, '081804', t)).toBe(true);
    expect(verifyCode(RFC_SECRET, '081804', t + 30_000)).toBe(true);
    expect(verifyCode(RFC_SECRET, '081804', t - 30_000)).toBe(true);

    // ⚠️ دو گام آن‌طرف‌تر باید رد شود.
    //
    //    اگر پنجره بزرگ‌تر شود، کدی که مهاجم از روی شانهٔ کاربر دیده
    //    دقایق بیشتری زنده می‌ماند.
    expect(verifyCode(RFC_SECRET, '081804', t + 90_000)).toBe(false);
    expect(verifyCode(RFC_SECRET, '081804', t - 90_000)).toBe(false);
  });

  it('ورودیِ بدشکل رد می‌شود، نه اینکه خطا بیندازد', () => {
    const t = Date.parse('2026-01-01T00:00:00Z');
    for (const bad of ['', '12345', '1234567', 'abcdef', '12 34 56x', '۱۲۳۴۵۶']) {
      expect(verifyCode(RFC_SECRET, bad, t)).toBe(false);
    }
  });

  it('فاصله در کدِ واردشده نادیده گرفته می‌شود', () => {
    // بعضی برنامه‌ها کد را «081 804» نشان می‌دهند و کاربر همان را
    // کپی می‌کند.  رد کردنش فقط اصطکاک است، نه امنیت.
    expect(verifyCode(RFC_SECRET, '081 804', 1111111109 * 1000)).toBe(true);
  });

  it('رازِ تازه هر بار متفاوت و به قالبِ base32 است', () => {
    const a = generateSecret();
    const b = generateSecret();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Z2-7]{32}$/);
  });

  it('رازِ خراب خطا می‌دهد، نه کدِ بی‌معنی', () => {
    // اگر بی‌صدا کدی بسازد، کاربر هرگز نمی‌تواند وارد شود و علتش
    // پیدا نیست.
    expect(() => verifyCode('!!!invalid!!!', '000000', 0)).toThrow();
  });

  it('نشانیِ otpauth شاملِ راز و صادرکننده است', () => {
    const url = otpauthUrl('ABCDEFGHIJKLMNOP', 'a@b.c');
    expect(url).toContain('otpauth://totp/');
    expect(url).toContain('secret=ABCDEFGHIJKLMNOP');
    expect(url).toContain('issuer=Molido');
    expect(url).toContain('digits=6');
  });

  it('کدهای بازیابی یکتا و خوانا هستند', () => {
    const codes = generateRecoveryCodes(8);
    expect(codes).toHaveLength(8);
    expect(new Set(codes).size).toBe(8);
    for (const c of codes) expect(c).toMatch(/^[A-Z2-7]{5}-[A-Z2-7]{5}$/);
  });
});

import {
  buildTaxId,
  checkChar,
  daysSinceEpoch,
  isValidTaxId,
  toBase32,
} from './tax-id';

/**
 * شمارهٔ منحصربه‌فرد مالیاتی هرگز نباید تکرار شود.
 *
 * تکرار یعنی سازمان صورتحساب دوم را رد می‌کند و اصلاحش دستی است — پس
 * یکتایی مهم‌ترین چیزی است که اینجا آزموده می‌شود، نه شکل ظاهری.
 */

describe('تبدیل مبنای ۳۲', () => {
  it('صفر و مقادیر کوچک', () => {
    expect(toBase32(0, 5)).toBe('00000');
    expect(toBase32(1, 5)).toBe('00001');
    expect(toBase32(31, 5)).toBe('0000V');
    expect(toBase32(32, 5)).toBe('00010');
  });

  it('سرریز خطا می‌دهد، نه بریدن', () => {
    // بریدن بی‌سروصدا یعنی دو سریال متفاوت یک شماره بگیرند.
    expect(() => toBase32(32 ** 2, 2)).toThrow();
  });

  it('مقدار منفی رد می‌شود', () => {
    expect(() => toBase32(-1, 5)).toThrow();
  });
});

describe('شمار روز', () => {
  it('روز مبدأ صفر است', () => {
    expect(daysSinceEpoch(new Date(2021, 2, 21))).toBe(0);
  });

  it('روز بعد یک است', () => {
    expect(daysSinceEpoch(new Date(2021, 2, 22))).toBe(1);
  });

  it('ساعت روز اثری ندارد', () => {
    // دو فروش در یک روز باید بخش تاریخِ یکسان بگیرند، وگرنه شمارهٔ
    // مالیاتی به ساعت وابسته می‌شود.
    const morning = daysSinceEpoch(new Date(2026, 5, 10, 8, 0));
    const night = daysSinceEpoch(new Date(2026, 5, 10, 23, 59));
    expect(morning).toBe(night);
  });

  it('تاریخ پیش از مبدأ رد می‌شود', () => {
    expect(() => daysSinceEpoch(new Date(2020, 0, 1))).toThrow();
  });
});

describe('شمارهٔ مالیاتی', () => {
  const base = { memoryId: 'A1B2C3', issuedAt: new Date(2026, 5, 10) };

  it('۲۲ نویسه است', () => {
    expect(buildTaxId({ ...base, serial: 1 })).toHaveLength(22);
  });

  it('با شناسهٔ حافظه شروع می‌شود', () => {
    expect(buildTaxId({ ...base, serial: 1 }).slice(0, 6)).toBe('A1B2C3');
  });

  it('سریال‌های متفاوت، شماره‌های متفاوت', () => {
    const seen = new Set<string>();

    for (let serial = 1; serial <= 5000; serial += 1) {
      seen.add(buildTaxId({ ...base, serial }));
    }

    expect(seen.size).toBe(5000);
  });

  it('روزهای متفاوت با یک سریال هم متفاوت‌اند', () => {
    const a = buildTaxId({ ...base, serial: 7 });
    const b = buildTaxId({ ...base, serial: 7, issuedAt: new Date(2026, 5, 11) });
    expect(a).not.toBe(b);
  });

  it('خودش را تأیید می‌کند', () => {
    expect(isValidTaxId(buildTaxId({ ...base, serial: 42 }))).toBe(true);
  });

  it('یک نویسهٔ عوض‌شده گرفته می‌شود', () => {
    const id = buildTaxId({ ...base, serial: 42 });
    const broken = id.slice(0, 8) + (id[8] === '0' ? '1' : '0') + id.slice(9);

    expect(isValidTaxId(broken)).toBe(false);
  });

  it('جابه‌جایی دو نویسه گرفته می‌شود', () => {
    // رایج‌ترین خطای تایپ دستی؛ جمع ساده آن را نمی‌گیرد و برای همین
    // وزن‌دار است.
    const id = buildTaxId({ ...base, serial: 12_345 });
    const chars = id.split('');
    let swapped: string | null = null;

    for (let i = 0; i < 20; i += 1) {
      if (chars[i] === chars[i + 1]) continue;
      const copy = [...chars];
      [copy[i], copy[i + 1]] = [copy[i + 1], copy[i]];
      swapped = copy.join('');
      break;
    }

    expect(swapped).not.toBeNull();
    expect(isValidTaxId(swapped!)).toBe(false);
  });

  it('شناسهٔ حافظهٔ نامعتبر رد می‌شود', () => {
    expect(() => buildTaxId({ ...base, memoryId: 'ABC', serial: 1 })).toThrow();
    expect(() => buildTaxId({ ...base, memoryId: 'ABCDEZ', serial: 1 })).toThrow();
  });

  it('طول یا نویسهٔ غلط، نامعتبر است', () => {
    expect(isValidTaxId('')).toBe(false);
    expect(isValidTaxId('A1B2C3')).toBe(false);
    expect(isValidTaxId('Z'.repeat(22))).toBe(false);
  });

  it('رقم کنترلی همیشه از الفبا است', () => {
    for (let serial = 1; serial <= 200; serial += 1) {
      const id = buildTaxId({ ...base, serial });
      expect('0123456789ABCDEFGHIJKLMNOPQRSTUV').toContain(id[21]);
    }
  });

  it('رقم کنترلی روی نویسهٔ نامعتبر خطا می‌دهد', () => {
    expect(() => checkChar('A1B2C3XYZ')).toThrow();
  });
});

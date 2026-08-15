import { buildCorsCheck, isLocalOrigin } from './cors';

/**
 * CORS یک تصمیم امنیتی است: اگر بیش از حد باز شود، هر سایتی در اینترنت
 * می‌تواند با نشستِ کاربر به API درخواست بزند.
 */
describe('isLocalOrigin', () => {
  it('همین دستگاه را می‌پذیرد', () => {
    expect(isLocalOrigin('http://localhost:3002')).toBe(true);
    expect(isLocalOrigin('http://127.0.0.1:3002')).toBe(true);
  });

  it('بازه‌های خصوصی را می‌پذیرد', () => {
    expect(isLocalOrigin('http://192.168.100.60:3002')).toBe(true);
    expect(isLocalOrigin('http://10.0.0.5:3002')).toBe(true);
    expect(isLocalOrigin('http://172.16.0.1:3002')).toBe(true);
    expect(isLocalOrigin('http://172.31.255.254:3002')).toBe(true);
  });

  it('مرز بازهٔ ۱۷۲.۱۶/۱۲ را درست می‌گیرد', () => {
    // اشتباه رایج، باز کردن کل 172.x است — که نیمی از آن عمومی است.
    expect(isLocalOrigin('http://172.32.0.1')).toBe(false);
    expect(isLocalOrigin('http://172.15.0.1')).toBe(false);
  });

  it('اینترنت عمومی را رد می‌کند', () => {
    expect(isLocalOrigin('https://evil.example.com')).toBe(false);
    expect(isLocalOrigin('http://8.8.8.8')).toBe(false);
  });

  it('نامی که شبیه نشانی خصوصی است ولی نیست را رد می‌کند', () => {
    // اگر بررسی روی رشته بود نه روی hostname، هر دوی این‌ها عبور می‌کردند.
    expect(isLocalOrigin('https://192.168.1.1.evil.com')).toBe(false);
    expect(isLocalOrigin('https://localhost.evil.com')).toBe(false);
  });

  it('مبدأ نامعتبر را رد می‌کند', () => {
    expect(isLocalOrigin('not a url')).toBe(false);
    expect(isLocalOrigin('')).toBe(false);
  });
});

describe('buildCorsCheck', () => {
  const allow = (origin: string | undefined, configured?: string) =>
    new Promise<boolean | undefined>((resolve, reject) => {
      buildCorsCheck(configured)(origin, (error, ok) =>
        error ? reject(error) : resolve(ok),
      );
    });

  it('درخواست بدون مبدأ را می‌پذیرد', async () => {
    // curl و اپ موبایل هدر Origin نمی‌فرستند؛ ردشان کردن فقط ابزارها را
    // می‌شکند بی‌آنکه چیزی امن‌تر شود.
    await expect(allow(undefined)).resolves.toBe(true);
  });

  it('فهرست جداشده با کاما را می‌خواند', async () => {
    const list = 'https://shop.example.com, https://admin.example.com';
    await expect(allow('https://admin.example.com', list)).resolves.toBe(true);
    await expect(allow('https://shop.example.com', list)).resolves.toBe(true);
    await expect(allow('https://other.example.com', list)).resolves.toBe(false);
  });

  it('اسلش انتهایی مانع تطبیق نمی‌شود', async () => {
    await expect(
      allow('https://shop.example.com', 'https://shop.example.com/'),
    ).resolves.toBe(true);
  });

  it('مبدأ محلی حتی بدون تنظیم مجاز است', async () => {
    // همین چیزی است که «Failed to fetch» را درست می‌کند: پنل روی
    // localhost باز می‌شود در حالی که CORS_ORIGIN روی IP شبکه تنظیم است.
    await expect(allow('http://localhost:3002')).resolves.toBe(true);
    await expect(allow('http://192.168.1.50:3002')).resolves.toBe(true);
  });

  it('مبدأ عمومیِ تنظیم‌نشده رد می‌شود', async () => {
    await expect(allow('https://evil.example.com')).resolves.toBe(false);
  });
});

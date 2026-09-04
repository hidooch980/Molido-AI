import {
  fingerprint,
  isWorthRecording,
  normalizeMessage,
  normalizePath,
} from './fingerprint';

/**
 * گروه‌بندی درست، کل ارزش ثبت خطاست.
 *
 * دو شکست ممکن، و هر دو بد:
 *   • **زیرگروه‌بندی** — هر رخداد گروه خودش شود؛ فهرست هزارتایی که کسی
 *     نمی‌خواندش، یعنی همان لاگ بی‌فایدهٔ فعلی.
 *   • **بیش‌گروه‌بندی** — دو خطای متفاوت یکی شمرده شوند؛ یکی‌شان برای
 *     همیشه پنهان می‌ماند.
 */

describe('نرمال‌سازی پیام', () => {
  it('شناسه‌های UUID یکی می‌شوند', () => {
    const a = normalizeMessage('کالای 3f2504e0-4f89-11d3-9a0c-0305e82c3301 یافت نشد');
    const b = normalizeMessage('کالای 7c9e6679-7425-40de-944b-e07fc1f90ae7 یافت نشد');
    expect(a).toBe(b);
  });

  it('مبالغ یکی می‌شوند', () => {
    expect(normalizeMessage('مبلغ ۱٬۲۵۰٬۰۰۰ نامعتبر است')).toBe(
      normalizeMessage('مبلغ ۹۸۰٬۰۰۰ نامعتبر است'),
    );
  });

  it('شمارهٔ فاکتور یکی می‌شود', () => {
    expect(normalizeMessage('فاکتور INV-1786619271263 یافت نشد')).toBe(
      normalizeMessage('فاکتور INV-1786604571717 یافت نشد'),
    );
  });

  it('نام داخل گیومه یکی می‌شود', () => {
    expect(normalizeMessage('کالای «برنج ایرانی» ناموجود است')).toBe(
      normalizeMessage('کالای «روغن آفتابگردان» ناموجود است'),
    );
  });

  it('تاریخ یکی می‌شود', () => {
    expect(normalizeMessage('در 2026-08-13T21:19:46.227Z شکست خورد')).toBe(
      normalizeMessage('در 2025-01-02T03:04:05.000Z شکست خورد'),
    );
  });

  it('دو خطای واقعاً متفاوت جدا می‌مانند', () => {
    // بیش‌گروه‌بندی یعنی یکی از این دو برای همیشه پنهان شود.
    expect(normalizeMessage('انبار یافت نشد')).not.toBe(
      normalizeMessage('کالا یافت نشد'),
    );
  });

  it('طول محدود می‌ماند', () => {
    expect(normalizeMessage('x'.repeat(1000)).length).toBeLessThanOrEqual(300);
  });
});

describe('نرمال‌سازی مسیر', () => {
  it('شناسهٔ عددی', () => {
    expect(normalizePath('/products/123')).toBe('/products/:id');
  });

  it('شناسهٔ UUID', () => {
    expect(normalizePath('/sales/3f2504e0-4f89-11d3-9a0c-0305e82c3301/print')).toBe(
      '/sales/:id/print',
    );
  });

  it('پرسمان حذف می‌شود', () => {
    expect(normalizePath('/products?search=برنج&limit=100')).toBe('/products');
  });

  it('نام ماژول دست‌نخورده می‌ماند', () => {
    // اگر «products» هم شناسه حساب می‌شد، همهٔ مسیرها یکی می‌شدند.
    expect(normalizePath('/products')).toBe('/products');
    expect(normalizePath('/tax/settings')).toBe('/tax/settings');
  });
});

describe('اثر انگشت', () => {
  it('یک خطای تکراری، یک اثر انگشت', () => {
    const a = fingerprint({
      message: 'کالای 3f2504e0-4f89-11d3-9a0c-0305e82c3301 یافت نشد',
      path: '/products/3f2504e0-4f89-11d3-9a0c-0305e82c3301',
      statusCode: 500,
    });

    const b = fingerprint({
      message: 'کالای 7c9e6679-7425-40de-944b-e07fc1f90ae7 یافت نشد',
      path: '/products/7c9e6679-7425-40de-944b-e07fc1f90ae7',
      statusCode: 500,
    });

    expect(a).toBe(b);
  });

  it('کد وضعیت متفاوت، گروه متفاوت', () => {
    // «یافت نشد» و «دسترسی ندارید» روی یک مسیر، دو مشکل‌اند.
    const notFound = fingerprint({ message: 'خطا', path: '/x', statusCode: 404 });
    const forbidden = fingerprint({ message: 'خطا', path: '/x', statusCode: 403 });
    expect(notFound).not.toBe(forbidden);
  });

  it('مسیر متفاوت، گروه متفاوت', () => {
    const a = fingerprint({ message: 'خطای داخلی', path: '/sales', statusCode: 500 });
    const b = fingerprint({ message: 'خطای داخلی', path: '/products', statusCode: 500 });
    expect(a).not.toBe(b);
  });

  it('طول ثابت و کوتاه', () => {
    expect(fingerprint({ message: 'x', statusCode: 500 })).toHaveLength(16);
  });

  it('ورودی خالی هم اثر انگشت می‌دهد', () => {
    expect(fingerprint({ message: '' })).toHaveLength(16);
  });
});

describe('ارزش ثبت', () => {
  it('خطای سرور ثبت می‌شود', () => {
    expect(isWorthRecording(500)).toBe(true);
    expect(isWorthRecording(503)).toBe(true);
  });

  it('اعتبارسنجی و ۴۰۴ ثبت نمی‌شوند', () => {
    // این‌ها رفتار روزمرهٔ کاربرند نه خطای برنامه؛ ثبتشان خطاهای واقعی
    // را زیر خودش دفن می‌کند.
    expect(isWorthRecording(400)).toBe(false);
    expect(isWorthRecording(401)).toBe(false);
    expect(isWorthRecording(404)).toBe(false);
  });

  it('محدودیت نرخ و تعارض ثبت می‌شوند', () => {
    expect(isWorthRecording(429)).toBe(true);
    expect(isWorthRecording(409)).toBe(true);
  });
});

import { createHash } from 'node:crypto';

/**
 * اثر انگشت خطا — تابع خالص.
 *
 * کل ارزش ثبت خطا در گروه‌بندی درست است.  اگر هر رخداد گروه خودش شود،
 * فهرست هزارتایی می‌شود که کسی نمی‌خواندش — دقیقاً همان لاگی که الان
 * داریم و بی‌فایده است.
 *
 * پس هر چیزی که **بین دو رخدادِ یک خطا فرق می‌کند** باید حذف شود:
 * شناسه‌ها، تاریخ‌ها، مبالغ، شمارهٔ فاکتور.  آنچه می‌ماند شکلِ خطاست.
 */

/**
 * نرمال‌سازی پیام.
 *
 * ترتیب جایگزینی‌ها مهم است: UUID پیش از عدد می‌آید، وگرنه بخش‌های عددیِ
 * UUID جدا جایگزین می‌شوند و اثر انگشت‌های متفاوت می‌سازند.
 */
export function normalizeMessage(message: string): string {
  return String(message ?? '')
    .replace(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
      '{id}',
    )
    // شناسه‌های داخلی مثل seed-p3 یا INV-1786619271263
    .replace(/\b[A-Z]{2,}-[A-Za-z0-9]+\b/g, '{code}')
    // تاریخ ISO
    .replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z?/g, '{date}')
    // هر عدد: مبلغ، شمارهٔ فاکتور، مهر زمانی، تعداد.
    //
    // ارقام فارسی و عربی صریح آمده‌اند: `\d` در جاوااسکریپت فقط ۰ تا ۹
    // لاتین را می‌گیرد و پیام‌های این سامانه اغلب فارسی‌اند — یعنی
    // «مبلغ ۱٬۲۵۰٬۰۰۰» و «مبلغ ۹۸۰٬۰۰۰» دو گروه جدا می‌شدند.
    .replace(/[\d۰-۹٠-٩][\d۰-۹٠-٩,٬.،]*/g, '{n}')
    // متن داخل گیومه معمولاً نام کاربر یا کالاست
    .replace(/«[^»]*»/g, '«{s}»')
    .replace(/"[^"]*"/g, '"{s}"')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300);
}

/**
 * مسیر بدون پارامتر.
 *
 * `/products/abc-123` و `/products/def-456` یک مسیرند؛ بدون این، هر کالا
 * گروه خطای خودش را می‌سازد.
 */
export function normalizePath(path: string): string {
  return String(path ?? '')
    .split('?')[0]
    .split('/')
    .map((segment) => {
      if (!segment) return segment;

      // بخشی که شبیه شناسه است — UUID، عدد، یا رشتهٔ بلندِ بی‌معنا
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(segment)) return ':id';
      if (/^\d+$/.test(segment)) return ':id';
      if (/^[A-Za-z0-9_-]{20,}$/.test(segment)) return ':id';

      return segment;
    })
    .join('/')
    .slice(0, 200);
}

/**
 * اثر انگشت نهایی.
 *
 * از پیام نرمال‌شده، مسیر و کد وضعیت ساخته می‌شود.  کد وضعیت داخلش هست
 * چون «یافت نشد» روی یک مسیر با «دسترسی ندارید» روی همان مسیر، دو مشکل
 * متفاوت‌اند.
 */
export function fingerprint(input: {
  message: string;
  path?: string;
  statusCode?: number;
}): string {
  const parts = [
    normalizeMessage(input.message),
    normalizePath(input.path ?? ''),
    String(input.statusCode ?? 0),
  ];

  return createHash('sha1').update(parts.join('|')).digest('hex').slice(0, 16);
}

/**
 * آیا این خطا ارزش ثبت دارد.
 *
 * خطای اعتبارسنجی و ۴۰۴ عادی، خطای **برنامه** نیستند — رفتار روزمرهٔ
 * کاربرند.  ثبتشان جدول را پر می‌کند و خطاهای واقعی را زیر خودش دفن
 * می‌کند.
 */
export function isWorthRecording(statusCode: number): boolean {
  // ۵xx همیشه؛ یعنی چیزی در سرور شکسته.
  if (statusCode >= 500) return true;

  // ۴۲۹ (محدودیت نرخ) و ۴۰۹ (تعارض) نشانهٔ مشکل واقعی‌اند.
  if (statusCode === 429 || statusCode === 409) return true;

  return false;
}

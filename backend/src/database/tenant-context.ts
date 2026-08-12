import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * زمینهٔ شرکت برای هر درخواست.
 *
 * جداسازی شرکت‌ها تا امروز فقط با `WHERE "companyId" = $1` در کد بود.  در
 * ۸۵ ماژول، یک `WHERE` فراموش‌شده یعنی نشت داده بین شرکت‌ها — و چنین
 * اشتباهی هیچ خطایی نمی‌دهد، فقط بی‌سروصدا داده‌های شرکت دیگر را برمی‌گرداند.
 *
 * راه‌حل: شناسهٔ شرکت در `AsyncLocalStorage` نگه داشته می‌شود و
 * `DatabaseService` آن را روی هر اتصال به‌صورت `app.company_id` می‌گذارد.
 * سیاست‌های RLS در دیتابیس همان مقدار را می‌خوانند.  با این کار قاعده در
 * سطح دیتابیس اعمال می‌شود، نه در کد — و فراموش کردن `WHERE` دیگر نشت
 * نمی‌سازد.
 *
 * چرا AsyncLocalStorage و نه پارامتر: افزودن پارامتر به همهٔ متدها یعنی
 * تغییر امضای صدها متد و صدها فراخوان؛ هر جای جامانده هم دوباره همان حفره
 * را باز می‌کند.
 */

export type TenantContext = {
  companyId: string | null;
  userId: string | null;
  /**
   * کارهای سیستمی (مهاجرت، داده اولیه، زمان‌بند) که به همهٔ شرکت‌ها کار
   * دارند.  این پرچم فقط از داخل کد قابل تنظیم است و هرگز از درخواست HTTP
   * نمی‌آید.
   */
  system?: boolean;
};

const storage = new AsyncLocalStorage<TenantContext>();

/** اجرای یک قطعه کد در زمینهٔ یک شرکت مشخص. */
export function runInTenant<T>(context: TenantContext, work: () => T): T {
  return storage.run(context, work);
}

/**
 * اجرای کار سیستمی — بدون محدودیت شرکت.
 * فقط برای مهاجرت، داده اولیه و کارهای زمان‌بندی‌شده.
 */
export function runAsSystem<T>(work: () => T): T {
  return storage.run({ companyId: null, userId: null, system: true }, work);
}

export function currentTenant(): TenantContext | undefined {
  return storage.getStore();
}

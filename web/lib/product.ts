/**
 * محصول فعال در سمت وب.
 *
 * بک‌اند با `MOLIDO_PRODUCT` تصمیم می‌گیرد کدام ماژول‌ها بالا بیایند؛ اگر وب
 * از این تصمیم بی‌خبر بماند، منو صفحه‌هایی را نشان می‌دهد که اندپوینتشان
 * ۴۰۴ می‌دهد — کاربر روی «رستوران» کلیک می‌کند و به صفحهٔ خطا می‌رسد.
 *
 * فهرست قابلیت‌ها باید با `backend/src/product.ts` یکی بماند.
 */

/**
 * ⚠️ نام‌ها **عیناً** از `backend/src/product.ts` می‌آیند.
 *
 *    پیش‌تر اینجا `municipality` نوشته شده بود و بک‌اند `municipal`.
 *    نتیجه‌اش این نبود که چیزی خطا بدهد — بلکه هیچ‌کس از آن کلید
 *    استفاده نکرد و یازده صفحهٔ شهرداری **بی‌گیت** ماندند: کاربرِ
 *    فروشگاه «پارکینگ» را در منو می‌دید و با کلیک ۴۰۴ می‌گرفت.
 *
 *    سه قابلیتِ `verticals`، `operations` و `shop` هم اصلاً اینجا
 *    نبودند.  نگهبانِ `verify-product-features` حالا این دو فایل را
 *    مقایسه می‌کند تا دوباره از هم دور نیفتند.
 */
export type FeatureKey =
  | 'catalogue'
  | 'sales'
  | 'retail'
  | 'restaurant'
  | 'hr'
  | 'ration'
  | 'finance'
  | 'crm'
  | 'shop';

const FEATURES: Record<string, FeatureKey[]> = {
  store: ['catalogue', 'sales', 'retail', 'ration', 'hr', 'finance', 'crm', 'shop'],
  resto: ['catalogue', 'sales', 'restaurant', 'hr', 'finance', 'crm', 'shop'],
  suite: [
    'catalogue',
    'sales',
    'retail',
    'restaurant',
    'ration',
    'hr',
    'finance',
    'crm',
    'shop',
  ],
};

/**
 * در Next.js متغیرهای NEXT_PUBLIC_ هنگام build جاسازی می‌شوند، پس این مقدار
 * باید حتماً به‌صورت ثابت خوانده شود (نه با اندیس پویا) وگرنه در باندل جا
 * نمی‌افتد.  اگر تنظیم نشده باشد، `suite` یعنی همه‌چیز دیده می‌شود — همان
 * رفتار پیش از این تغییر.
 */
const activeKey = (process.env.NEXT_PUBLIC_MOLIDO_PRODUCT || 'suite').trim();

export const PRODUCT = FEATURES[activeKey] ? activeKey : 'suite';

export function hasFeature(feature: FeatureKey): boolean {
  return (FEATURES[PRODUCT] ?? FEATURES.suite).includes(feature);
}

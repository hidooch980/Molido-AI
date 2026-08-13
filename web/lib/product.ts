/**
 * محصول فعال در سمت وب.
 *
 * بک‌اند با `MOLIDO_PRODUCT` تصمیم می‌گیرد کدام ماژول‌ها بالا بیایند؛ اگر وب
 * از این تصمیم بی‌خبر بماند، منو صفحه‌هایی را نشان می‌دهد که اندپوینتشان
 * ۴۰۴ می‌دهد — کاربر روی «رستوران» کلیک می‌کند و به صفحهٔ خطا می‌رسد.
 *
 * فهرست قابلیت‌ها باید با `backend/src/product.ts` یکی بماند.
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
  | 'municipality';

const FEATURES: Record<string, FeatureKey[]> = {
  store: ['catalogue', 'sales', 'retail', 'ration', 'hr', 'finance', 'crm'],
  resto: ['catalogue', 'sales', 'restaurant', 'hr', 'finance', 'crm'],
  suite: [
    'catalogue',
    'sales',
    'retail',
    'restaurant',
    'ration',
    'hr',
    'finance',
    'crm',
    'municipality',
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

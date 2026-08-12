/**
 * تعریف محصول
 *
 * Molido چند محصول مستقل است که روی یک کد پایه ساخته می‌شوند: فروشگاه،
 * رستوران، و نسخهٔ کامل سازمانی.  هر کدام دیتابیس، استقرار و نصب جداگانهٔ خود
 * را دارند؛ مشتریِ رستوران هرگز چیزی از عوارض شهرداری نمی‌بیند.
 *
 * چرا کد مشترک است ولی داده جدا:
 * جدا کردن داده کار درستی است — رستوران و فروشگاه دو کسب‌وکار مستقل‌اند.  ولی
 * جدا کردن *کد* یعنی هر رفع باگ در حسابداری، انبار یا احراز هویت باید چند بار
 * انجام شود، و نسخه‌ها به‌سرعت از هم دور می‌افتند.  بنابراین یک کد پایه می‌ماند
 * و در زمان اجرا فقط ماژول‌های همان محصول بار می‌شوند.
 *
 * انتخاب محصول با متغیر `MOLIDO_PRODUCT` انجام می‌شود.
 */

export type ProductKey = 'store' | 'resto' | 'suite';

/**
 * ماژول‌هایی که هر محصول لازم دارد.
 *
 * «هسته» در همهٔ محصول‌ها هست و اینجا فهرست نمی‌شود: احراز هویت، کاربران،
 * شرکت، دیتابیس، چندزبانه، اتوماسیون، حسابداری، گزارش و هوش مصنوعی.
 */
export type ProductSpec = {
  key: ProductKey;
  /** نامی که در Swagger و صفحهٔ ورود دیده می‌شود. */
  title: string;
  /** گروه‌های ماژول فعال — نگاشتشان در `app.module.ts` است. */
  features: readonly FeatureKey[];
};

export type FeatureKey =
  /** کالا، انبار، موجودی، تأمین‌کننده، خرید — پایهٔ هر کسب‌وکار کالایی */
  | 'catalogue'
  /** فروش، پرداخت، صندوق، مشتری */
  | 'sales'
  /** صندوق فروشگاهی: بارکد ترازو، شیفت، کالای وزنی */
  | 'retail'
  /** کالابرگ الکترونیکی */
  | 'ration'
  /** کافه‌رستوران: میز، منو، رسپی، آشپزخانه، رزرو */
  | 'restaurant'
  /** منابع انسانی، حقوق، حضور و غیاب */
  | 'hr'
  /** خزانه، چک، قرارداد، بودجه، دارایی */
  | 'finance'
  /** شهرداری و خدمات شهری */
  | 'municipal'
  /** ماژول‌های صنفی دیگر: کلینیک، پارکینگ، تاکسی، آرامستان */
  | 'verticals'
  /** CRM، تیکت، نظرسنجی، کمپین */
  | 'crm'
  /** پروژه، ناوگان، مکاتبات، گردش تأیید */
  | 'operations';

export const PRODUCTS: Record<ProductKey, ProductSpec> = {
  store: {
    key: 'store',
    title: 'Molido فروشگاه',
    features: ['catalogue', 'sales', 'retail', 'ration', 'finance', 'crm'],
  },

  // رستوران هم کالا و انبار لازم دارد — رسپی از موجودی مواد اولیه کم می‌کند —
  // ولی نه صندوق فروشگاهی می‌خواهد نه کالابرگ.
  resto: {
    key: 'resto',
    title: 'Molido رستوران',
    features: ['catalogue', 'sales', 'restaurant', 'finance', 'crm'],
  },

  // نسخهٔ کامل: همهٔ ماژول‌ها، برای سازمان و شهرداری
  suite: {
    key: 'suite',
    title: 'Molido AI',
    features: [
      'catalogue',
      'sales',
      'retail',
      'ration',
      'restaurant',
      'hr',
      'finance',
      'municipal',
      'verticals',
      'crm',
      'operations',
    ],
  },
};

/**
 * محصول فعال.
 *
 * مقدار نامعتبر عمداً خطا می‌دهد و به `suite` برنمی‌گردد: راه‌اندازی با تنظیم
 * غلط باید همان لحظه شکست بخورد، نه اینکه ماژول‌هایی روشن شوند که مشتری
 * نخریده است.
 */
export function activeProduct(): ProductSpec {
  const key = (process.env.MOLIDO_PRODUCT ?? 'suite').trim() as ProductKey;

  const spec = PRODUCTS[key];
  if (!spec) {
    throw new Error(
      `MOLIDO_PRODUCT نامعتبر است: «${key}». مقادیر مجاز: ${Object.keys(PRODUCTS).join('، ')}`,
    );
  }

  return spec;
}

/** آیا این قابلیت در محصول فعال روشن است؟ */
export function hasFeature(feature: FeatureKey): boolean {
  return activeProduct().features.includes(feature);
}

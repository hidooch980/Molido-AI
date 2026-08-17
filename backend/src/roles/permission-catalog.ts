/**
 * فهرست اختیاراتِ قابل ویرایش.
 *
 * ⚠️ عمداً دستی است، نه خودکار از روی `@Roles`.
 *
 *    وسوسه‌اش هست که همهٔ ۲۹۱ مسیر خودکار در فهرست بیایند.  ولی
 *    فهرستی با ۲۹۱ ردیفِ فنی (`POST /sales/:id/cancel`) برای مدیرِ
 *    فروشگاه بی‌معنی است — و انتخاب از میان چیزی که نمی‌فهمی، بدتر از
 *    نداشتنِ انتخاب است.
 *
 *    این فهرست کارهایی است که یک صاحبِ کسب‌وکار واقعاً می‌خواهد
 *    جابه‌جا کند، به زبانِ خودش.  هر ردیف باید `@Permission` متناظرش
 *    را در کنترلر داشته باشد، وگرنه تنظیمش اثری ندارد.
 *
 *    `roles.sh` همین را می‌سنجد: هر کلیدِ این فهرست باید در کد
 *    استفاده شده باشد و برعکس.
 */

export const ROLE_LABELS = [
  { code: 'SUPER_ADMIN', label: 'مدیر ارشد' },
  { code: 'ADMIN', label: 'مدیر' },
  { code: 'MANAGER', label: 'سرپرست' },
  { code: 'ACCOUNTANT', label: 'حسابدار' },
  { code: 'CASHIER', label: 'صندوق‌دار' },
  { code: 'INVENTORY', label: 'انباردار' },
  { code: 'EMPLOYEE', label: 'کارمند' },
] as const;

export type PermissionItem = {
  key: string;
  label: string;
  /** نقش‌هایی که در کد اجازه دارند — پیش‌فرض، پیش از هر بازنویسی. */
  defaultRoles: string[];
};

export const PERMISSION_CATALOG: Array<{
  group: string;
  label: string;
  items: PermissionItem[];
}> = [
  {
    group: 'sales',
    label: 'فروش',
    items: [
      {
        key: 'sales:cancel',
        label: 'لغو فاکتور فروش',
        // لغو فاکتور، انبار و حساب را برمی‌گرداند.  صندوق‌دار معمولاً
        // نباید بتواند، ولی فروشگاه کوچک که یک نفر است، باید بتواند.
        defaultRoles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER'],
      },
      {
        key: 'sales:discount',
        label: 'تخفیف دستی',
        defaultRoles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER'],
      },
      {
        key: 'sales:report',
        label: 'دیدن گزارش فروش',
        defaultRoles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT'],
      },
    ],
  },
  {
    group: 'inventory',
    label: 'انبار',
    items: [
      {
        key: 'inventory:adjust',
        label: 'اصلاح دستی موجودی',
        defaultRoles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'INVENTORY'],
      },
      {
        key: 'inventory:count',
        label: 'انبارگردانی',
        defaultRoles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'INVENTORY'],
      },
    ],
  },
  {
    group: 'purchasing',
    label: 'خرید',
    items: [
      {
        key: 'purchasing:order',
        label: 'ثبت سفارش خرید',
        defaultRoles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER'],
      },
      {
        key: 'purchasing:dial',
        label: 'زنگ زدن به بنکدار',
        defaultRoles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER'],
      },
    ],
  },
  {
    group: 'restaurant',
    label: 'رستوران',
    items: [
      {
        key: 'restaurant:menu',
        label: 'ویرایش منو',
        defaultRoles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER'],
      },
      {
        key: 'restaurant:settle',
        label: 'تسویه سفارش',
        defaultRoles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'CASHIER'],
      },
    ],
  },
  {
    group: 'finance',
    label: 'مالی',
    items: [
      {
        key: 'finance:payroll',
        label: 'صدور فیش حقوقی',
        defaultRoles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT'],
      },
      {
        key: 'finance:journal',
        label: 'ثبت سند دستی',
        defaultRoles: ['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT'],
      },
    ],
  },
];

const KNOWN = new Set(
  PERMISSION_CATALOG.flatMap((g) => g.items.map((i) => i.key)),
);

export function isKnownPermission(key: string): boolean {
  return KNOWN.has(key);
}

/** همهٔ کلیدها — برای آزمون. */
export function allPermissionKeys(): string[] {
  return [...KNOWN];
}

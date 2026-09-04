/**
 * فهرستِ سفیدِ گزارش‌ساز.
 *
 * ⚠️ **این فایل تنها چیزی است که میان کاربر و پایگاه‌داده ایستاده.**
 *
 *    گزارش‌ساز یعنی کاربر پرس‌وجو می‌سازد.  اگر نامِ میدان از ورودی
 *    مستقیم به SQL برود، هر کاربرِ سامانه می‌تواند دادهٔ شرکت‌های دیگر،
 *    درهم‌سازیِ رمزها و کلیدهای API را بخواند — و پاک کند.
 *
 *    پس هیچ رشته‌ای از کاربر وارد SQL نمی‌شود.  کاربر **کلید** می‌دهد؛
 *    عبارتِ SQL از همین‌جا برداشته می‌شود.  مقدارها همیشه پارامترند.
 *
 * ⚠️ و افزودنِ میدانِ تازه یعنی یک سطر اینجا — که همان‌جا هم بازبینی
 *    می‌شود.  اگر میدانی این‌جا نباشد، از هیچ راهی قابلِ گزارش نیست.
 */

export type FieldKind = 'text' | 'number' | 'date' | 'enum';

export interface DatasetField {
  /** کلیدی که کاربر می‌فرستد. */
  key: string;
  label: string;
  /** عبارتِ SQL — **هرگز از ورودی نمی‌آید**. */
  sql: string;
  kind: FieldKind;
  /** آیا می‌شود روی آن گروه‌بندی کرد. */
  groupable?: boolean;
  /** آیا می‌شود روی آن تجمیع کرد (فقط عددی). */
  aggregatable?: boolean;
}

export interface Dataset {
  key: string;
  label: string;
  /**
   * پرس‌وجوی پایه.
   *
   * ⚠️ `$1` همیشه `companyId` است.
   *
   *    امنیتِ واقعی از RLS می‌آید — `applyTenant` روی هر اتصال
   *    `app.company_id` را می‌گذارد و سیاست‌ها فیلتر می‌کنند.  این شرط
   *    لایهٔ دوم است، نه لایهٔ اول: اگر روزی جدولی RLS نداشته باشد،
   *    این نگه‌اش می‌دارد.
   */
  from: string;
  fields: DatasetField[];
}

const SALES: Dataset = {
  key: 'sales',
  label: 'فروش',
  from: `
    FROM "Sale" s
    LEFT JOIN "Customer" c ON c.id = s."customerId"
    LEFT JOIN "User" u ON u.id = s."userId"
    LEFT JOIN "Warehouse" w ON w.id = s."warehouseId"
   WHERE s."companyId" = $1`,
  fields: [
    { key: 'invoiceNo', label: 'شماره فاکتور', sql: 's."invoiceNo"', kind: 'text', groupable: true },
    { key: 'date', label: 'تاریخ', sql: 's."createdAt"', kind: 'date', groupable: true },
    { key: 'status', label: 'وضعیت', sql: 's.status', kind: 'enum', groupable: true },
    {
      key: 'customerName', label: 'مشتری',
      sql: `btrim(concat_ws(' ', c."firstName", c."lastName"))`,
      kind: 'text', groupable: true,
    },
    { key: 'cashier', label: 'صندوق‌دار', sql: `btrim(concat_ws(' ', u."firstName", u."lastName"))`, kind: 'text', groupable: true },
    { key: 'warehouse', label: 'انبار', sql: 'w.name', kind: 'text', groupable: true },
    { key: 'subtotal', label: 'جمع', sql: 's.subtotal', kind: 'number', aggregatable: true },
    { key: 'discount', label: 'تخفیف', sql: 's.discount', kind: 'number', aggregatable: true },
    { key: 'tax', label: 'مالیات', sql: 's.tax', kind: 'number', aggregatable: true },
    { key: 'total', label: 'مبلغ کل', sql: 's.total', kind: 'number', aggregatable: true },
  ],
};

const PURCHASES: Dataset = {
  key: 'purchases',
  label: 'خرید',
  from: `
    FROM "Purchase" p
    LEFT JOIN "Supplier" su ON su.id = p."supplierId"
    LEFT JOIN "Warehouse" w ON w.id = p."warehouseId"
   WHERE p."companyId" = $1`,
  fields: [
    { key: 'purchaseNo', label: 'شماره خرید', sql: 'p."purchaseNo"', kind: 'text', groupable: true },
    { key: 'date', label: 'تاریخ', sql: 'p."createdAt"', kind: 'date', groupable: true },
    { key: 'status', label: 'وضعیت', sql: 'p.status', kind: 'enum', groupable: true },
    { key: 'supplier', label: 'تأمین‌کننده', sql: 'su.name', kind: 'text', groupable: true },
    { key: 'warehouse', label: 'انبار', sql: 'w.name', kind: 'text', groupable: true },
    { key: 'subtotal', label: 'جمع', sql: 'p.subtotal', kind: 'number', aggregatable: true },
    { key: 'tax', label: 'مالیات', sql: 'p.tax', kind: 'number', aggregatable: true },
    { key: 'total', label: 'مبلغ کل', sql: 'p.total', kind: 'number', aggregatable: true },
  ],
};

const INVENTORY: Dataset = {
  key: 'inventory',
  label: 'موجودی',
  from: `
    FROM "Inventory" i
    JOIN "Product" pr ON pr.id = i."productId"
    JOIN "Warehouse" w ON w.id = i."warehouseId"
   WHERE w."companyId" = $1`,
  fields: [
    { key: 'product', label: 'کالا', sql: 'pr.name', kind: 'text', groupable: true },
    { key: 'sku', label: 'کد کالا', sql: 'pr.sku', kind: 'text', groupable: true },
    { key: 'warehouse', label: 'انبار', sql: 'w.name', kind: 'text', groupable: true },
    { key: 'unit', label: 'واحد', sql: 'pr.unit', kind: 'text', groupable: true },
    { key: 'quantity', label: 'موجودی', sql: 'i.quantity', kind: 'number', aggregatable: true },
    { key: 'avgCost', label: 'بهای میانگین', sql: 'i."avgCost"', kind: 'number', aggregatable: true },
    {
      key: 'stockValue', label: 'ارزش موجودی',
      sql: 'i.quantity * COALESCE(i."avgCost", 0)',
      kind: 'number', aggregatable: true,
    },
  ],
};

const LEDGER: Dataset = {
  key: 'ledger',
  label: 'دفتر کل',
  from: `
    FROM "JournalLine" l
    JOIN "JournalEntry" e ON e.id = l."entryId"
    JOIN "Account" a ON a.id = l."accountId"
   WHERE e."companyId" = $1 AND e.status <> 'DRAFT'`,
  fields: [
    { key: 'entryNo', label: 'شماره سند', sql: 'e."entryNo"', kind: 'text', groupable: true },
    { key: 'date', label: 'تاریخ سند', sql: 'e."entryDate"', kind: 'date', groupable: true },
    { key: 'sourceType', label: 'منشأ', sql: 'e."sourceType"', kind: 'enum', groupable: true },
    { key: 'accountCode', label: 'کد حساب', sql: 'a.code', kind: 'text', groupable: true },
    { key: 'accountName', label: 'نام حساب', sql: 'a.name', kind: 'text', groupable: true },
    { key: 'accountType', label: 'نوع حساب', sql: 'a.type', kind: 'enum', groupable: true },
    { key: 'debit', label: 'بدهکار', sql: 'l.debit', kind: 'number', aggregatable: true },
    { key: 'credit', label: 'بستانکار', sql: 'l.credit', kind: 'number', aggregatable: true },
  ],
};

export const DATASETS: Record<string, Dataset> = {
  sales: SALES,
  purchases: PURCHASES,
  inventory: INVENTORY,
  ledger: LEDGER,
};

/**
 * عملگرهای مجاز.
 *
 * ⚠️ نگاشت از کلیدِ کاربر به عبارتِ SQL — نه پذیرفتنِ رشتهٔ عملگر.
 *    وگرنه `op = "= 1 OR 1=1 --"` کارِ خودش را می‌کند.
 */
export const OPERATORS: Record<string, string> = {
  eq: '=',
  ne: '<>',
  gt: '>',
  gte: '>=',
  lt: '<',
  lte: '<=',
  contains: 'ILIKE',
};

/** توابعِ تجمیعِ مجاز — باز هم نگاشت، نه رشتهٔ آزاد. */
export const AGGREGATES: Record<string, string> = {
  sum: 'SUM',
  avg: 'AVG',
  min: 'MIN',
  max: 'MAX',
  count: 'COUNT',
};

/** سقفِ سطرها.  گزارش‌سازِ بی‌سقف، دکمهٔ از کار انداختنِ سرور است. */
export const MAX_ROWS = 5000;
export const DEFAULT_ROWS = 200;

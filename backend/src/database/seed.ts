/**
 * Seed دیتابیس Molido AI
 * اجرا: npm run seed
 *
 * Idempotent: every insert is `ON CONFLICT DO NOTHING` against a fixed id, so
 * running it twice leaves the same rows behind.
 */
import process from 'node:process';
import * as bcrypt from 'bcrypt';
import { Pool } from 'pg';
import { adminDatabaseConfig } from './connection';

const SEED_COMPANY = 'seed-company';
const SEED_WAREHOUSE = 'seed-warehouse';
const SEED_CATEGORY = 'seed-category';

const PRODUCTS = [
  {
    id: 'seed-p1',
    name: 'برنج ایرانی ۱۰ کیلویی',
    sku: 'RICE-10',
    purchasePrice: 900_000,
    salePrice: 1_100_000,
    unit: 'کیسه',
  },
  {
    id: 'seed-p2',
    name: 'روغن آفتابگردان',
    sku: 'OIL-01',
    purchasePrice: 120_000,
    salePrice: 155_000,
    unit: 'عدد',
  },
  {
    id: 'seed-p3',
    name: 'قند ۵ کیلویی',
    sku: 'SUGAR-5',
    purchasePrice: 250_000,
    salePrice: 310_000,
    unit: 'بسته',
  },
];


/**
 * کدینگ حساب‌ها
 *
 * ساختار چهار سطحی متعارف: گروه ← کل ← معین.  فقط به حساب معین (برگ) سند
 * می‌خورد؛ حساب کل جمع فرزندانش است و `isPostable` آن false است.
 *
 * کدها با آنچه `PostingService` هنگام صدور سند خودکار استفاده می‌کند یکی است؛
 * تغییرشان بدون به‌روزرسانی نگاشت سند، ثبت خودکار را می‌شکند.
 */
const CHART_OF_ACCOUNTS: Array<{
  code: string;
  name: string;
  type: string;
  parent?: string;
  postable?: boolean;
}> = [
  // ---------- دارایی ----------
  { code: '1000', name: 'دارایی‌ها', type: 'ASSET', postable: false },
  { code: '1100', name: 'دارایی جاری', type: 'ASSET', parent: '1000', postable: false },
  { code: '1101', name: 'صندوق', type: 'ASSET', parent: '1100' },
  { code: '1102', name: 'بانک', type: 'ASSET', parent: '1100' },
  { code: '1103', name: 'حساب‌های دریافتنی', type: 'ASSET', parent: '1100' },
  { code: '1104', name: 'موجودی کالا', type: 'ASSET', parent: '1100' },
  { code: '1105', name: 'اسناد دریافتنی (چک)', type: 'ASSET', parent: '1100' },
  { code: '1106', name: 'مالیات بر ارزش افزودهٔ خرید', type: 'ASSET', parent: '1100' },
  { code: '1200', name: 'دارایی ثابت', type: 'ASSET', parent: '1000', postable: false },
  { code: '1201', name: 'اموال و تجهیزات', type: 'ASSET', parent: '1200' },

  // ---------- بدهی ----------
  { code: '2000', name: 'بدهی‌ها', type: 'LIABILITY', postable: false },
  { code: '2101', name: 'حساب‌های پرداختنی', type: 'LIABILITY', parent: '2000' },
  { code: '2102', name: 'اسناد پرداختنی', type: 'LIABILITY', parent: '2000' },
  { code: '2103', name: 'مالیات بر ارزش افزوده', type: 'LIABILITY', parent: '2000' },
  { code: '2104', name: 'حقوق پرداختنی', type: 'LIABILITY', parent: '2000' },
  { code: '2105', name: 'بیمه پرداختنی', type: 'LIABILITY', parent: '2000' },

  // ---------- سرمایه ----------
  { code: '3000', name: 'سرمایه', type: 'EQUITY', postable: false },
  { code: '3101', name: 'سرمایهٔ اولیه', type: 'EQUITY', parent: '3000' },
  { code: '3102', name: 'سود و زیان انباشته', type: 'EQUITY', parent: '3000' },

  // ---------- درآمد ----------
  { code: '4000', name: 'درآمدها', type: 'REVENUE', postable: false },
  { code: '4101', name: 'فروش کالا', type: 'REVENUE', parent: '4000' },
  { code: '4102', name: 'تخفیفات فروش', type: 'REVENUE', parent: '4000' },
  { code: '4103', name: 'درآمد خدمات', type: 'REVENUE', parent: '4000' },
  { code: '4104', name: 'سایر درآمدها', type: 'REVENUE', parent: '4000' },

  // ---------- هزینه ----------
  { code: '5000', name: 'هزینه‌ها', type: 'EXPENSE', postable: false },
  { code: '5101', name: 'بهای تمام‌شدهٔ کالای فروش‌رفته', type: 'EXPENSE', parent: '5000' },
  { code: '5201', name: 'حقوق و دستمزد', type: 'EXPENSE', parent: '5000' },
  { code: '5202', name: 'اجاره', type: 'EXPENSE', parent: '5000' },
  { code: '5203', name: 'آب، برق و گاز', type: 'EXPENSE', parent: '5000' },
  { code: '5204', name: 'حمل و نقل', type: 'EXPENSE', parent: '5000' },
  { code: '5299', name: 'سایر هزینه‌ها', type: 'EXPENSE', parent: '5000' },
];

async function seed(): Promise<void> {
  const pool = new Pool(adminDatabaseConfig());

  try {
    console.log('🌱 شروع seed دیتابیس...');

    // ----- شرکت نمونه -----
    await pool.query(
      `INSERT INTO "Company" (id, name, country, city) VALUES ($1, $2, 'IR', 'تهران')
       ON CONFLICT (id) DO NOTHING`,
      [SEED_COMPANY, 'فروشگاه نمونه مولیدو'],
    );

    // ----- کاربر مدیر -----
    const adminPassword = await bcrypt.hash('admin123', 10);
    await pool.query(
      `INSERT INTO "User"
         (id, "firstName", "lastName", email, password, role, status, "companyId")
       VALUES ('seed-admin', 'مدیر', 'سیستم', $1, $2, 'ADMIN', 'ACTIVE', $3)
       ON CONFLICT (email) DO NOTHING`,
      ['admin@molido.ai', adminPassword, SEED_COMPANY],
    );

    // ----- انبار اصلی -----
    await pool.query(
      `INSERT INTO "Warehouse" (id, name, code, "companyId") VALUES ($1, $2, 'WH-01', $3)
       ON CONFLICT (id) DO NOTHING`,
      [SEED_WAREHOUSE, 'انبار مرکزی', SEED_COMPANY],
    );

    // ----- صندوق اصلی -----
    await pool.query(
      `INSERT INTO "CashBox" (id, name, code, balance, "companyId")
       VALUES ('seed-cashbox', 'صندوق اصلی', 'CB-01', 0, $1)
       ON CONFLICT (id) DO NOTHING`,
      [SEED_COMPANY],
    );

    // ----- دسته‌بندی نمونه -----
    await pool.query(
      `INSERT INTO "Category" (id, name, "companyId") VALUES ($1, $2, $3)
       ON CONFLICT (id) DO NOTHING`,
      [SEED_CATEGORY, 'مواد غذایی', SEED_COMPANY],
    );

    // ----- کالاهای نمونه و موجودی اولیه -----
    for (const product of PRODUCTS) {
      await pool.query(
        `INSERT INTO "Product"
           (id, name, sku, "purchasePrice", "salePrice", unit, "minStock",
            "companyId", "categoryId")
         VALUES ($1, $2, $3, $4, $5, $6, 10, $7, $8)
         ON CONFLICT (id) DO NOTHING`,
        [
          product.id,
          product.name,
          product.sku,
          product.purchasePrice,
          product.salePrice,
          product.unit,
          SEED_COMPANY,
          SEED_CATEGORY,
        ],
      );

      await pool.query(
        `INSERT INTO "Inventory" (id, "warehouseId", "productId", quantity)
         VALUES ($1, $2, $3, 50)
         ON CONFLICT ("warehouseId", "productId") DO NOTHING`,
        [`seed-inv-${product.id}`, SEED_WAREHOUSE, product.id],
      );
    }

    // ----- مشتری نمونه -----
    await pool.query(
      `INSERT INTO "Customer" (id, "firstName", "lastName", phone, "companyId")
       VALUES ('seed-customer', 'علی', 'رضایی', '09120000000', $1)
       ON CONFLICT (id) DO NOTHING`,
      [SEED_COMPANY],
    );

    // ----- تأمین‌کننده نمونه -----
    await pool.query(
      `INSERT INTO "Supplier" (id, name, phone, "companyId")
       VALUES ('seed-supplier', 'پخش مواد غذایی تهران', '02100000000', $1)
       ON CONFLICT (id) DO NOTHING`,
      [SEED_COMPANY],
    );


    // ----- کدینگ حساب‌ها -----
    // حساب پدر باید پیش از فرزند ساخته شود، پس ترتیب فهرست حفظ می‌شود.
    for (const account of CHART_OF_ACCOUNTS) {
      await pool.query(
        `INSERT INTO "Account" (id, "companyId", code, name, type, "isPostable", "parentId")
         VALUES ($1, $2, $3, $4, $5, $6,
                 (SELECT id FROM "Account" WHERE "companyId" = $2 AND code = $7))
         ON CONFLICT ("companyId", code) DO NOTHING`,
        [
          `seed-acc-${account.code}`,
          SEED_COMPANY,
          account.code,
          account.name,
          account.type,
          account.postable !== false,
          account.parent ?? null,
        ],
      );
    }

    // ----- سال مالی جاری -----
    // بدون سال مالی هیچ سندی صادر نمی‌شود، پس یک سال باز پیش‌فرض لازم است.
    const year = new Date().getFullYear();
    await pool.query(
      `INSERT INTO "FiscalYear" (id, "companyId", code, "startsOn", "endsOn")
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT ("companyId", code) DO NOTHING`,
      [
        `seed-fy-${year}`,
        SEED_COMPANY,
        String(year),
        `${year}-01-01`,
        `${year}-12-31`,
      ],
    );

    // ثبت خودکار سند پس از آماده شدن کدینگ و سال مالی روشن می‌شود
    await pool.query('UPDATE "Company" SET "ledgerEnabled" = true WHERE id = $1', [
      SEED_COMPANY,
    ]);

    console.log('✅ Seed کامل شد');
    console.log('👤 کاربر مدیر: admin@molido.ai / admin123');
    console.log('🏢 شرکت: فروشگاه نمونه مولیدو');
  } finally {
    await pool.end();
  }
}

seed().catch((error: unknown) => {
  console.error('❌ خطا در seed:', error);
  process.exit(1);
});

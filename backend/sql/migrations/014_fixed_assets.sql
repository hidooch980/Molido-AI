-- =============================================
-- دارایی ثابت و استهلاک
--
-- جدول `Asset` وجود داشت با `purchasePrice`، `salvageValue` و
-- `usefulLifeYears` — یعنی همهٔ ورودی‌های لازم برای محاسبهٔ استهلاک — ولی
-- هیچ‌گاه استهلاکی محاسبه یا ثبت نمی‌شد.  نتیجه: دارایی‌ها تا ابد به ارزش
-- خرید در دفاتر می‌ماندند و سود هر دوره بیش از واقع گزارش می‌شد.
-- =============================================

-- ---------- ۱) ستون‌های لازم ----------
ALTER TABLE "Asset" ADD COLUMN IF NOT EXISTS "depreciationMethod" TEXT NOT NULL DEFAULT 'STRAIGHT_LINE';
ALTER TABLE "Asset" ADD COLUMN IF NOT EXISTS "accumulatedDepreciation" NUMERIC(18,2) NOT NULL DEFAULT 0;
ALTER TABLE "Asset" ADD COLUMN IF NOT EXISTS "inServiceDate" DATE;
ALTER TABLE "Asset" ADD COLUMN IF NOT EXISTS "disposedAt"   TIMESTAMPTZ;
ALTER TABLE "Asset" ADD COLUMN IF NOT EXISTS "disposalValue" NUMERIC(18,2);

-- تاریخ بهره‌برداری اگر خالی است، همان تاریخ خرید است.
UPDATE "Asset"
   SET "inServiceDate" = "purchaseDate"::date
 WHERE "inServiceDate" IS NULL AND "purchaseDate" IS NOT NULL;

DO $$
BEGIN
  ALTER TABLE "Asset" ADD CONSTRAINT "Asset_method_chk"
    CHECK ("depreciationMethod" IN ('STRAIGHT_LINE','DECLINING_BALANCE','NONE'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "Asset" ADD CONSTRAINT "Asset_status_chk"
    CHECK (status IN ('ACTIVE','FULLY_DEPRECIATED','DISPOSED','SOLD','IDLE'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- استهلاک انباشته هرگز نباید از مبلغ استهلاک‌پذیر بیشتر شود.  ارزش اسقاط
-- کف دفتری است: دارایی به زیر آن مستهلک نمی‌شود.
DO $$
BEGIN
  ALTER TABLE "Asset" ADD CONSTRAINT "Asset_accum_chk"
    CHECK (
      "accumulatedDepreciation" >= 0
      AND "accumulatedDepreciation" <=
          GREATEST(COALESCE("purchasePrice",0) - COALESCE("salvageValue",0), 0)
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "Asset_company_no_key"
  ON "Asset" ("companyId", "assetNo");

-- ---------- ۲) دفتر استهلاک ----------
-- هر دوره یک سطر.  بدون این جدول، «چقدر در مرداد مستهلک شد؟» فقط با
-- بازمحاسبهٔ کل تاریخچه پاسخ می‌گرفت — و اگر نرخی عوض شود، پاسخِ گذشته هم
-- عوض می‌شد.
CREATE TABLE IF NOT EXISTS "AssetDepreciation" (
  id           TEXT PRIMARY KEY,
  "companyId"  TEXT NOT NULL,
  "assetId"    TEXT NOT NULL REFERENCES "Asset"(id) ON DELETE CASCADE,
  -- اولین روز دورهٔ استهلاک (ماه)
  period       DATE NOT NULL,
  amount       NUMERIC(18,2) NOT NULL,
  -- ارزش دفتری پس از این ثبت
  "bookValue"  NUMERIC(18,2) NOT NULL,
  "journalEntryId" TEXT,
  "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "AssetDepreciation_amount_chk" CHECK (amount > 0)
);

-- یک دارایی در یک دوره فقط یک بار مستهلک می‌شود.  اجرای دوبارهٔ عملیات
-- پایان ماه نباید دو برابر هزینه بزند.
CREATE UNIQUE INDEX IF NOT EXISTS "AssetDepreciation_unique"
  ON "AssetDepreciation" ("assetId", period);

CREATE INDEX IF NOT EXISTS "AssetDepreciation_company_period_idx"
  ON "AssetDepreciation" ("companyId", period);

-- ---------- ۳) حساب‌های دارایی ثابت ----------
-- برای هر شرکتی که هنوز ندارد ساخته می‌شوند؛ کدها با سرفصل‌های موجود
-- (۱۱۰۴ موجودی کالا، ۵۲۹۹ سایر هزینه‌ها) هم‌خانواده‌اند.
INSERT INTO "Account" (id, "companyId", name, code, type, "isPostable")
SELECT
  gen_random_uuid()::text, c.id, v.name, v.code, v.type, true
FROM "Company" c
CROSS JOIN (VALUES
  ('اموال و تجهیزات',          '1201', 'ASSET'),
  ('استهلاک انباشته',          '1202', 'ASSET'),
  -- ۵۲۰۱ در سرفصل‌های موجود «حقوق و دستمزد» است؛ استهلاک کد جدا می‌گیرد،
  -- وگرنه هزینهٔ استهلاک روی حساب حقوق می‌نشست.
  ('هزینهٔ استهلاک',           '5205', 'EXPENSE'),
  ('سود (زیان) واگذاری دارایی','4105', 'REVENUE')
) AS v(name, code, type)
WHERE NOT EXISTS (
  SELECT 1 FROM "Account" a WHERE a."companyId" = c.id AND a.code = v.code
);

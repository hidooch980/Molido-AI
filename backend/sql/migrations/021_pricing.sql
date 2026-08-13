-- =============================================
-- سطح قیمت و قواعد تخفیف
--
-- `PriceLevel` وجود داشت ولی فقط نام بود — هیچ قیمتی به آن وصل نمی‌شد.
-- `DiscountRule` هم ستون‌های کامل داشت ولی هیچ‌جا اعمال نمی‌شد.
-- =============================================

-- ---------- ۱) قیمت هر کالا در هر سطح ----------
-- جدول در نصب‌های قدیمی وجود دارد ولی ناقص است: نه `companyId` دارد (پس
-- RLS نمی‌گیرد) و نه `minQty` (پس قیمت پلکانی ممکن نیست).
CREATE TABLE IF NOT EXISTS "ProductPrice" (
  id            TEXT PRIMARY KEY,
  "productId"   TEXT NOT NULL,
  "priceLevelId" TEXT NOT NULL,
  price         NUMERIC(18,2) NOT NULL,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE "ProductPrice" ADD COLUMN IF NOT EXISTS "companyId" TEXT;
ALTER TABLE "ProductPrice" ADD COLUMN IF NOT EXISTS "minQty" NUMERIC(18,3) NOT NULL DEFAULT 0;
ALTER TABLE "ProductPrice" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now();

-- سطرهای موجود شرکتشان را از کالای مربوطه می‌گیرند؛ بدون آن، RLS همه را
-- نامرئی می‌کرد و قیمت‌های ثبت‌شده بی‌سروصدا ناپدید می‌شدند.
UPDATE "ProductPrice" pp
   SET "companyId" = p."companyId"
  FROM "Product" p
 WHERE pp."productId" = p.id AND pp."companyId" IS NULL;

-- سطر یتیم (کالای حذف‌شده) شرکتی ندارد و باید برود.
DELETE FROM "ProductPrice" WHERE "companyId" IS NULL;

ALTER TABLE "ProductPrice" ALTER COLUMN "companyId" SET NOT NULL;

DO $$
BEGIN
  ALTER TABLE "ProductPrice" ADD CONSTRAINT "ProductPrice_price_chk"
    CHECK (price >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "ProductPrice" ADD CONSTRAINT "ProductPrice_minqty_chk"
    CHECK ("minQty" >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- نمایهٔ قدیمی `(priceLevelId, productId)` هر کالا را به **یک** قیمت در هر
-- سطح محدود می‌کند — یعنی قیمت پلکانی ممکن نیست و پلکان دوم بی‌سروصدا
-- جای اولی را می‌گیرد.  باید برود.
ALTER TABLE "ProductPrice"
  DROP CONSTRAINT IF EXISTS "ProductPrice_priceLevelId_productId_key";
DROP INDEX IF EXISTS "ProductPrice_priceLevelId_productId_key";

-- یک قیمت برای هر (کالا، سطح، حداقل تعداد).  بدون این، دو قیمت متفاوت
-- برای یک شرایط ثبت می‌شد و انتخاب بینشان تصادفی می‌ماند.
CREATE UNIQUE INDEX IF NOT EXISTS "ProductPrice_unique"
  ON "ProductPrice" ("productId", "priceLevelId", "minQty");

CREATE INDEX IF NOT EXISTS "ProductPrice_lookup_idx"
  ON "ProductPrice" ("productId", "priceLevelId", "minQty" DESC);

-- فقط یک سطح پیش‌فرض در هر شرکت.  دو پیش‌فرض یعنی قیمتِ فروش تصادفی.
CREATE UNIQUE INDEX IF NOT EXISTS "PriceLevel_one_default"
  ON "PriceLevel" ("companyId") WHERE "isDefault" = true;

-- مشتری می‌تواند سطح قیمت اختصاصی داشته باشد (عمده‌فروش، همکار).
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "priceLevelId" TEXT;
CREATE INDEX IF NOT EXISTS "Customer_pricelevel_idx"
  ON "Customer" ("priceLevelId");

-- ---------- ۲) تخفیف ----------
ALTER TABLE "DiscountRule" ADD COLUMN IF NOT EXISTS "productId" TEXT;
ALTER TABLE "DiscountRule" ADD COLUMN IF NOT EXISTS "categoryId" TEXT;
-- اولویت: وقتی چند قاعده هم‌زمان صدق می‌کنند، بزرگ‌ترین اولویت برنده است.
-- بدون آن، انتخاب به ترتیب درج بستگی داشت که هیچ معنایی ندارد.
ALTER TABLE "DiscountRule" ADD COLUMN IF NOT EXISTS priority INTEGER NOT NULL DEFAULT 0;

DO $$
BEGIN
  ALTER TABLE "DiscountRule" ADD CONSTRAINT "DiscountRule_kind_chk"
    CHECK (kind IN ('PERCENT','AMOUNT','BUY_X_GET_Y'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- درصد نمی‌تواند از ۱۰۰ بیشتر باشد؛ بدون این قید یک صفر اضافه، کالا را
-- رایگان و مبلغ فاکتور را منفی می‌کرد.
DO $$
BEGIN
  ALTER TABLE "DiscountRule" ADD CONSTRAINT "DiscountRule_value_chk"
    CHECK (
      value >= 0 AND (kind <> 'PERCENT' OR value <= 100)
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- بازهٔ زمانی معتبر
DO $$
BEGIN
  ALTER TABLE "DiscountRule" ADD CONSTRAINT "DiscountRule_range_chk"
    CHECK ("endsAt" IS NULL OR "startsAt" IS NULL OR "endsAt" >= "startsAt");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- سقف استفاده هرگز نباید رد شود
DO $$
BEGIN
  ALTER TABLE "DiscountRule" ADD CONSTRAINT "DiscountRule_uses_chk"
    CHECK ("maxUses" IS NULL OR "usedCount" <= "maxUses");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "DiscountRule_active_idx"
  ON "DiscountRule" ("companyId", priority DESC) WHERE "isActive" = true;

CREATE UNIQUE INDEX IF NOT EXISTS "DiscountRule_code_key"
  ON "DiscountRule" ("companyId", code) WHERE code IS NOT NULL AND code <> '';

-- ---------- ۳) سطح پیش‌فرض برای شرکت‌های موجود ----------
INSERT INTO "PriceLevel" (id, "companyId", name, "isDefault")
SELECT gen_random_uuid()::text, c.id, 'قیمت خرده‌فروشی', true
FROM "Company" c
WHERE NOT EXISTS (
  SELECT 1 FROM "PriceLevel" p WHERE p."companyId" = c.id AND p."isDefault" = true
);

-- ---------- ۴) RLS ----------
DO $$
DECLARE
  target RECORD;
BEGIN
  FOR target IN
    SELECT c.relname AS table_name
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN information_schema.columns col
        ON col.table_name = c.relname
       AND col.table_schema = n.nspname
       AND col.column_name = 'companyId'
     WHERE n.nspname = 'public'
       AND c.relkind = 'r'
       AND NOT EXISTS (
         SELECT 1 FROM pg_policies p
          WHERE p.tablename = c.relname AND p.policyname = 'company_isolation'
       )
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', target.table_name);
    EXECUTE format($f$
      CREATE POLICY company_isolation ON %I
        FOR ALL TO molido_app
        USING ("companyId" = NULLIF(current_setting('app.company_id', true), ''))
        WITH CHECK ("companyId" = NULLIF(current_setting('app.company_id', true), ''))
    $f$, target.table_name);
    RAISE NOTICE 'RLS policy added: %', target.table_name;
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO molido_app;

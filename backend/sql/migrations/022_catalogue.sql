-- =============================================
-- دسته‌بندی درختی، انبار، و شمارهٔ سریال
-- =============================================

-- ---------- ۱) دسته‌بندی ----------

-- والد باید در همان جدول باشد.  بدون FK، حذف یک دسته زیرشاخه‌هایش را به
-- والدی اشاره می‌داد که دیگر وجود ندارد و آن‌ها از درخت غیب می‌شدند.
--
-- SET NULL و نه CASCADE: حذف «نوشیدنی» نباید «نوشابه» و کالاهایش را هم
-- ببرد؛ زیرشاخه باید به ریشه برگردد تا دیده شود و دستی جابه‌جا شود.
DO $$
BEGIN
  ALTER TABLE "Category" ADD CONSTRAINT "Category_parent_fkey"
    FOREIGN KEY ("parentId") REFERENCES "Category"(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- دسته نمی‌تواند والد خودش باشد.  حلقهٔ بلندتر را دیتابیس نمی‌تواند بگیرد
-- (سرویس می‌گیرد)، ولی این حالتِ یک‌مرحله‌ای شایع‌ترین است.
DO $$
BEGIN
  ALTER TABLE "Category" ADD CONSTRAINT "Category_self_parent_chk"
    CHECK ("parentId" IS DISTINCT FROM id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- سطرهای موجود که همین حالا حلقه دارند، قید بالا را رد می‌کنند؛ پیش از
-- افزودن قید پاکشان می‌کنیم.
UPDATE "Category" SET "parentId" = NULL WHERE "parentId" = id;

CREATE INDEX IF NOT EXISTS "Category_parent_idx"
  ON "Category" ("companyId", "parentId");

-- نام دسته در هر شرکت و زیر هر والد یکتا باشد.  دو «نوشابه» زیر یک والد
-- یعنی کاربر نمی‌فهمد کالا را در کدام ثبت کرده.
--
-- دو نمایه لازم است چون NULL در نمایهٔ یکتا با هیچ‌چیز برابر نیست — بدون
-- نمایهٔ دوم، دسته‌های ریشه بی‌محدودیت تکرار می‌شدند.
CREATE UNIQUE INDEX IF NOT EXISTS "Category_name_under_parent"
  ON "Category" ("companyId", "parentId", lower(name))
  WHERE "parentId" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "Category_name_at_root"
  ON "Category" ("companyId", lower(name))
  WHERE "parentId" IS NULL;

-- ---------- ۲) انبار ----------

-- کد انبار در هر شرکت یکتا.  کد تکراری یعنی انتخاب انبار در فاکتور مبهم
-- می‌شود.  خالی مستثناست چون کد اختیاری است.
CREATE UNIQUE INDEX IF NOT EXISTS "Warehouse_code_key"
  ON "Warehouse" ("companyId", lower(code))
  WHERE code IS NOT NULL AND code <> '';

-- ---------- ۳) شمارهٔ سریال ----------

ALTER TABLE "SerialNumber" ADD COLUMN IF NOT EXISTS "warrantyUntil" DATE;
ALTER TABLE "SerialNumber" ADD COLUMN IF NOT EXISTS note TEXT;
ALTER TABLE "SerialNumber"
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now();

-- یکتایی سریال **سراسری** بود، نه به‌ازای هر شرکت.  یعنی اگر شرکت دیگری
-- روی همین نصب سریالی به همان شماره داشت، ثبت بی‌هیچ دلیل قابل‌فهمی رد
-- می‌شد — و شمارهٔ سریال سازنده بین فروشگاه‌ها کاملاً می‌تواند تکرار شود.
ALTER TABLE "SerialNumber" DROP CONSTRAINT IF EXISTS "SerialNumber_serial_key";
DROP INDEX IF EXISTS "SerialNumber_serial_key";

-- تکراری‌های به‌جامانده باید بروند وگرنه نمایهٔ تازه ساخته نمی‌شود.
-- قدیمی‌ترین می‌ماند: همان است که تاریخچهٔ فروش به آن وصل شده.
DELETE FROM "SerialNumber" s
 WHERE EXISTS (
   SELECT 1 FROM "SerialNumber" o
    WHERE o."companyId" = s."companyId"
      AND o.serial = s.serial
      AND (o."createdAt", o.id) < (s."createdAt", s.id)
 );

CREATE UNIQUE INDEX IF NOT EXISTS "SerialNumber_company_serial_key"
  ON "SerialNumber" ("companyId", serial);

-- وضعیت‌های مجاز.  بدون قید، یک غلط املایی در کلاینت سریالی می‌ساخت که
-- در هیچ فیلتری پیدا نمی‌شد و عملاً گم می‌شد.
UPDATE "SerialNumber"
   SET status = 'IN_STOCK'
 WHERE status NOT IN ('IN_STOCK', 'SOLD', 'RETURNED', 'DEFECTIVE');

DO $$
BEGIN
  ALTER TABLE "SerialNumber" ADD CONSTRAINT "SerialNumber_status_chk"
    CHECK (status IN ('IN_STOCK', 'SOLD', 'RETURNED', 'DEFECTIVE'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- سریالِ فروخته‌شده باید بگوید در کدام فاکتور رفته؛ وگرنه پیگیری گارانتی
-- ممکن نیست و دقیقاً همان‌جاست که شمارهٔ سریال به کار می‌آید.
DO $$
BEGIN
  ALTER TABLE "SerialNumber" ADD CONSTRAINT "SerialNumber_sold_has_sale_chk"
    CHECK (status <> 'SOLD' OR "saleId" IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

UPDATE "SerialNumber" SET status = 'IN_STOCK'
 WHERE status = 'SOLD' AND "saleId" IS NULL;

CREATE INDEX IF NOT EXISTS "SerialNumber_status_idx"
  ON "SerialNumber" ("companyId", status);

CREATE INDEX IF NOT EXISTS "SerialNumber_sale_idx"
  ON "SerialNumber" ("saleId") WHERE "saleId" IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO molido_app;

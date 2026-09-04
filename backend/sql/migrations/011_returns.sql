-- =============================================
-- برگشت از فروش و برگشت از خرید
--
-- "ProductReturn" وجود داشت ولی فقط یک CRUD بود: نه موجودی برمی‌گشت، نه پول،
-- نه سندی زده می‌شد، و هیچ کنترلی نبود که کسی بیشتر از آنچه خریده مرجوع کند.
-- =============================================

-- ---------- ۱) شمارهٔ مرجوعی در سطح شرکت ----------
ALTER TABLE "ProductReturn" DROP CONSTRAINT IF EXISTS "ProductReturn_returnNo_key";
CREATE UNIQUE INDEX IF NOT EXISTS "ProductReturn_company_no_key"
  ON "ProductReturn" ("companyId", "returnNo");

-- ---------- ۲) ستون‌های لازم ----------
-- یک جدول برای هر دو جهت: برگشت از فروش (کالا برمی‌گردد، پول می‌رود) و
-- برگشت از خرید (کالا می‌رود، طلب از تأمین‌کننده).  جدا کردنشان یعنی دو
-- مسیر تقریباً یکسان که باید هر دو نگه‌داری شوند.
ALTER TABLE "ProductReturn" ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'SALE';
ALTER TABLE "ProductReturn" ADD COLUMN IF NOT EXISTS "purchaseId"   TEXT;
ALTER TABLE "ProductReturn" ADD COLUMN IF NOT EXISTS "supplierId"   TEXT;
ALTER TABLE "ProductReturn" ADD COLUMN IF NOT EXISTS "warehouseId"  TEXT;
ALTER TABLE "ProductReturn" ADD COLUMN IF NOT EXISTS "refundMethod" TEXT;
ALTER TABLE "ProductReturn" ADD COLUMN IF NOT EXISTS "refundAmount" NUMERIC(18,2) NOT NULL DEFAULT 0;
ALTER TABLE "ProductReturn" ADD COLUMN IF NOT EXISTS "cashBoxId"    TEXT;
ALTER TABLE "ProductReturn" ADD COLUMN IF NOT EXISTS "userId"       TEXT;
ALTER TABLE "ProductReturn" ADD COLUMN IF NOT EXISTS "appliedAt"    TIMESTAMPTZ;

ALTER TABLE "ProductReturnItem" ADD COLUMN IF NOT EXISTS total NUMERIC(18,2) NOT NULL DEFAULT 0;
-- به کدام سطر فاکتور برمی‌گردد؛ بدون این نمی‌شود سقف مرجوعی را کنترل کرد.
ALTER TABLE "ProductReturnItem" ADD COLUMN IF NOT EXISTS "sourceItemId" TEXT;

-- ---------- ۳) سقف مرجوعی ----------
-- بدون این ستون، مشتری می‌تواند ۳ عدد بخرد و ۱۰ عدد مرجوع کند — و سیستم
-- ۷ عدد کالای نداشته را به انبار اضافه می‌کند و پولش را هم می‌دهد.
ALTER TABLE "SaleItem"     ADD COLUMN IF NOT EXISTS "returnedQty" NUMERIC(18,2) NOT NULL DEFAULT 0;
ALTER TABLE "PurchaseItem" ADD COLUMN IF NOT EXISTS "returnedQty" NUMERIC(18,2) NOT NULL DEFAULT 0;

DO $$
BEGIN
  ALTER TABLE "SaleItem" ADD CONSTRAINT "SaleItem_returned_chk"
    CHECK ("returnedQty" >= 0 AND "returnedQty" <= quantity);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "PurchaseItem" ADD CONSTRAINT "PurchaseItem_returned_chk"
    CHECK ("returnedQty" >= 0 AND "returnedQty" <= quantity);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------- ۴) وضعیت و نوع ----------
DO $$
BEGIN
  ALTER TABLE "ProductReturn" ADD CONSTRAINT "ProductReturn_type_chk"
    CHECK (type IN ('SALE','PURCHASE'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "ProductReturn" ADD CONSTRAINT "ProductReturn_status_chk"
    CHECK (status IN ('PENDING','APPLIED','CANCELLED'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "ProductReturn" ADD CONSTRAINT "ProductReturn_refund_chk"
    CHECK ("refundMethod" IS NULL OR "refundMethod" IN ('CASH','CREDIT','CARD','NONE'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- برگشت از فروش باید فاکتور مبدأ داشته باشد و برگشت از خرید، سند خرید.
-- مرجوعیِ بی‌مبدأ یعنی راهی برای وارد کردن کالا به انبار بدون هیچ ردی.
DO $$
BEGIN
  ALTER TABLE "ProductReturn" ADD CONSTRAINT "ProductReturn_source_chk"
    CHECK (
      (type = 'SALE'     AND "saleId"     IS NOT NULL) OR
      (type = 'PURCHASE' AND "purchaseId" IS NOT NULL)
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "ProductReturn_company_status_idx"
  ON "ProductReturn" ("companyId", status);
CREATE INDEX IF NOT EXISTS "ProductReturn_sale_idx"     ON "ProductReturn" ("saleId");
CREATE INDEX IF NOT EXISTS "ProductReturn_purchase_idx" ON "ProductReturn" ("purchaseId");

-- =============================================
-- سری ساخت و تاریخ انقضا روی فاکتور خرید
--
-- تا حالا `expiryDate` فقط روی خودِ کالا بود — یعنی یک تاریخ برای همهٔ
-- موجودی.  در عمل هر محموله تاریخ انقضای خودش را دارد: ۵۰ عدد شیر که امروز
-- رسیده با ۳۰ عددی که ماه پیش رسیده یکی نیستند.  با یک تاریخ مشترک، یا
-- هشدار زودتر از موعد می‌آید یا اصلاً نمی‌آید.
-- =============================================

ALTER TABLE "PurchaseItem" ADD COLUMN IF NOT EXISTS "batchNo"     TEXT;
ALTER TABLE "PurchaseItem" ADD COLUMN IF NOT EXISTS "expiryDate"  DATE;
ALTER TABLE "PurchaseItem" ADD COLUMN IF NOT EXISTS "manufactureDate" DATE;

-- محموله نمی‌تواند پیش از تولیدش منقضی شود.
DO $$
BEGIN
  ALTER TABLE "PurchaseItem" ADD CONSTRAINT "PurchaseItem_dates_chk"
    CHECK (
      "expiryDate" IS NULL OR "manufactureDate" IS NULL
      OR "expiryDate" >= "manufactureDate"
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------- BatchNumber: انبار محموله‌ای ----------
-- جدول از قبل بود ولی هیچ‌جا نوشته نمی‌شد.  این ستون‌ها آن را به انبار و
-- سند مبدأ وصل می‌کنند تا بشود فهمید هر محموله در کدام انبار است و از کجا
-- آمده.
ALTER TABLE "BatchNumber" ADD COLUMN IF NOT EXISTS "warehouseId" TEXT;
ALTER TABLE "BatchNumber" ADD COLUMN IF NOT EXISTS "purchaseId"  TEXT;
ALTER TABLE "BatchNumber" ADD COLUMN IF NOT EXISTS "remainingQty" NUMERIC(18,2);
ALTER TABLE "BatchNumber" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now();

-- مقدار باقی‌مانده برای رکوردهای قدیمی برابر مقدار اولیه است.
UPDATE "BatchNumber" SET "remainingQty" = qty WHERE "remainingQty" IS NULL;

DO $$
BEGIN
  ALTER TABLE "BatchNumber" ADD CONSTRAINT "BatchNumber_remaining_chk"
    CHECK ("remainingQty" IS NULL OR ("remainingQty" >= 0 AND "remainingQty" <= qty));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- یک شمارهٔ سری در یک انبار برای یک کالا، یک رکورد است — نه چند رکورد که
-- موجودی را بین خودشان گم کنند.
CREATE UNIQUE INDEX IF NOT EXISTS "BatchNumber_unique"
  ON "BatchNumber" ("companyId", "productId", "warehouseId", "batchNo");

-- پرس‌وجوی همیشگی: «چه چیزی تا N روز دیگر منقضی می‌شود؟»
CREATE INDEX IF NOT EXISTS "BatchNumber_expiry_idx"
  ON "BatchNumber" ("companyId", "expiryDate")
  WHERE "expiryDate" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "PurchaseItem_expiry_idx"
  ON "PurchaseItem" ("expiryDate") WHERE "expiryDate" IS NOT NULL;

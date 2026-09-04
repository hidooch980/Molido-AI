-- =============================================
-- زنجیرهٔ فروش: پیش‌فاکتور ← سفارش فروش ← ارسال ← فاکتور
--
-- جدول‌های Quotation / SalesOrder / Shipment از قبل ساخته شده بودند ولی هیچ
-- منطقی پشتشان نبود.  این migration سه ایراد ساختاری آنها را می‌بندد و
-- حلقه‌های اتصال زنجیره را اضافه می‌کند.
-- =============================================

-- ---------- ۱) شماره‌ها باید در سطح شرکت یکتا باشند، نه سراسری ----------
-- UNIQUE سراسری یعنی اگر شرکت الف «Q-001» را بگیرد، شرکت ب دیگر نمی‌تواند
-- همان شماره را داشته باشد — همان باگی که در "Account".code هم بود.  هر
-- شرکت باید شماره‌گذاری مستقل خودش را داشته باشد.

ALTER TABLE "Quotation"  DROP CONSTRAINT IF EXISTS "Quotation_quoteNo_key";
ALTER TABLE "SalesOrder" DROP CONSTRAINT IF EXISTS "SalesOrder_orderNo_key";
ALTER TABLE "Shipment"   DROP CONSTRAINT IF EXISTS "Shipment_trackingNo_key";

CREATE UNIQUE INDEX IF NOT EXISTS "Quotation_company_no_key"
  ON "Quotation" ("companyId", "quoteNo");
CREATE UNIQUE INDEX IF NOT EXISTS "SalesOrder_company_no_key"
  ON "SalesOrder" ("companyId", "orderNo");
CREATE UNIQUE INDEX IF NOT EXISTS "Shipment_company_no_key"
  ON "Shipment" ("companyId", "trackingNo");

-- ---------- ۲) حلقه‌های اتصال زنجیره ----------
-- بدون اینها هر مرحله یک جزیرهٔ مستقل است و نمی‌شود فهمید یک فاکتور از کدام
-- سفارش و کدام پیش‌فاکتور آمده.

ALTER TABLE "SalesOrder" ADD COLUMN IF NOT EXISTS "quotationId" TEXT;
ALTER TABLE "SalesOrder" ADD COLUMN IF NOT EXISTS "saleId"      TEXT;
ALTER TABLE "SalesOrder" ADD COLUMN IF NOT EXISTS "warehouseId" TEXT;
ALTER TABLE "SalesOrder" ADD COLUMN IF NOT EXISTS discount NUMERIC(18,2) NOT NULL DEFAULT 0;
ALTER TABLE "SalesOrder" ADD COLUMN IF NOT EXISTS tax      NUMERIC(18,2) NOT NULL DEFAULT 0;

ALTER TABLE "Quotation" ADD COLUMN IF NOT EXISTS "salesOrderId" TEXT;

ALTER TABLE "Shipment" ADD COLUMN IF NOT EXISTS "salesOrderId" TEXT;

-- کالای سفارش‌شده در برابر کالای ارسال‌شده — بدون این ستون، ارسال جزئی
-- (بخشی امروز، بقیه فردا) قابل ردیابی نیست.
ALTER TABLE "SalesOrderItem" ADD COLUMN IF NOT EXISTS "shippedQty" NUMERIC(18,2) NOT NULL DEFAULT 0;

-- ---------- ۳) کلیدهای خارجی ----------
-- قلم بدون سربرگ نباید بتواند وجود داشته باشد؛ حذف سربرگ باید اقلامش را
-- ببرد.  تا حالا هیچ‌کدام از این جدول‌ها FK نداشتند.

DO $$
BEGIN
  ALTER TABLE "QuotationItem" ADD CONSTRAINT "QuotationItem_quotation_fk"
    FOREIGN KEY ("quotationId") REFERENCES "Quotation"(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "SalesOrderItem" ADD CONSTRAINT "SalesOrderItem_order_fk"
    FOREIGN KEY ("orderId") REFERENCES "SalesOrder"(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "ShipmentItem" ADD CONSTRAINT "ShipmentItem_shipment_fk"
    FOREIGN KEY ("shipmentId") REFERENCES "Shipment"(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------- ۴) وضعیت‌های مجاز ----------
-- وضعیت آزادِ متنی یعنی یک غلط تایپی در کلاینت، رکورد را برای همیشه از
-- گردش کار بیرون می‌اندازد بی‌آنکه خطایی دیده شود.

DO $$
BEGIN
  ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_status_chk"
    CHECK (status IN ('DRAFT','SENT','ACCEPTED','REJECTED','EXPIRED','CONVERTED'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_status_chk"
    CHECK (status IN ('PENDING','CONFIRMED','PARTIALLY_SHIPPED','SHIPPED','INVOICED','CANCELLED'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_status_chk"
    CHECK (status IN ('PENDING','IN_TRANSIT','DELIVERED','RETURNED','CANCELLED'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ارسال‌شده هرگز نباید از سفارش‌شده بیشتر شود.  این قید در سطح دیتابیس
-- است چون همان دلیلی که برای موجودی انبار داشتیم اینجا هم برقرار است:
-- کنترل فقط در کد، با یک مسیر فراموش‌شده دور زده می‌شود.
DO $$
BEGIN
  ALTER TABLE "SalesOrderItem" ADD CONSTRAINT "SalesOrderItem_shipped_chk"
    CHECK ("shippedQty" >= 0 AND "shippedQty" <= qty);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------- ۵) نمایه‌های جستجو ----------
CREATE INDEX IF NOT EXISTS "Quotation_company_status_idx"  ON "Quotation" ("companyId", status);
CREATE INDEX IF NOT EXISTS "SalesOrder_company_status_idx" ON "SalesOrder" ("companyId", status);
CREATE INDEX IF NOT EXISTS "Shipment_company_status_idx"   ON "Shipment" ("companyId", status);
CREATE INDEX IF NOT EXISTS "QuotationItem_quotation_idx"   ON "QuotationItem" ("quotationId");
CREATE INDEX IF NOT EXISTS "SalesOrderItem_order_idx"      ON "SalesOrderItem" ("orderId");
CREATE INDEX IF NOT EXISTS "ShipmentItem_shipment_idx"     ON "ShipmentItem" ("shipmentId");

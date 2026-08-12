-- خرده‌فروشی و صندوق فروشگاهی
--
-- سه چیز را اضافه می‌کند که یک سوپرمارکت بدون آن‌ها قابل بهره‌برداری نیست:
--   ۱. کالای وزنی و بارکد ترازو
--   ۲. شیفت صندوق‌دار با مغایرت‌گیری نقدی
--   ۳. تفکیک نقد/کارت روی هر فاکتور

-- ---------- ۱. کالای وزنی ----------

-- کالایی که با ترازو فروخته می‌شود: مقدار از بارکد خوانده می‌شود، نه شمارش.
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "isWeighed" BOOLEAN NOT NULL DEFAULT false;

-- کد کوتاهی که ترازو روی برچسب چاپ می‌کند (۵ رقم داخل بارکد EAN-13).
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "scaleCode" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Product_companyId_scaleCode_key"
  ON "Product" ("companyId", "scaleCode") WHERE "scaleCode" IS NOT NULL;

-- ---------- ۲. پیکربندی بارکد ترازو (در سطح شرکت) ----------

-- بارکد ترازو استاندارد واحد ندارد؛ هر فروشگاه پیشوند و حالت خودش را دارد.
-- پیشوند معمول در ایران ۲ است. حالت WEIGHT یعنی ۵ رقم آخر وزن به گرم است،
-- حالت PRICE یعنی مبلغ.
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "scaleBarcodePrefix" TEXT NOT NULL DEFAULT '2';

ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "scaleBarcodeMode" TEXT NOT NULL DEFAULT 'WEIGHT';

ALTER TABLE "Company" DROP CONSTRAINT IF EXISTS "Company_scaleBarcodeMode_check";
ALTER TABLE "Company" ADD CONSTRAINT "Company_scaleBarcodeMode_check"
  CHECK ("scaleBarcodeMode" IN ('WEIGHT', 'PRICE'));

-- ---------- ۳. شیفت صندوق‌دار ----------

CREATE TABLE IF NOT EXISTS "CashierShift" (
  id TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "cashBoxId" TEXT NOT NULL,
  "warehouseId" TEXT,
  "startedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "endedAt" TIMESTAMPTZ,
  "openingCash" NUMERIC(18,2) NOT NULL DEFAULT 0,
  -- شمارش دستی صندوق در پایان شیفت
  "countedCash" NUMERIC(18,2),
  -- آنچه سیستم انتظار دارد: افتتاحیه + فروش نقدی شیفت
  "expectedCash" NUMERIC(18,2),
  -- countedCash - expectedCash؛ منفی یعنی کسری صندوق
  "difference" NUMERIC(18,2),
  "salesCount" INTEGER NOT NULL DEFAULT 0,
  "salesTotal" NUMERIC(18,2) NOT NULL DEFAULT 0,
  "cashTotal" NUMERIC(18,2) NOT NULL DEFAULT 0,
  "cardTotal" NUMERIC(18,2) NOT NULL DEFAULT 0,
  note TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE "CashierShift" ADD CONSTRAINT "CashierShift_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"(id) ON DELETE CASCADE;

ALTER TABLE "CashierShift" ADD CONSTRAINT "CashierShift_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"(id) ON DELETE CASCADE;

ALTER TABLE "CashierShift" ADD CONSTRAINT "CashierShift_cashBoxId_fkey"
  FOREIGN KEY ("cashBoxId") REFERENCES "CashBox"(id) ON DELETE CASCADE;

ALTER TABLE "CashierShift" ADD CONSTRAINT "CashierShift_warehouseId_fkey"
  FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"(id) ON DELETE SET NULL;

-- یک صندوق‌دار در هر لحظه بیش از یک شیفت باز ندارد.  قید جزئی روی endedAt
-- این را در سطح دیتابیس تضمین می‌کند، نه فقط در کد.
CREATE UNIQUE INDEX IF NOT EXISTS "CashierShift_one_open_per_user"
  ON "CashierShift" ("userId") WHERE "endedAt" IS NULL;

-- همچنین یک صندوق در هر لحظه فقط یک شیفت باز دارد.
CREATE UNIQUE INDEX IF NOT EXISTS "CashierShift_one_open_per_cashbox"
  ON "CashierShift" ("cashBoxId") WHERE "endedAt" IS NULL;

CREATE INDEX IF NOT EXISTS "CashierShift_companyId_startedAt_idx"
  ON "CashierShift" ("companyId", "startedAt" DESC);

-- ---------- ۴. اتصال فاکتور به شیفت ----------

ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "shiftId" TEXT;

ALTER TABLE "Sale" DROP CONSTRAINT IF EXISTS "Sale_shiftId_fkey";
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_shiftId_fkey"
  FOREIGN KEY ("shiftId") REFERENCES "CashierShift"(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "Sale_shiftId_idx" ON "Sale" ("shiftId");

-- بارکد باید در جستجوی صندوق سریع باشد؛ اسکن نباید منتظر پیمایش جدول بماند.
CREATE INDEX IF NOT EXISTS "Product_companyId_barcode_idx"
  ON "Product" ("companyId", barcode) WHERE barcode IS NOT NULL;

-- =============================================
-- کاردکس (حرکت موجودی) و انبارگردانی
--
-- تا حالا "Inventory" فقط «مقدار فعلی» را نگه می‌داشت.  سیستم می‌توانست
-- بگوید ۴۷ عدد هست، ولی هرگز نمی‌توانست بگوید *چرا* ۴۷ — نه فروش، نه خرید،
-- نه اصلاح دستی هیچ ردی نمی‌گذاشتند.  در انبار واقعی این یعنی هیچ کسری
-- قابل پیگیری نیست و هیچ‌کس پاسخگو نمی‌شود.
-- =============================================

CREATE TABLE IF NOT EXISTS "StockMovement" (
  id           TEXT PRIMARY KEY,
  "companyId"  TEXT NOT NULL,
  "warehouseId" TEXT NOT NULL,
  "productId"  TEXT NOT NULL,

  -- دلتا: مثبت = ورود، منفی = خروج.  هرگز صفر نیست.
  delta        NUMERIC(18,2) NOT NULL,
  -- موجودی پس از این حرکت؛ ذخیره می‌شود تا کاردکس بدون جمع‌زدن دوبارهٔ کل
  -- تاریخچه خوانده شود و گزارش «مانده در تاریخ X» ارزان باشد.
  balance      NUMERIC(18,2) NOT NULL,

  reason       TEXT NOT NULL,
  -- سند مبدأ: فاکتور، خرید، انتقال، انبارگردانی…
  "refType"    TEXT,
  "refId"      TEXT,
  "userId"     TEXT,
  note         TEXT,
  "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "StockMovement_delta_chk"  CHECK (delta <> 0),
  CONSTRAINT "StockMovement_reason_chk" CHECK (reason IN (
    'SALE','SALE_CANCEL','PURCHASE','PURCHASE_CANCEL',
    'ADJUST','TRANSFER_IN','TRANSFER_OUT','COUNT','RETURN','OTHER'
  ))
);

-- کاردکس همیشه «یک کالا در یک انبار، به ترتیب زمان» خوانده می‌شود.
CREATE INDEX IF NOT EXISTS "StockMovement_kardex_idx"
  ON "StockMovement" ("companyId", "productId", "warehouseId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "StockMovement_ref_idx"
  ON "StockMovement" ("refType", "refId");

-- ---------- انبارگردانی ----------
-- شمارش فیزیکی: سربرگ باز می‌شود، مقدار شمرده‌شده وارد می‌شود، و با «اعمال»
-- اختلافِ هر قلم به‌صورت یک حرکت COUNT ثبت می‌شود.

CREATE TABLE IF NOT EXISTS "StockCount" (
  id           TEXT PRIMARY KEY,
  "companyId"  TEXT NOT NULL,
  "warehouseId" TEXT NOT NULL,
  "countNo"    TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'OPEN',
  note         TEXT,
  "userId"     TEXT,
  "appliedAt"  TIMESTAMPTZ,
  "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"  TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "StockCount_status_chk"
    CHECK (status IN ('OPEN','APPLIED','CANCELLED'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "StockCount_company_no_key"
  ON "StockCount" ("companyId", "countNo");

-- فقط یک انبارگردانیِ باز برای هر انبار.  دو شمارش هم‌زمان روی یک انبار
-- یعنی دو نفر اختلاف‌های متناقض ثبت می‌کنند و آخری بی‌سروصدا برنده می‌شود.
CREATE UNIQUE INDEX IF NOT EXISTS "StockCount_one_open_per_warehouse"
  ON "StockCount" ("warehouseId") WHERE status = 'OPEN';

CREATE TABLE IF NOT EXISTS "StockCountLine" (
  id          TEXT PRIMARY KEY,
  "countId"   TEXT NOT NULL REFERENCES "StockCount"(id) ON DELETE CASCADE,
  "productId" TEXT NOT NULL,
  -- مقدار سیستمی در لحظهٔ باز شدن شمارش؛ ثابت می‌ماند تا اختلاف واقعی
  -- محاسبه‌شدنی باشد حتی اگر بین شمارش و اعمال، فروشی اتفاق بیفتد.
  "systemQty" NUMERIC(18,2) NOT NULL DEFAULT 0,
  "countedQty" NUMERIC(18,2),
  note        TEXT,

  CONSTRAINT "StockCountLine_counted_chk"
    CHECK ("countedQty" IS NULL OR "countedQty" >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS "StockCountLine_unique"
  ON "StockCountLine" ("countId", "productId");

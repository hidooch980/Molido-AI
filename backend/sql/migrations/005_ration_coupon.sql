-- کالابرگ الکترونیکی
--
-- خریدار با کد ملی سرپرست خانوار شناسایی می‌شود و بخشی از سبد را از محل
-- اعتبار یارانه‌ای پرداخت می‌کند.  دو قاعده که کالابرگ را از یک روش پرداخت
-- معمولی جدا می‌کند و هر دو در سطح دیتابیس اعمال شده‌اند:
--
--   ۱. فقط کالای مشمول با کالابرگ قابل خرید است.
--   ۲. کالای مشمول با «قیمت مصوب» حساب می‌شود، نه قیمت فروش عادی.
--
-- اعتبار در جدول محلی نگهداری می‌شود.  اتصال به سامانهٔ ملی از طریق
-- RationGateway انجام می‌گیرد و این جدول دفتر محلی و مبنای تسویه است؛
-- بنابراین سامانه در حالت آفلاین یا بدون اتصال هم قابل بهره‌برداری است.

-- ---------- ۱. کالای مشمول ----------

ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS
  "isRationEligible" BOOLEAN NOT NULL DEFAULT false;

-- قیمت مصوب کالابرگ؛ NULL یعنی همان قیمت فروش عادی اعمال شود.
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "rationPrice" NUMERIC(18,2);

ALTER TABLE "Product" DROP CONSTRAINT IF EXISTS "Product_rationPrice_check";
ALTER TABLE "Product" ADD CONSTRAINT "Product_rationPrice_check"
  CHECK ("rationPrice" IS NULL OR "rationPrice" >= 0);

CREATE INDEX IF NOT EXISTS "Product_companyId_ration_idx"
  ON "Product" ("companyId") WHERE "isRationEligible";

-- ---------- ۲. حساب کالابرگ (سرپرست خانوار) ----------

CREATE TABLE IF NOT EXISTS "RationAccount" (
  id TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  -- کد ملی سرپرست خانوار
  "nationalCode" TEXT NOT NULL,
  "holderName" TEXT,
  phone TEXT,
  -- تعداد افراد خانوار؛ سقف اعتبار دوره معمولاً از این مشتق می‌شود
  "householdSize" INTEGER NOT NULL DEFAULT 1,
  balance NUMERIC(18,2) NOT NULL DEFAULT 0,
  -- دورهٔ تخصیص، مثلاً '1405-05'
  "periodCode" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  note TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE "RationAccount" ADD CONSTRAINT "RationAccount_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"(id) ON DELETE CASCADE;

-- اعتبار هرگز نباید منفی شود؛ همان الگوی قید موجودی صندوق.
ALTER TABLE "RationAccount" ADD CONSTRAINT "RationAccount_balance_check"
  CHECK (balance >= 0);

ALTER TABLE "RationAccount" ADD CONSTRAINT "RationAccount_householdSize_check"
  CHECK ("householdSize" >= 1);

-- هر کد ملی در هر فروشگاه یک حساب دارد.
CREATE UNIQUE INDEX IF NOT EXISTS "RationAccount_companyId_nationalCode_key"
  ON "RationAccount" ("companyId", "nationalCode");

-- ---------- ۳. دفتر تراکنش کالابرگ ----------

CREATE TABLE IF NOT EXISTS "RationTransaction" (
  id TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  -- SPEND: خرید | ALLOCATE: شارژ دوره‌ای | REVERSE: برگشت فاکتور
  type TEXT NOT NULL,
  amount NUMERIC(18,2) NOT NULL,
  "saleId" TEXT,
  "periodCode" TEXT,
  reference TEXT,
  note TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE "RationTransaction" ADD CONSTRAINT "RationTransaction_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"(id) ON DELETE CASCADE;

ALTER TABLE "RationTransaction" ADD CONSTRAINT "RationTransaction_accountId_fkey"
  FOREIGN KEY ("accountId") REFERENCES "RationAccount"(id) ON DELETE CASCADE;

ALTER TABLE "RationTransaction" ADD CONSTRAINT "RationTransaction_saleId_fkey"
  FOREIGN KEY ("saleId") REFERENCES "Sale"(id) ON DELETE SET NULL;

ALTER TABLE "RationTransaction" ADD CONSTRAINT "RationTransaction_type_check"
  CHECK (type IN ('SPEND', 'ALLOCATE', 'REVERSE'));

ALTER TABLE "RationTransaction" ADD CONSTRAINT "RationTransaction_amount_check"
  CHECK (amount > 0);

-- یک فاکتور بیش از یک‌بار از کالابرگ برداشت نمی‌کند.
CREATE UNIQUE INDEX IF NOT EXISTS "RationTransaction_spend_per_sale_key"
  ON "RationTransaction" ("saleId") WHERE type = 'SPEND' AND "saleId" IS NOT NULL;

-- شارژ دوره‌ای هر حساب در هر دوره فقط یک‌بار.
CREATE UNIQUE INDEX IF NOT EXISTS "RationTransaction_allocation_key"
  ON "RationTransaction" ("accountId", "periodCode")
  WHERE type = 'ALLOCATE' AND "periodCode" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "RationTransaction_companyId_createdAt_idx"
  ON "RationTransaction" ("companyId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "RationTransaction_accountId_idx"
  ON "RationTransaction" ("accountId");

-- ---------- ۴. اتصال فاکتور به کالابرگ ----------

ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "rationAccountId" TEXT;
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS
  "rationAmount" NUMERIC(18,2) NOT NULL DEFAULT 0;

ALTER TABLE "Sale" DROP CONSTRAINT IF EXISTS "Sale_rationAccountId_fkey";
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_rationAccountId_fkey"
  FOREIGN KEY ("rationAccountId") REFERENCES "RationAccount"(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "Sale_rationAccountId_idx" ON "Sale" ("rationAccountId");

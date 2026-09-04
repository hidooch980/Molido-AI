-- =============================================
-- ویزیتور / بازاریاب و کمیسیون فروش
--
-- `SalesAgent` وجود داشت با `commissionRate` و `monthlyTarget`، ولی هیچ
-- فاکتوری به ویزیتور وصل نمی‌شد.  یعنی نرخ کمیسیون ثبت می‌شد و هرگز روی
-- چیزی اعمال نمی‌گشت — نه کمیسیونی محاسبه می‌شد، نه عملکردی سنجیده.
-- =============================================

-- ---------- ۱) اتصال فاکتور به ویزیتور ----------
ALTER TABLE "Sale"     ADD COLUMN IF NOT EXISTS "salesAgentId" TEXT;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "salesAgentId" TEXT;

CREATE INDEX IF NOT EXISTS "Sale_agent_idx"     ON "Sale" ("salesAgentId");
CREATE INDEX IF NOT EXISTS "Customer_agent_idx" ON "Customer" ("salesAgentId");

-- ---------- ۲) ستون‌های لازم ----------
ALTER TABLE "SalesAgent" ADD COLUMN IF NOT EXISTS "agentNo" TEXT;
ALTER TABLE "SalesAgent" ADD COLUMN IF NOT EXISTS "userId"  TEXT;
ALTER TABLE "SalesAgent" ADD COLUMN IF NOT EXISTS "nationalCode" TEXT;

-- شماره برای ویزیتورهای موجود
-- ROW_NUMBER در UPDATE مجاز نیست؛ شماره‌گذاری در یک زیرپرس‌وجو انجام و
-- سپس متصل می‌شود.
UPDATE "SalesAgent" a
   SET "agentNo" = 'AG-' || LPAD(n.rn::text, 5, '0')
  FROM (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY "companyId" ORDER BY "createdAt") AS rn
      FROM "SalesAgent"
     WHERE "agentNo" IS NULL
  ) n
 WHERE a.id = n.id AND a."agentNo" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "SalesAgent_company_no_key"
  ON "SalesAgent" ("companyId", "agentNo");

-- نرخ کمیسیون درصد است، نه ضریب.  بدون این قید، نرخ ۱۵ به‌جای ۰٫۱۵ ثبت
-- می‌شود و کمیسیون صد برابر واقعیت درمی‌آید.
DO $$
BEGIN
  ALTER TABLE "SalesAgent" ADD CONSTRAINT "SalesAgent_rate_chk"
    CHECK ("commissionRate" >= 0 AND "commissionRate" <= 100);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------- ۳) کمیسیون ----------
-- کمیسیون در پایان دوره **تثبیت** می‌شود، نه اینکه هر بار از روی فروش
-- محاسبه شود.  اگر نرخ ویزیتور بعداً عوض شود، کمیسیون‌های پرداخت‌شدهٔ گذشته
-- نباید تغییر کنند.
CREATE TABLE IF NOT EXISTS "AgentCommission" (
  id            TEXT PRIMARY KEY,
  "companyId"   TEXT NOT NULL,
  "agentId"     TEXT NOT NULL REFERENCES "SalesAgent"(id) ON DELETE CASCADE,
  period        DATE NOT NULL,
  -- فروش خالص دوره (فروش منهای مرجوعی)
  "salesTotal"  NUMERIC(18,2) NOT NULL DEFAULT 0,
  "returnTotal" NUMERIC(18,2) NOT NULL DEFAULT 0,
  "netSales"    NUMERIC(18,2) NOT NULL DEFAULT 0,
  -- نرخ در لحظهٔ محاسبه ثبت می‌شود تا سند تاریخی معتبر بماند
  rate          NUMERIC(6,2)  NOT NULL DEFAULT 0,
  amount        NUMERIC(18,2) NOT NULL DEFAULT 0,
  "invoiceCount" INTEGER NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'CALCULATED',
  "paidAt"      TIMESTAMPTZ,
  note          TEXT,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "AgentCommission_status_chk"
    CHECK (status IN ('CALCULATED','APPROVED','PAID','CANCELLED'))
);

-- یک ویزیتور در یک دوره فقط یک کمیسیون.  محاسبهٔ دوبارهٔ پایان ماه نباید
-- دو برابر پرداخت بسازد.
CREATE UNIQUE INDEX IF NOT EXISTS "AgentCommission_unique"
  ON "AgentCommission" ("agentId", period);

CREATE INDEX IF NOT EXISTS "AgentCommission_company_period_idx"
  ON "AgentCommission" ("companyId", period);

-- ---------- ۴) حساب کمیسیون ----------
INSERT INTO "Account" (id, "companyId", name, code, type, "isPostable")
SELECT gen_random_uuid()::text, c.id, 'هزینهٔ کمیسیون فروش', '5206', 'EXPENSE', true
FROM "Company" c
WHERE NOT EXISTS (
  SELECT 1 FROM "Account" a WHERE a."companyId" = c.id AND a.code = '5206'
);

INSERT INTO "Account" (id, "companyId", name, code, type, "isPostable")
SELECT gen_random_uuid()::text, c.id, 'کمیسیون پرداختنی', '2106', 'LIABILITY', true
FROM "Company" c
WHERE NOT EXISTS (
  SELECT 1 FROM "Account" a WHERE a."companyId" = c.id AND a.code = '2106'
);

-- مغایرت‌گیری بانکی
--
-- تطبیقِ صورتحسابِ بانک با گردشِ خزانه.
--
-- ⚠️ چرا لازم است: دفترِ ما و بانک همیشه با هم فرق دارند.
--
--    چکِ صادرشده که هنوز نقد نشده، کارمزدی که بانک برداشته و ما ثبت
--    نکرده‌ایم، واریزی که مشتری زده و ما خبر نداریم.  بدونِ مغایرت‌گیری،
--    این تفاوت‌ها روی هم جمع می‌شوند تا جایی که دیگر معلوم نیست کدامش
--    عادی است و کدامش اشتباه — یا اختلاس.

-- ---------- ۱) جلسهٔ مغایرت‌گیری ----------
CREATE TABLE IF NOT EXISTS "BankReconciliation" (
  id                 TEXT PRIMARY KEY,
  "companyId"        TEXT NOT NULL REFERENCES "Company"(id) ON DELETE CASCADE,
  "accountId"        TEXT NOT NULL REFERENCES "TreasuryAccount"(id) ON DELETE CASCADE,

  -- تاریخِ صورتحسابِ بانک و ماندهٔ اعلامیِ بانک در آن تاریخ.
  "statementDate"    DATE NOT NULL,
  "statementBalance" NUMERIC(18,2) NOT NULL,

  status             TEXT NOT NULL DEFAULT 'OPEN',
  "completedAt"      TIMESTAMPTZ,
  "completedBy"      TEXT REFERENCES "User"(id) ON DELETE SET NULL,
  note               TEXT,
  "createdAt"        TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "BankReconciliation_status_check"
    CHECK (status IN ('OPEN', 'COMPLETED')),

  -- ⚠️ «تکمیل‌شده» بدونِ زمانِ تکمیل بی‌معنی است، و برعکس.
  --    دو ستون که می‌توانند با هم نخوانند، روزی نمی‌خوانند.
  CONSTRAINT "BankReconciliation_completed_check"
    CHECK ((status = 'COMPLETED') = ("completedAt" IS NOT NULL))
);

-- ⚠️ برای هر حساب و هر تاریخ فقط یک جلسه.
--
--    دو جلسهٔ باز روی یک تاریخ یعنی دو نفر جدا تطبیق می‌دهند و هر کدام
--    نیمی از سطرها را می‌بندد — و در پایان هیچ‌کدام تراز نمی‌شود.
CREATE UNIQUE INDEX IF NOT EXISTS "BankReconciliation_account_date_key"
  ON "BankReconciliation" ("accountId", "statementDate");

-- ---------- ۲) سطرهای صورتحسابِ بانک ----------
CREATE TABLE IF NOT EXISTS "BankStatementLine" (
  id                 TEXT PRIMARY KEY,
  "companyId"        TEXT NOT NULL REFERENCES "Company"(id) ON DELETE CASCADE,
  "reconciliationId" TEXT NOT NULL REFERENCES "BankReconciliation"(id) ON DELETE CASCADE,

  "occurredAt"       DATE NOT NULL,
  -- ⚠️ علامت‌دار: مثبت واریز، منفی برداشت.
  --
  --    ستونِ جدا برای بدهکار و بستانکار وسوسه‌انگیز است ولی یعنی هر
  --    مقایسه باید بداند کدام‌یک پر است.  یک عددِ علامت‌دار با گردشِ
  --    خزانه مستقیم مقایسه می‌شود.
  amount             NUMERIC(18,2) NOT NULL,
  reference          TEXT,
  description        TEXT,

  -- گردشِ خزانه‌ای که این سطر با آن تطبیق خورده.
  "matchedTxId"      TEXT REFERENCES "TreasuryTransaction"(id) ON DELETE SET NULL,
  "matchedAt"        TIMESTAMPTZ,
  -- AUTO یا MANUAL — برای اینکه بعداً بشود دید کدام تطبیق‌ها را ماشین زده.
  "matchMethod"      TEXT,

  "createdAt"        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "BankStatementLine_amount_check" CHECK (amount <> 0),
  CONSTRAINT "BankStatementLine_match_check"
    CHECK (("matchedTxId" IS NULL) = ("matchedAt" IS NULL)),
  CONSTRAINT "BankStatementLine_method_check"
    CHECK ("matchMethod" IS NULL OR "matchMethod" IN ('AUTO', 'MANUAL'))
);

-- ⚠️ هر گردشِ خزانه حداکثر به **یک** سطرِ صورتحساب می‌خورد.
--
--    بدونِ این قید، یک واریزِ واحد می‌تواند دو سطرِ بانک را ببندد و
--    مغایرت‌گیری تراز به نظر برسد در حالی که پولی گم شده.  این همان
--    جنس خطایی است که با نگاه کردن پیدا نمی‌شود.
CREATE UNIQUE INDEX IF NOT EXISTS "BankStatementLine_tx_key"
  ON "BankStatementLine" ("matchedTxId") WHERE "matchedTxId" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "BankStatementLine_recon_idx"
  ON "BankStatementLine" ("reconciliationId", "occurredAt");

-- ---------- ۳) جداسازیِ شرکت ----------
ALTER TABLE "BankReconciliation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BankReconciliation" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS company_isolation ON "BankReconciliation";
CREATE POLICY company_isolation ON "BankReconciliation"
  USING ("companyId" = current_setting('app.company_id', true))
  WITH CHECK ("companyId" = current_setting('app.company_id', true));

ALTER TABLE "BankStatementLine" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BankStatementLine" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS company_isolation ON "BankStatementLine";
CREATE POLICY company_isolation ON "BankStatementLine"
  USING ("companyId" = current_setting('app.company_id', true))
  WITH CHECK ("companyId" = current_setting('app.company_id', true));

GRANT SELECT, INSERT, UPDATE ON "BankReconciliation" TO molido_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "BankStatementLine" TO molido_app;

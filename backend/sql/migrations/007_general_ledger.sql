-- دفتر کل و سند حسابداری
--
-- تا اینجا `Account` فقط یک فهرست بود و هیچ سندی صادر نمی‌شد؛ سود و زیان از
-- جمع ساده‌ی فاکتورها می‌آمد نه از دفاتر.  این migration دفتر کل واقعی را
-- اضافه می‌کند.
--
-- اصل طراحی، همان الگوی `Receipt` و `RationAccount`: قاعده‌های حسابداری در
-- سطح دیتابیس اعمال می‌شوند، نه فقط در کد.  یعنی حتی اگر روزی سرویس دیگری
-- مستقیم بنویسد، سند نامتوازن ثبت نمی‌شود.

-- ---------- ۱. اصلاح جدول حساب ----------

-- کد حساب سراسری یکتا بود؛ یعنی دو شرکت نمی‌توانستند هر دو کد «۱۰۰۱» داشته
-- باشند.  در سامانهٔ چندمستأجری این غلط است.
ALTER TABLE "Account" DROP CONSTRAINT IF EXISTS "Account_code_key";

CREATE UNIQUE INDEX IF NOT EXISTS "Account_companyId_code_key"
  ON "Account" ("companyId", code);

-- پنج گروه استاندارد.  ماهیت حساب (بدهکار یا بستانکار) از همین مشتق می‌شود،
-- بنابراین ستون جداگانه لازم نیست.
ALTER TABLE "Account" DROP CONSTRAINT IF EXISTS "Account_type_check";
ALTER TABLE "Account" ADD CONSTRAINT "Account_type_check"
  CHECK (type IN ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'));

-- حساب کل / معین: حساب پدر برای گزارش سلسله‌مراتبی
ALTER TABLE "Account" ADD COLUMN IF NOT EXISTS "parentId" TEXT;

ALTER TABLE "Account" DROP CONSTRAINT IF EXISTS "Account_parentId_fkey";
ALTER TABLE "Account" ADD CONSTRAINT "Account_parentId_fkey"
  FOREIGN KEY ("parentId") REFERENCES "Account"(id) ON DELETE SET NULL;

-- فقط به حساب برگی سند می‌خورد؛ حساب کل جمع فرزندانش است.
ALTER TABLE "Account" ADD COLUMN IF NOT EXISTS
  "isPostable" BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS "Account_parentId_idx" ON "Account" ("parentId");

-- ---------- ۲. سال مالی ----------

CREATE TABLE IF NOT EXISTS "FiscalYear" (
  id TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  -- مثلاً '1405'
  code TEXT NOT NULL,
  "startsOn" DATE NOT NULL,
  "endsOn" DATE NOT NULL,
  -- OPEN: سند می‌پذیرد | CLOSED: بسته شده و فقط خواندنی است
  status TEXT NOT NULL DEFAULT 'OPEN',
  "closedAt" TIMESTAMPTZ,
  note TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE "FiscalYear" ADD CONSTRAINT "FiscalYear_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"(id) ON DELETE CASCADE;

ALTER TABLE "FiscalYear" ADD CONSTRAINT "FiscalYear_status_check"
  CHECK (status IN ('OPEN', 'CLOSED'));

ALTER TABLE "FiscalYear" ADD CONSTRAINT "FiscalYear_range_check"
  CHECK ("endsOn" > "startsOn");

CREATE UNIQUE INDEX IF NOT EXISTS "FiscalYear_companyId_code_key"
  ON "FiscalYear" ("companyId", code);

-- بازه‌های سال مالی یک شرکت نباید هم‌پوشانی داشته باشند، وگرنه یک تاریخ به دو
-- سال تعلق می‌گیرد و سند سرگردان می‌شود.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "FiscalYear" DROP CONSTRAINT IF EXISTS "FiscalYear_no_overlap";
ALTER TABLE "FiscalYear" ADD CONSTRAINT "FiscalYear_no_overlap"
  EXCLUDE USING gist (
    "companyId" WITH =,
    daterange("startsOn", "endsOn", '[]') WITH &&
  );

-- ---------- ۳. سند حسابداری ----------

CREATE TABLE IF NOT EXISTS "JournalEntry" (
  id TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "fiscalYearId" TEXT NOT NULL,
  -- شمارهٔ سند، در هر شرکت یکتا
  "entryNo" TEXT NOT NULL,
  "entryDate" DATE NOT NULL DEFAULT CURRENT_DATE,
  -- سند از کجا آمده: 'Sale' | 'Purchase' | 'Receipt' | 'Expense' | 'PayrollSlip'
  -- | 'MANUAL' — برای ردیابی برگشتی از سند به سند مبنا
  "sourceType" TEXT NOT NULL DEFAULT 'MANUAL',
  "sourceId" TEXT,
  description TEXT,
  -- DRAFT: قابل ویرایش | POSTED: قطعی | REVERSED: با سند معکوس خنثی شده
  status TEXT NOT NULL DEFAULT 'POSTED',
  -- سندی که این را خنثی کرده است
  "reversedById" TEXT,
  "createdBy" TEXT,
  "postedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"(id) ON DELETE CASCADE;

ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_fiscalYearId_fkey"
  FOREIGN KEY ("fiscalYearId") REFERENCES "FiscalYear"(id) ON DELETE RESTRICT;

ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_reversedById_fkey"
  FOREIGN KEY ("reversedById") REFERENCES "JournalEntry"(id) ON DELETE SET NULL;

ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_status_check"
  CHECK (status IN ('DRAFT', 'POSTED', 'REVERSED'));

CREATE UNIQUE INDEX IF NOT EXISTS "JournalEntry_companyId_entryNo_key"
  ON "JournalEntry" ("companyId", "entryNo");

-- هر سند مبنا فقط یک سند فعال دارد؛ ثبت دوبارهٔ یک فاکتور غیرممکن می‌شود.
CREATE UNIQUE INDEX IF NOT EXISTS "JournalEntry_source_key"
  ON "JournalEntry" ("companyId", "sourceType", "sourceId")
  WHERE "sourceId" IS NOT NULL AND status <> 'REVERSED';

CREATE INDEX IF NOT EXISTS "JournalEntry_companyId_entryDate_idx"
  ON "JournalEntry" ("companyId", "entryDate" DESC);

CREATE INDEX IF NOT EXISTS "JournalEntry_fiscalYearId_idx"
  ON "JournalEntry" ("fiscalYearId");

-- ---------- ۴. اقلام سند ----------

CREATE TABLE IF NOT EXISTS "JournalLine" (
  id TEXT PRIMARY KEY,
  "entryId" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "lineNo" INTEGER NOT NULL DEFAULT 1,
  debit NUMERIC(18,2) NOT NULL DEFAULT 0,
  credit NUMERIC(18,2) NOT NULL DEFAULT 0,
  description TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_entryId_fkey"
  FOREIGN KEY ("entryId") REFERENCES "JournalEntry"(id) ON DELETE CASCADE;

ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_accountId_fkey"
  FOREIGN KEY ("accountId") REFERENCES "Account"(id) ON DELETE RESTRICT;

ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_amount_check"
  CHECK (debit >= 0 AND credit >= 0);

-- هر قلم یا بدهکار است یا بستانکار — نه هر دو، نه هیچ‌کدام.
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_one_side_check"
  CHECK ((debit = 0) <> (credit = 0));

CREATE INDEX IF NOT EXISTS "JournalLine_entryId_idx" ON "JournalLine" ("entryId");
CREATE INDEX IF NOT EXISTS "JournalLine_accountId_idx" ON "JournalLine" ("accountId");

-- ---------- ۵. قاعدهٔ توازن ----------

-- توازن یک شرط بین چند سطر است، پس با CHECK ساده اعمال نمی‌شود.  تریگر
-- DEFERRABLE در لحظهٔ commit بررسی می‌کند، بنابراین سرویس می‌تواند سطرها را
-- یکی‌یکی درج کند و در پایان تراکنش توازن سنجیده شود.
CREATE OR REPLACE FUNCTION assert_journal_balanced() RETURNS TRIGGER AS $$
DECLARE
  target TEXT;
  total_debit NUMERIC(18,2);
  total_credit NUMERIC(18,2);
  line_count INTEGER;
  entry_status TEXT;
BEGIN
  target := COALESCE(NEW."entryId", OLD."entryId");

  SELECT status INTO entry_status FROM "JournalEntry" WHERE id = target;

  -- سندی که حذف شده، توازنی برای بررسی ندارد
  IF entry_status IS NULL THEN
    RETURN NULL;
  END IF;

  -- پیش‌نویس هنوز در حال تنظیم است و لازم نیست متوازن باشد
  IF entry_status = 'DRAFT' THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(sum(debit), 0), COALESCE(sum(credit), 0), count(*)
    INTO total_debit, total_credit, line_count
    FROM "JournalLine" WHERE "entryId" = target;

  IF line_count < 2 THEN
    RAISE EXCEPTION 'سند حسابداری باید حداقل دو قلم داشته باشد (سند %)', target;
  END IF;

  IF total_debit <> total_credit THEN
    RAISE EXCEPTION
      'سند حسابداری متوازن نیست: بدهکار % در برابر بستانکار % (سند %)',
      total_debit, total_credit, target;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS journal_line_balance ON "JournalLine";
CREATE CONSTRAINT TRIGGER journal_line_balance
  AFTER INSERT OR UPDATE OR DELETE ON "JournalLine"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION assert_journal_balanced();

-- سندی که از پیش‌نویس به قطعی می‌رود هم باید همان‌جا سنجیده شود.
CREATE OR REPLACE FUNCTION assert_entry_balanced_on_post() RETURNS TRIGGER AS $$
DECLARE
  total_debit NUMERIC(18,2);
  total_credit NUMERIC(18,2);
  line_count INTEGER;
BEGIN
  IF NEW.status <> 'POSTED' THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(sum(debit), 0), COALESCE(sum(credit), 0), count(*)
    INTO total_debit, total_credit, line_count
    FROM "JournalLine" WHERE "entryId" = NEW.id;

  IF line_count < 2 THEN
    RAISE EXCEPTION 'سند حسابداری باید حداقل دو قلم داشته باشد (سند %)', NEW.id;
  END IF;

  IF total_debit <> total_credit THEN
    RAISE EXCEPTION
      'سند حسابداری متوازن نیست: بدهکار % در برابر بستانکار % (سند %)',
      total_debit, total_credit, NEW.id;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS journal_entry_balance ON "JournalEntry";
CREATE CONSTRAINT TRIGGER journal_entry_balance
  AFTER INSERT OR UPDATE ON "JournalEntry"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION assert_entry_balanced_on_post();

-- ---------- ۶. قفل سال مالی بسته ----------

-- سال بسته نباید سند تازه بپذیرد.  این کنترل در دیتابیس است تا هیچ مسیری —
-- حتی اسکریپت دستی — نتواند دورهٔ بسته را دستکاری کند.
CREATE OR REPLACE FUNCTION assert_fiscal_year_open() RETURNS TRIGGER AS $$
DECLARE
  year_status TEXT;
BEGIN
  SELECT status INTO year_status FROM "FiscalYear" WHERE id = NEW."fiscalYearId";

  IF year_status = 'CLOSED' THEN
    RAISE EXCEPTION 'سال مالی بسته است و سند جدید نمی‌پذیرد';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS journal_entry_open_year ON "JournalEntry";
CREATE TRIGGER journal_entry_open_year
  BEFORE INSERT OR UPDATE ON "JournalEntry"
  FOR EACH ROW EXECUTE FUNCTION assert_fiscal_year_open();

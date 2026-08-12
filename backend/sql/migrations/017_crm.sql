-- =============================================
-- CRM واقعی: سرنخ ← فرصت ← تعامل
--
-- ماژول `crm` تا امروز یک CRUD روی `LoyaltyAccount` بود — یعنی «باشگاه
-- مشتریان» را CRM نامیده بودند.  هیچ جدولی برای سرنخ، فرصت، قیف فروش یا
-- تعامل وجود نداشت.
--
-- طراحی عمداً به زنجیرهٔ فروش موجود وصل می‌شود: فرصت به پیش‌فاکتور تبدیل
-- می‌شود و از آنجا به سفارش و فاکتور.  CRM جزیره‌ای — که فقط یادداشت نگه
-- دارد و به فروش وصل نباشد — همان چیزی است که در این پروژه ۴۷ بار تکرار
-- شده و باید از آن پرهیز کرد.
-- =============================================

-- ---------- ۱) سرنخ ----------
CREATE TABLE IF NOT EXISTS "Lead" (
  id            TEXT PRIMARY KEY,
  "companyId"   TEXT NOT NULL,
  "leadNo"      TEXT NOT NULL,
  name          TEXT NOT NULL,
  company       TEXT,
  phone         TEXT,
  email         TEXT,
  -- از کجا آمده: تبلیغات، معرفی، تماس ورودی، نمایشگاه…
  source        TEXT NOT NULL DEFAULT 'OTHER',
  status        TEXT NOT NULL DEFAULT 'NEW',
  -- امتیاز کیفیت سرنخ (۰ تا ۱۰۰) برای اولویت‌بندی تماس‌ها
  score         INTEGER NOT NULL DEFAULT 0,
  "assignedTo"  TEXT,
  "salesAgentId" TEXT,
  -- وقتی سرنخ به مشتری تبدیل شد، اینجا وصل می‌شود
  "customerId"  TEXT,
  note          TEXT,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "Lead_status_chk" CHECK (status IN (
    'NEW','CONTACTED','QUALIFIED','CONVERTED','LOST'
  )),
  CONSTRAINT "Lead_source_chk" CHECK (source IN (
    'AD','REFERRAL','INBOUND','EXHIBITION','WEBSITE','COLD_CALL','OTHER'
  )),
  CONSTRAINT "Lead_score_chk" CHECK (score BETWEEN 0 AND 100)
);

CREATE UNIQUE INDEX IF NOT EXISTS "Lead_company_no_key"
  ON "Lead" ("companyId", "leadNo");
CREATE INDEX IF NOT EXISTS "Lead_company_status_idx"
  ON "Lead" ("companyId", status);
CREATE INDEX IF NOT EXISTS "Lead_assigned_idx" ON "Lead" ("assignedTo");

-- ---------- ۲) فرصت فروش ----------
CREATE TABLE IF NOT EXISTS "Opportunity" (
  id            TEXT PRIMARY KEY,
  "companyId"   TEXT NOT NULL,
  "oppNo"       TEXT NOT NULL,
  title         TEXT NOT NULL,
  "leadId"      TEXT REFERENCES "Lead"(id) ON DELETE SET NULL,
  "customerId"  TEXT,
  "salesAgentId" TEXT,
  "assignedTo"  TEXT,

  -- مبلغ برآوردی و احتمال موفقیت؛ حاصل‌ضربشان «ارزش وزنی» قیف است
  amount        NUMERIC(18,2) NOT NULL DEFAULT 0,
  probability   INTEGER NOT NULL DEFAULT 50,
  stage         TEXT NOT NULL DEFAULT 'PROSPECT',
  "expectedCloseDate" DATE,
  "closedAt"    TIMESTAMPTZ,
  "lostReason"  TEXT,

  -- اتصال به زنجیرهٔ فروش: فرصت برنده‌شده پیش‌فاکتور می‌سازد
  "quotationId" TEXT,
  note          TEXT,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "Opportunity_stage_chk" CHECK (stage IN (
    'PROSPECT','QUALIFIED','PROPOSAL','NEGOTIATION','WON','LOST'
  )),
  CONSTRAINT "Opportunity_prob_chk" CHECK (probability BETWEEN 0 AND 100),
  CONSTRAINT "Opportunity_amount_chk" CHECK (amount >= 0),
  -- فرصت باخته باید دلیل داشته باشد؛ بدون آن، گزارش «چرا می‌بازیم» ممکن
  -- نیست و همان گزارش، تنها ارزش واقعی ثبت باخت است.
  CONSTRAINT "Opportunity_lost_chk" CHECK (
    stage <> 'LOST' OR "lostReason" IS NOT NULL
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS "Opportunity_company_no_key"
  ON "Opportunity" ("companyId", "oppNo");
CREATE INDEX IF NOT EXISTS "Opportunity_company_stage_idx"
  ON "Opportunity" ("companyId", stage);
CREATE INDEX IF NOT EXISTS "Opportunity_customer_idx"
  ON "Opportunity" ("customerId");

-- ---------- ۳) تعامل ----------
-- هر تماس، جلسه، ایمیل یا پیامک.  به سرنخ یا فرصت یا مشتری وصل می‌شود.
CREATE TABLE IF NOT EXISTS "Interaction" (
  id            TEXT PRIMARY KEY,
  "companyId"   TEXT NOT NULL,
  type          TEXT NOT NULL DEFAULT 'CALL',
  subject       TEXT NOT NULL,
  body          TEXT,
  "leadId"      TEXT REFERENCES "Lead"(id) ON DELETE CASCADE,
  "opportunityId" TEXT REFERENCES "Opportunity"(id) ON DELETE CASCADE,
  "customerId"  TEXT,
  "userId"      TEXT,
  "occurredAt"  TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- پیگیری بعدی: تاریخ و اینکه انجام شده یا نه
  "followUpAt"  TIMESTAMPTZ,
  "followUpDone" BOOLEAN NOT NULL DEFAULT false,
  outcome       TEXT,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "Interaction_type_chk" CHECK (type IN (
    'CALL','MEETING','EMAIL','SMS','VISIT','NOTE','OTHER'
  )),
  -- تعامل باید به چیزی وصل باشد؛ تعاملِ معلق در هیچ گزارشی دیده نمی‌شود.
  CONSTRAINT "Interaction_link_chk" CHECK (
    "leadId" IS NOT NULL OR "opportunityId" IS NOT NULL OR "customerId" IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS "Interaction_lead_idx" ON "Interaction" ("leadId");
CREATE INDEX IF NOT EXISTS "Interaction_opp_idx"  ON "Interaction" ("opportunityId");
CREATE INDEX IF NOT EXISTS "Interaction_customer_idx" ON "Interaction" ("customerId");
-- پیگیری‌های سررسیدشده: پرکاربردترین پرس‌وجوی روزانهٔ فروشنده
CREATE INDEX IF NOT EXISTS "Interaction_followup_idx"
  ON "Interaction" ("companyId", "followUpAt")
  WHERE "followUpDone" = false;

-- ---------- ۴) سیاست RLS برای جدول‌های تازه ----------
-- طبق قاعده‌ای که در ۰۱۶ گذاشته شد: هر مهاجرتی که جدول با companyId
-- می‌سازد، باید سیاست را هم بسازد.
DO $$
DECLARE
  target RECORD;
BEGIN
  FOR target IN
    SELECT c.relname AS table_name
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN information_schema.columns col
        ON col.table_name = c.relname
       AND col.table_schema = n.nspname
       AND col.column_name = 'companyId'
     WHERE n.nspname = 'public'
       AND c.relkind = 'r'
       AND NOT EXISTS (
         SELECT 1 FROM pg_policies p
          WHERE p.tablename = c.relname AND p.policyname = 'company_isolation'
       )
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', target.table_name);
    EXECUTE format($f$
      CREATE POLICY company_isolation ON %I
        FOR ALL TO molido_app
        USING ("companyId" = NULLIF(current_setting('app.company_id', true), ''))
        WITH CHECK ("companyId" = NULLIF(current_setting('app.company_id', true), ''))
    $f$, target.table_name);
    RAISE NOTICE 'RLS policy added: %', target.table_name;
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO molido_app;

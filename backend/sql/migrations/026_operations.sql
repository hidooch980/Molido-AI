-- =============================================
-- عملیات: ثبت خطا، سلامت نصب، و پشتیبانی از راه دور
--
-- سه چیز که یک سامانهٔ نصب‌شده در فروشگاه لازم دارد و تا امروز نداشت:
--
--   ۱. خطاها جایی ثبت شوند — نه فقط در لاگ کانتینر که با بازسازی می‌رود
--   ۲. وضعیت نصب قابل دیدن باشد بی‌آنکه کسی SSH بزند
--   ۳. پشتیبانی بتواند با **رضایت صریح** و برای مدت محدود کمک کند
-- =============================================

-- ---------- ۱) خطاها ----------
--
-- خطاها **گروه‌بندی** می‌شوند نه ردیف‌ردیف: هزار بار همان خطا، یک سطر با
-- شمارندهٔ هزار است.  فهرست هزارتایی را کسی نمی‌خواند؛ «۴۳ بار از دیروز،
-- فقط روی صندوق ۲» را می‌خواند.
CREATE TABLE IF NOT EXISTS "ErrorGroup" (
  id            TEXT PRIMARY KEY,
  "companyId"   TEXT REFERENCES "Company"(id) ON DELETE CASCADE,
  -- اثر انگشت: از پیام و محل خطا ساخته می‌شود، بدون شناسه‌ها و اعداد
  -- متغیر — وگرنه هر رخداد گروه خودش می‌شود.
  fingerprint   TEXT NOT NULL,
  message       TEXT NOT NULL,
  "statusCode"  INTEGER,
  path          TEXT,
  method        TEXT,
  count         INTEGER NOT NULL DEFAULT 1,
  "firstSeenAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "lastSeenAt"  TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- نمونهٔ آخر برای عیب‌یابی؛ کل رخدادها نگه داشته نمی‌شود چون حجمش
  -- به‌سرعت از خود داده بیشتر می‌شود.
  "lastStack"   TEXT,
  "lastUserId"  TEXT,
  status        TEXT NOT NULL DEFAULT 'OPEN',
  note          TEXT,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  ALTER TABLE "ErrorGroup" ADD CONSTRAINT "ErrorGroup_status_chk"
    CHECK (status IN ('OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'IGNORED'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- یک گروه برای هر اثر انگشت در هر شرکت.  بدون این، شمارنده کار نمی‌کند و
-- گروه‌بندی بی‌معنا می‌شود.
CREATE UNIQUE INDEX IF NOT EXISTS "ErrorGroup_fingerprint_key"
  ON "ErrorGroup" (COALESCE("companyId", ''), fingerprint);

CREATE INDEX IF NOT EXISTS "ErrorGroup_recent_idx"
  ON "ErrorGroup" ("companyId", "lastSeenAt" DESC)
  WHERE status = 'OPEN';

-- ---------- ۲) سلامت نصب ----------
--
-- عکس لحظه‌ای از وضعیت.  تاریخچه نگه داشته می‌شود نه فقط آخرین حالت:
-- «حجم پشتیبان از هفتهٔ پیش ثابت مانده» فقط با مقایسه دیده می‌شود.
CREATE TABLE IF NOT EXISTS "HealthSnapshot" (
  id           TEXT PRIMARY KEY,
  "companyId"  TEXT REFERENCES "Company"(id) ON DELETE CASCADE,
  version      TEXT,
  metrics      JSONB NOT NULL,
  -- OK / WARN / CRITICAL — محاسبه‌شده، تا فهرست بدون باز کردن هر سطر
  -- قابل مرور باشد.
  severity     TEXT NOT NULL DEFAULT 'OK',
  "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "HealthSnapshot_recent_idx"
  ON "HealthSnapshot" ("companyId", "createdAt" DESC);

-- ---------- ۳) پشتیبانی از راه دور ----------
--
-- دسترسی پشتیبان **فقط با رضایت صریح صاحب فروشگاه**، محدود در زمان، و
-- کاملاً ثبت‌شده.
--
-- سه قید که این را از یک درِ پشتی جدا می‌کند:
--   • کد را صاحب فروشگاه می‌سازد، نه پشتیبان
--   • خودش منقضی می‌شود، حتی اگر کسی یادش برود ببندد
--   • هر کاری که در جلسه انجام شود در گزارش ممیزی می‌ماند
CREATE TABLE IF NOT EXISTS "SupportSession" (
  id            TEXT PRIMARY KEY,
  "companyId"   TEXT NOT NULL REFERENCES "Company"(id) ON DELETE CASCADE,
  code          TEXT NOT NULL,
  -- چه چیزی مجاز است.  پیش‌فرض فقط خواندن؛ نوشتن باید صریح داده شود.
  scope         TEXT NOT NULL DEFAULT 'READ',
  "grantedBy"   TEXT NOT NULL,
  reason        TEXT,
  "expiresAt"   TIMESTAMPTZ NOT NULL,
  "usedAt"      TIMESTAMPTZ,
  "revokedAt"   TIMESTAMPTZ,
  "supportName" TEXT,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  ALTER TABLE "SupportSession" ADD CONSTRAINT "SupportSession_scope_chk"
    CHECK (scope IN ('READ', 'WRITE'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "SupportSession_code_key"
  ON "SupportSession" (code);

CREATE INDEX IF NOT EXISTS "SupportSession_active_idx"
  ON "SupportSession" ("companyId", "expiresAt" DESC);

-- ---------- ۴) RLS ----------
--
-- `ErrorGroup` و `HealthSnapshot` می‌توانند `companyId` تهی داشته باشند
-- (خطای پیش از احراز هویت).  سیاست هم همان حالت را می‌پذیرد، وگرنه آن
-- سطرها برای همیشه نامرئی می‌مانند.
DO $$
DECLARE
  target TEXT;
BEGIN
  FOREACH target IN ARRAY ARRAY['SupportSession']
  LOOP
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM pg_policies
       WHERE tablename = target AND policyname = 'company_isolation'
    );

    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', target);
    EXECUTE format($f$
      CREATE POLICY company_isolation ON %I
        FOR ALL TO molido_app
        USING ("companyId" = NULLIF(current_setting('app.company_id', true), ''))
        WITH CHECK ("companyId" = NULLIF(current_setting('app.company_id', true), ''))
    $f$, target);
  END LOOP;
END $$;

DO $$
DECLARE
  target TEXT;
BEGIN
  FOREACH target IN ARRAY ARRAY['ErrorGroup', 'HealthSnapshot']
  LOOP
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM pg_policies
       WHERE tablename = target AND policyname = 'company_isolation'
    );

    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', target);
    EXECUTE format($f$
      CREATE POLICY company_isolation ON %I
        FOR ALL TO molido_app
        USING (
          "companyId" IS NULL OR
          "companyId" = NULLIF(current_setting('app.company_id', true), '')
        )
        WITH CHECK (
          "companyId" IS NULL OR
          "companyId" = NULLIF(current_setting('app.company_id', true), '')
        )
    $f$, target);
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO molido_app;

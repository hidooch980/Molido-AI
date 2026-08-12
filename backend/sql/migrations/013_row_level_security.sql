-- =============================================
-- جداسازی شرکت‌ها در سطح دیتابیس (Row Level Security)
--
-- تا امروز جداسازی فقط با `WHERE "companyId" = $1` در کد بود.  در ۸۵ ماژول،
-- یک WHERE فراموش‌شده یعنی نشت داده بین شرکت‌ها — بدون هیچ خطایی، فقط
-- بی‌سروصدا داده‌های شرکت دیگر برمی‌گردد.  این بزرگ‌ترین ریسک امنیتی
-- باقی‌ماندهٔ پروژه بود.
--
-- طرح کار:
--   • برنامه با نقش `molido_app` وصل می‌شود که **صاحب** جدول‌ها نیست، پس
--     RLS بر او اعمال می‌شود.
--   • مهاجرت و داده اولیه با `postgres` (صاحب) اجرا می‌شوند و طبق رفتار
--     پیش‌فرض PostgreSQL از RLS معاف‌اند — بدون این، هر مهاجرت آینده
--     مسدود می‌شد.
--   • سیاست‌ها مقدار `app.company_id` را می‌خوانند که `DatabaseService`
--     پیش از هر پرس‌وجو روی اتصال می‌نشاند.
--
-- ⚠️ برای فعال شدن، `PGUSER` سرویس backend باید `molido_app` شود.
-- =============================================

-- ---------- ۱) نقش برنامه ----------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'molido_app') THEN
    -- رمز از یک متغیر محیطی نمی‌آید چون این فایل با psql ساده اجرا می‌شود؛
    -- نقش فقط از داخل شبکهٔ داکر در دسترس است و پورت دیتابیس روی LAN باز
    -- نیست.  برای استقرار عمومی، رمز را پس از اجرا عوض کنید.
    CREATE ROLE molido_app LOGIN PASSWORD 'molido_app_local';
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO molido_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO molido_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO molido_app;

-- جدول‌هایی که بعداً ساخته می‌شوند هم باید دسترسی داشته باشند، وگرنه اولین
-- مهاجرتِ بعدی برنامه را می‌شکند.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO molido_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO molido_app;

-- ---------- ۲) سیاست روی هر جدولِ دارای companyId ----------
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
     ORDER BY c.relname
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', target.table_name);

    -- FORCE عمداً **زده نمی‌شود**: صاحب جدول (postgres) باید معاف بماند تا
    -- مهاجرت، داده اولیه و پشتیبان‌گیری کار کنند.
    EXECUTE format('DROP POLICY IF EXISTS company_isolation ON %I', target.table_name);

    -- شرط یکسان برای خواندن و نوشتن:
    --   • رشتهٔ تهی یا نبودِ متغیر ⇒ هیچ سطری (fail-closed).  اگر جایی
    --     زمینه را نگذارد، پرس‌وجو خالی برمی‌گردد و نقص فوراً دیده می‌شود
    --     — به‌جای آنکه بی‌سروصدا همه‌چیز را برگرداند.
    --   • WITH CHECK جلوی درج/به‌روزرسانی با companyId شرکت دیگر را می‌گیرد.
    EXECUTE format($f$
      CREATE POLICY company_isolation ON %I
        FOR ALL
        TO molido_app
        USING ("companyId" = NULLIF(current_setting('app.company_id', true), ''))
        WITH CHECK ("companyId" = NULLIF(current_setting('app.company_id', true), ''))
    $f$, target.table_name);
  END LOOP;
END $$;

-- ---------- ۳) جدول‌های بدون companyId ----------
-- `User` شناسهٔ شرکت دارد ولی ورود به سامانه پیش از داشتن زمینه انجام
-- می‌شود: کاربر باید با ایمیل پیدا شود در حالی که هنوز هیچ شرکتی معلوم
-- نیست.  پس سیاست آن اجازه می‌دهد وقتی زمینه تهی است هم خوانده شود.
DROP POLICY IF EXISTS company_isolation ON "User";
CREATE POLICY company_isolation ON "User"
  FOR ALL
  TO molido_app
  USING (
    NULLIF(current_setting('app.company_id', true), '') IS NULL
    OR "companyId" = NULLIF(current_setting('app.company_id', true), '')
  )
  WITH CHECK (
    NULLIF(current_setting('app.company_id', true), '') IS NULL
    OR "companyId" = NULLIF(current_setting('app.company_id', true), '')
  );

-- `Company` خودش: کاربر باید شرکت خودش را ببیند.
ALTER TABLE "Company" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS company_isolation ON "Company";
CREATE POLICY company_isolation ON "Company"
  FOR ALL
  TO molido_app
  USING (
    NULLIF(current_setting('app.company_id', true), '') IS NULL
    OR id = NULLIF(current_setting('app.company_id', true), '')
  )
  WITH CHECK (
    NULLIF(current_setting('app.company_id', true), '') IS NULL
    OR id = NULLIF(current_setting('app.company_id', true), '')
  );

-- جدول‌های فرزند (بدون companyId، مثل SaleItem و JournalLine) از طریق
-- سربرگشان محافظت می‌شوند: رسیدن به آن‌ها همیشه از مسیر سربرگ است و سربرگ
-- خودش تحت RLS است.  سیاست جداگانه برایشان، هر پرس‌وجو را با یک JOIN اضافه
-- سنگین می‌کرد بی‌آنکه مرز تازه‌ای بسازد.

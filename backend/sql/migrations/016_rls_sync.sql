-- =============================================
-- همگام‌سازی سیاست‌های RLS با جدول‌های تازه
--
-- مهاجرت ۰۱۳ سیاست‌ها را برای جدول‌های آن روز ساخت.  هر جدول تازه‌ای که
-- بعد از آن اضافه شود — مثل `AssetDepreciation` و `AgentCommission` —
-- **بی‌محافظ** می‌ماند و بی‌سروصدا داده‌های همهٔ شرکت‌ها را برمی‌گرداند.
--
-- این فایل عمداً به‌شکل «اجرای دوباره بی‌خطر» نوشته شده: هر بار که
-- جدول تازه‌ای اضافه شد، همین فایل را دوباره اجرا کنید (یا محتوایش را در
-- انتهای مهاجرت تازه بگذارید).
--
-- ⚠️ الگو: هر مهاجرتی که جدول با ستون `companyId` می‌سازد، باید این بلوک
-- را هم اجرا کند.
-- =============================================

DO $$
DECLARE
  target RECORD;
  added  INTEGER := 0;
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
          WHERE p.tablename = c.relname
            AND p.policyname = 'company_isolation'
       )
     ORDER BY c.relname
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', target.table_name);

    EXECUTE format($f$
      CREATE POLICY company_isolation ON %I
        FOR ALL
        TO molido_app
        USING ("companyId" = NULLIF(current_setting('app.company_id', true), ''))
        WITH CHECK ("companyId" = NULLIF(current_setting('app.company_id', true), ''))
    $f$, target.table_name);

    added := added + 1;
    RAISE NOTICE 'RLS policy added: %', target.table_name;
  END LOOP;

  RAISE NOTICE 'total policies added: %', added;
END $$;

-- دسترسی نقش برنامه به جدول‌های تازه.  `ALTER DEFAULT PRIVILEGES` در
-- مهاجرت ۰۱۳ فقط برای جدول‌هایی کار می‌کند که پس از آن و توسط همان نقش
-- ساخته شوند؛ این دستور تضمین می‌کند چیزی جا نماند.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO molido_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO molido_app;

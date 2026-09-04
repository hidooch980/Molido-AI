-- جداسازیِ شرکت برای جدول‌هایی که پس از ۰۱۳ ساخته شده‌اند.
--
-- ⚠️ چرا لازم شد؟
--
--    `013_row_level_security.sql` یک حلقه روی همهٔ جدول‌های دارای
--    `companyId` می‌زند و سیاستِ `company_isolation` را می‌سازد — ولی
--    **فقط یک بار، در لحظهٔ اجرای همان مهاجرت**.
--
--    هر جدولی که بعداً ساخته شود، `companyId` داشته باشد و خودش
--    سیاست نسازد، بی‌حفاظ می‌ماند: نقشِ `molido_app` همهٔ سطرهای همهٔ
--    شرکت‌ها را می‌بیند.
--
--    این دقیقاً برای `IdempotencyKey` (مهاجرت ۰۴۵) رخ داد و آزمونِ
--    نگهبانِ `integration.sh` گرفتش — «every companyId table
--    protected».  آن آزمون کارش را کرد؛ این فایل ریشه را می‌بندد.
--
-- ⚠️ چرا حلقهٔ عمومی و نه فقط یک `CREATE POLICY` برای همان جدول؟
--
--    وصلهٔ تک‌جدولی همین اشتباه را برای جدولِ بعدی باز می‌گذاشت.  این
--    فایل خودترمیم است: هر بار اجرا شود، هر جدولِ بی‌سیاستی را
--    می‌پوشاند.  اجرای دوباره‌اش هم بی‌خطر است.

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
       -- فقط آن‌هایی که هنوز سیاست ندارند؛ بقیه دست‌نخورده می‌مانند.
       AND NOT EXISTS (
         SELECT 1 FROM pg_policies p
          WHERE p.tablename = c.relname
            AND p.policyname = 'company_isolation'
       )
     ORDER BY c.relname
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', target.table_name);

    -- شرط عیناً همان ۰۱۳ است: رشتهٔ تهی یا نبودِ متغیر ⇒ هیچ سطری
    -- (fail-closed)، و `WITH CHECK` جلوی درج با شناسهٔ شرکتِ دیگر را
    -- می‌گیرد.  متفاوت نوشتنش یعنی دو رفتارِ جداسازی در یک سامانه.
    EXECUTE format($f$
      CREATE POLICY company_isolation ON %I
        FOR ALL
        TO molido_app
        USING ("companyId" = NULLIF(current_setting('app.company_id', true), ''))
        WITH CHECK ("companyId" = NULLIF(current_setting('app.company_id', true), ''))
    $f$, target.table_name);

    RAISE NOTICE 'RLS backfilled: %', target.table_name;
  END LOOP;
END $$;

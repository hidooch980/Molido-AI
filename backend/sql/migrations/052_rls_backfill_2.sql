-- جداسازیِ شرکت برای جدول‌های ساخته‌شده پس از ۰۴۷.
--
-- ⚠️ همان حلقهٔ ۰۴۷، دوباره.
--
--    مهاجرتِ ۰۴۷ خودترمیم است ولی فقط **در لحظهٔ اجرای خودش** کار
--    می‌کند.  هر جدولِ تازه‌ای که پس از آن ساخته شود و `companyId`
--    داشته باشد، دوباره بی‌حفاظ می‌ماند — یعنی نقشِ `molido_app`
--    سطرهای همهٔ شرکت‌ها را می‌بیند.
--
--    این بار برای `ProductReview` (۰۵۰) و `BudgetCommitment` (۰۵۱)
--    رخ داد.  هر دو `companyId` دارند و هیچ‌کدام سیاست نساختند.
--
-- ⚠️ آزمونِ `integration.sh` گرفتش، نه بازبینیِ من.
--
--    سنجهٔ «every companyId table protected» دقیقاً برای همین هست و
--    دومین بار است که کار می‌کند.  اگر آن آزمون نبود، دو جدولِ تازه
--    با نشتِ داده بین شرکت‌ها منتشر می‌شدند.
--
-- ⚠️ نتیجه: هر مهاجرتی که جدولِ `companyId`دار می‌سازد، باید یا خودش
--    سیاست بسازد یا فایلی مثل این را پس از خودش داشته باشد.

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

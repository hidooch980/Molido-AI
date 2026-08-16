-- =============================================
-- قیدهای یکتا باید در محدودهٔ شرکت باشند، نه سراسری
--
-- چهل جدولِ چندمستأجری قید یکتای تک‌ستونی داشتند:
--
--   UNIQUE ("contractNo")     ← نه UNIQUE ("companyId", "contractNo")
--   UNIQUE ("employeeNo")
--   UNIQUE ("assetNo")
--   ...
--
-- تا وقتی هر کسب‌وکار پشتهٔ جدای خودش را دارد این بی‌اثر است.  ولی
-- طرحِ داده صریحاً چندمستأجری است — `companyId` همه‌جا هست و سیاست‌های
-- RLS روی `app.company_id` تنظیم شده‌اند — و لحظه‌ای که شرکت دوم اضافه
-- شود، دو چیز خراب می‌شود:
--
--   ۱. شرکت ب نمی‌تواند قرارداد «۱۰۰۱» بسازد چون شرکت الف ساخته.
--      پیامی هم که می‌گیرد («شماره قرارداد تکراری است») دربارهٔ
--      رکوردی است که اصلاً حق دیدنش را ندارد.
--
--   ۲. همین پیام خودش نشت اطلاعات است: می‌شود با آزمون‌وخطا فهمید چه
--      شماره‌هایی در شرکت‌های دیگر استفاده شده‌اند.
--
-- `RestaurantTable` از اول درست بود: `UNIQUE ("companyId", "tableNo")`.
-- این مهاجرت بقیه را به همان شکل درمی‌آورد.
--
-- ⚠️ عمداً خودتشخیص است، نه فهرستِ دستیِ چهل جدول.  فهرست دستی هم
--    اشتباه‌پذیر است هم با هر جدول تازه‌ای کهنه می‌شود؛ این پرس‌وجو
--    شرطش را از خودِ طرح می‌گیرد.
--
-- ⚠️ جدول‌هایی که `companyId` ندارند دست نمی‌خورند: `Company.slug` و
--    `User.email` و `ApiKey.keyHash` باید سراسری یکتا بمانند.
-- =============================================

DO $$
DECLARE
  rec RECORD;
  cols TEXT;
  newname TEXT;
BEGIN
  FOR rec IN
    SELECT c.conname,
           t.relname AS tbl,
           pg_get_constraintdef(c.oid) AS def,
           c.conkey
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
     WHERE c.contype = 'u'
       AND n.nspname = 'public'
       -- فقط جدول‌های چندمستأجری
       AND EXISTS (
             SELECT 1 FROM information_schema.columns col
              WHERE col.table_schema = 'public'
                AND col.table_name = t.relname
                AND col.column_name = 'companyId')
       -- و فقط قیدهایی که هنوز companyId ندارند
       AND pg_get_constraintdef(c.oid) NOT LIKE '%companyId%'
  LOOP
    -- ستون‌های فعلی قید، به همان ترتیب
    SELECT string_agg(format('%I', a.attname), ', ' ORDER BY x.ord)
      INTO cols
      FROM unnest(rec.conkey) WITH ORDINALITY AS x(attnum, ord)
      JOIN pg_attribute a ON a.attrelid = (
             SELECT oid FROM pg_class
              WHERE relname = rec.tbl AND relnamespace = 'public'::regnamespace)
       AND a.attnum = x.attnum;

    newname := rec.tbl || '_companyId_' || replace(cols, ', ', '_') || '_key';
    -- نام قید در پستگرس سقف ۶۳ نویسه دارد
    newname := left(replace(newname, '"', ''), 63);

    EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I', rec.tbl, rec.conname);
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I UNIQUE ("companyId", %s)',
      rec.tbl, newname, cols);

    RAISE NOTICE 'محدود به شرکت شد: %.% → (companyId, %)', rec.tbl, rec.conname, cols;
  END LOOP;
END $$;

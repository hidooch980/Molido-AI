-- بازسازیِ سندِ خریدِ دارایی‌هایی که پیش از اصلاح ثبت شده‌اند.
--
-- ⚠️ این مهاجرت **داده** را درست می‌کند، نه کد را.
--
--    تا پیش از این، ثبتِ دارایی هیچ سندی نمی‌زد در حالی که واگذاری و
--    استهلاک می‌زدند.  کد اصلاح شد، ولی دفاترِ موجود همچنان غلط‌اند:
--    حساب ۱۲۰۱ «اموال و تجهیزات» ماندهٔ **بستانکار** دارد، یعنی
--    دارایی‌هایی واگذار شده‌اند که هرگز خریداری نشده بودند.
--
--    اصلاحِ کد بدونِ اصلاحِ داده یعنی ترازنامه تا ابد غلط می‌ماند و
--    هیچ‌کس نمی‌داند چرا.
--
-- ⚠️ فقط دارایی‌هایی که **هنوز سند ندارند**.
--
--    اجرای دوباره چیزی اضافه نمی‌کند، وگرنه هر بار که مهاجرت‌ها
--    دوباره اجرا شوند دفتر دو برابر می‌شود.
--
-- ⚠️ تاریخِ سند، تاریخِ **خرید** است نه امروز.
--
--    گذاشتنِ تاریخِ امروز یعنی دارایی‌ای که پارسال خریده شده در
--    صورت‌های مالیِ امسال ظاهر شود و سودِ هر دو سال غلط شود.

DO $$
DECLARE
  a         record;
  entry_id  text;
  acc_asset text;
  acc_cash  text;
  fy        text;
  n         int := 0;
BEGIN
  -- ⚠️ منبع، **سندِ واگذاری** است نه جدولِ `Asset`.
  --
  --    نسخهٔ اول از `Asset` می‌خواند و فقط ۲ سند از ۲۸ را ساخت:
  --    بیشترِ دارایی‌های واگذارشده دیگر ردیفی در جدول ندارند (پاک
  --    شده‌اند یا آزمون‌ها بردنشان)، ولی سندِ واگذاری‌شان در دفتر
  --    مانده و همان است که ماندهٔ ۱۲۰۱ را بستانکار کرده.
  --
  --    یعنی باید از روی همان چیزی بازسازی کرد که خرابی را ساخته:
  --    بهای تمام‌شده در خطِ بستانکارِ ۱۲۰۱ِ سندِ واگذاری نوشته شده.
  FOR a IN
    SELECT e."sourceId"                        AS id,
           e."companyId",
           e."sourceId"                        AS "assetNo",
           min(e."entryDate")                  AS "purchaseDate",
           sum(l.credit)                       AS "purchasePrice"
      FROM "JournalEntry" e
      JOIN "JournalLine"  l ON l."entryId" = e.id
      JOIN "Account"      c ON c.id = l."accountId"
     WHERE e."sourceType" = 'AssetDisposal'
       AND e.status <> 'REVERSED'
       AND c.code = '1201'
       AND l.credit > 0
       AND NOT EXISTS (
         SELECT 1 FROM "JournalEntry" j
          WHERE j."companyId" = e."companyId"
            AND j."sourceType" = 'AssetAcquisition'
            AND j."sourceId" = e."sourceId"
       )
     GROUP BY e."sourceId", e."companyId"
    HAVING sum(l.credit) > 0
  LOOP
    SELECT id INTO acc_asset FROM "Account"
      WHERE "companyId" = a."companyId" AND code = '1201' LIMIT 1;
    SELECT id INTO acc_cash  FROM "Account"
      WHERE "companyId" = a."companyId" AND code = '1101' LIMIT 1;

    -- ⚠️ `fiscalYearId` اجباری است.
    --
    --    سالِ مالیِ **در بر گیرندهٔ تاریخِ خرید** انتخاب می‌شود، نه
    --    سالِ جاری: سندِ پارسال در سالِ امسال، سودِ هر دو سال را
    --    غلط می‌کند.  اگر چنین سالی نباشد، سند صادر نمی‌شود.
    SELECT id INTO fy FROM "FiscalYear"
     WHERE "companyId" = a."companyId"
       AND COALESCE(a."purchaseDate", CURRENT_DATE) BETWEEN "startsOn" AND "endsOn"
     LIMIT 1;

    IF acc_asset IS NULL OR acc_cash IS NULL OR fy IS NULL THEN
      CONTINUE;
    END IF;

    entry_id := replace(gen_random_uuid()::text, '-', '');

    INSERT INTO "JournalEntry"
      (id, "companyId", "fiscalYearId", "entryNo", "entryDate", description,
       "sourceType", "sourceId", status)
    VALUES (
      entry_id,
      a."companyId",
      fy,
      'JE-BF-' || substr(entry_id, 1, 10),
      COALESCE(a."purchaseDate", CURRENT_DATE),
      'خرید دارایی (اصلاح گذشته — بازسازی از سند واگذاری)',
      'AssetAcquisition',
      a.id,
      'POSTED'
    );

    INSERT INTO "JournalLine"
      (id, "entryId", "accountId", "lineNo", debit, credit, description)
    VALUES
      (replace(gen_random_uuid()::text, '-', ''), entry_id, acc_asset, 1,
       a."purchasePrice", 0, 'خرید دارایی ثابت'),
      (replace(gen_random_uuid()::text, '-', ''), entry_id, acc_cash, 2,
       0, a."purchasePrice", 'پرداخت بابت خرید دارایی');

    n := n + 1;
  END LOOP;

  RAISE NOTICE 'سندِ خریدِ بازسازی‌شده: %', n;
END $$;

-- سندِ افتتاحیهٔ موجودیِ اولیه.
--
-- ⚠️ ایراد روی **تولید** پیدا شد، با سنجهٔ تازهٔ `prod-verify`.
--
--    حساب ۱۱۰۴ «موجودی کالا» — که یک **دارایی** است — ماندهٔ
--    **بستانکار** داشت.  علتش: شش سندِ `SaleCogs` موجودی را از دفتر
--    خارج کرده بودند، ولی هیچ سندی آن را وارد نکرده بود.
--
--    صفر خرید، شش فروش.  موجودیِ اولیه از `seed` آمده بود و `seed`
--    مستقیم در جدولِ `Inventory` می‌نویسد بی‌آنکه سندی بزند.
--
--    دقیقاً همان الگویی که در دارایی‌های ثابت دیده شد (مهاجرت ۰۶۴):
--    خروج ثبت می‌شود، ورود نه.
--
-- ⚠️ چرا سرمایهٔ اولیه و نه صندوق؟
--
--    موجودیِ seed پول نداده — کالایی است که صاحبِ کسب‌وکار با آن
--    شروع کرده.  بستانکار کردنِ صندوق یعنی ادعای پرداختی که رخ نداده
--    و ماندهٔ صندوق را غلط می‌کند.  «آورده» به سرمایه می‌نشیند؛ همان
--    کاری که حسابدار در افتتاحِ دفتر می‌کند.
--
-- ⚠️ مبلغ از **خودِ موجودی** حساب می‌شود، نه از حدس.
--
--    `quantity × COALESCE(avgCost, purchasePrice)` — همان فرمولی که
--    گزارشِ ارزشِ موجودی به‌کار می‌برد.  اگر عددِ دیگری می‌گذاشتیم،
--    ترازنامه با گزارشِ انبار نمی‌خواند.

DO $$
DECLARE
  c        record;
  entry_id text;
  acc_inv  text;
  acc_cap  text;
  fy       text;
  total    numeric;
  n        int := 0;
BEGIN
  FOR c IN SELECT id FROM "Company" LOOP

    -- ⚠️ فقط شرکتی که هنوز سندِ افتتاحیه ندارد.
    --    اجرای دوباره چیزی اضافه نمی‌کند.
    IF EXISTS (
      SELECT 1 FROM "JournalEntry"
       WHERE "companyId" = c.id AND "sourceType" = 'OpeningInventory'
    ) THEN
      CONTINUE;
    END IF;

    SELECT id INTO acc_inv FROM "Account"
      WHERE "companyId" = c.id AND code = '1104' LIMIT 1;
    SELECT id INTO acc_cap FROM "Account"
      WHERE "companyId" = c.id AND code = '3101' LIMIT 1;

    -- ⚠️ سالِ مالیِ جاری.  اگر نباشد، سند صادر نمی‌شود — سندِ
    --    بی‌سالِ مالی در بستنِ دوره گم می‌شود.
    SELECT id INTO fy FROM "FiscalYear"
      WHERE "companyId" = c.id AND CURRENT_DATE BETWEEN "startsOn" AND "endsOn"
      LIMIT 1;

    IF acc_inv IS NULL OR acc_cap IS NULL OR fy IS NULL THEN
      CONTINUE;
    END IF;

    -- ⚠️ فقط تفاوتِ آنچه دفتر می‌گوید با آنچه انبار دارد.
    --
    --    نوشتنِ کلِ ارزشِ موجودی، خریدهایی را که **درست** سند خورده‌اند
    --    دو بار می‌شمرد.  چیزی که کم است، همان شکافِ بین دو عدد است.
    SELECT
      COALESCE((
        SELECT sum(i.quantity * COALESCE(i."avgCost", p."purchasePrice", 0))
          FROM "Inventory" i
          JOIN "Product"   p ON p.id = i."productId"
          JOIN "Warehouse" w ON w.id = i."warehouseId"
         WHERE w."companyId" = c.id AND i.quantity > 0
      ), 0)
      -
      COALESCE((
        SELECT sum(l.debit) - sum(l.credit)
          FROM "JournalLine"  l
          JOIN "JournalEntry" e ON e.id = l."entryId"
          JOIN "Account"      a ON a.id = l."accountId"
         WHERE e."companyId" = c.id AND a.code = '1104'
           AND e.status <> 'REVERSED'
      ), 0)
    INTO total;

    -- شکافِ صفر یا منفی سند نمی‌خواهد.  منفی یعنی دفتر بیش از انبار
    -- می‌گوید — مسئلهٔ دیگری است که سندِ افتتاحیه حلش نمی‌کند.
    IF total IS NULL OR total <= 0 THEN
      CONTINUE;
    END IF;

    entry_id := replace(gen_random_uuid()::text, '-', '');

    INSERT INTO "JournalEntry"
      (id, "companyId", "fiscalYearId", "entryNo", "entryDate", description,
       "sourceType", "sourceId", status)
    VALUES (
      entry_id, c.id, fy,
      'JE-OI-' || substr(entry_id, 1, 10),
      CURRENT_DATE,
      'افتتاحیهٔ موجودی کالا',
      'OpeningInventory',
      c.id,
      'POSTED'
    );

    INSERT INTO "JournalLine"
      (id, "entryId", "accountId", "lineNo", debit, credit, description)
    VALUES
      (replace(gen_random_uuid()::text, '-', ''), entry_id, acc_inv, 1,
       total, 0, 'موجودی اولیهٔ کالا'),
      (replace(gen_random_uuid()::text, '-', ''), entry_id, acc_cap, 2,
       0, total, 'آوردهٔ اولیه');

    n := n + 1;
  END LOOP;

  RAISE NOTICE 'سندِ افتتاحیهٔ ساخته‌شده: %', n;
END $$;

-- =============================================
-- فاکتور فروش: مالیات ردیفی و سریال
--
-- تا امروز مالیات فقط در سطح فاکتور بود.  برای فروشگاهی که هم کالای
-- مشمول دارد و هم معاف (مواد غذایی خام معاف است، بسته‌بندی نیست)، یک
-- نرخ برای کل فاکتور یعنی مبلغ مالیات همیشه غلط است — و صورتحساب
-- ارسالی به سامانهٔ مؤدیان با فاکتور نمی‌خواند.
-- =============================================

-- ---------- ۱) مالیات ردیف ----------
--
-- هم نرخ و هم مبلغ نگه داشته می‌شود.
--
-- چرا هر دو: نرخ کالا فردا عوض می‌شود، ولی فاکتور دیروز باید همان
-- مبلغی را نشان دهد که مشتری پرداخته.  نگه‌داشتن فقط نرخ یعنی گزارش
-- گذشته با تغییر نرخ عوض می‌شود.
ALTER TABLE "SaleItem" ADD COLUMN IF NOT EXISTS "taxRate"   NUMERIC(5,2)  NOT NULL DEFAULT 0;
ALTER TABLE "SaleItem" ADD COLUMN IF NOT EXISTS "taxAmount" NUMERIC(14,2) NOT NULL DEFAULT 0;

DO $$
BEGIN
  ALTER TABLE "SaleItem" ADD CONSTRAINT "sale_item_tax_sane"
    CHECK ("taxRate" >= 0 AND "taxRate" <= 100 AND "taxAmount" >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------- ۲) سریال ردیف ----------
--
-- جدول `SerialNumber` برای ردیابی گارانتی هست، ولی فروشندهٔ لوازم
-- خانگی سریال را همان لحظهٔ صدور فاکتور روی ردیف می‌نویسد و انتظار
-- دارد در چاپ فاکتور بیاید.  متن آزاد است چون گاهی چند سریال در یک
-- ردیف است.
ALTER TABLE "SaleItem" ADD COLUMN IF NOT EXISTS "serial" TEXT;

-- ---------- ۳) تاریخ فاکتور ----------
--
-- تا امروز فقط `createdAt` بود، یعنی لحظهٔ ثبت در سامانه.  فاکتوری که
-- امروز برای فروشِ دیروز ثبت می‌شود باید تاریخ دیروز را داشته باشد،
-- وگرنه گزارش فروش روزانه و سند حسابداری روی روز اشتباه می‌نشیند.
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "invoiceDate" DATE;

-- فاکتورهای موجود: همان روز ثبتشان.
UPDATE "Sale" SET "invoiceDate" = "createdAt"::date WHERE "invoiceDate" IS NULL;

CREATE INDEX IF NOT EXISTS "sale_invoice_date_idx"
  ON "Sale" ("companyId", "invoiceDate" DESC);

-- ---------- ۴) پورسانت ثبت‌شدهٔ فاکتور ----------
--
-- نرخ پورسانت ویزیتور در `SalesAgent` است و فردا عوض می‌شود.  مبلغی که
-- روی این فاکتور به او تعلق گرفته باید همین‌جا بماند — وگرنه تسویهٔ
-- ماه گذشته با تغییر نرخ امروز به هم می‌ریزد.
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "agentCommission" NUMERIC(14,2) NOT NULL DEFAULT 0;

DO $$
BEGIN
  ALTER TABLE "Sale" ADD CONSTRAINT "sale_commission_non_negative"
    CHECK ("agentCommission" >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- واحد پول
--
-- تا اینجا همهٔ مبالغ بدون واحد بودند و رابط کاربری فرض می‌کرد ریال است.
-- این migration واحد پول را صریح می‌کند تا سامانه در بازارهای دیگر هم
-- قابل استفاده باشد.
--
-- تصمیم مهم: مبالغ همچنان در NUMERIC(18,2) ذخیره می‌شوند و **تبدیل ارز انجام
-- نمی‌شود**.  هر شرکت یک واحد پول دارد و همهٔ مبالغش با همان واحد است.  حسابداری
-- چندارزی نیاز به نرخ تبدیل در لحظهٔ هر تراکنش و سود/زیان تسعیر دارد که دامنهٔ
-- جداگانه‌ای است؛ نیم‌بند پیاده کردنش بدتر از نداشتنش است.

ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "currency" TEXT NOT NULL DEFAULT 'IRR';

ALTER TABLE "Company" DROP CONSTRAINT IF EXISTS "Company_currency_check";
ALTER TABLE "Company" ADD CONSTRAINT "Company_currency_check"
  CHECK ("currency" IN ('IRR', 'IRT', 'AED', 'USD', 'EUR', 'TRY'));

-- تعداد رقم اعشار نمایش.  ریال و تومان در عمل بدون اعشار نمایش داده می‌شوند،
-- ارزهای دیگر با دو رقم.  ذخیره‌سازی همیشه دو رقمی است؛ این فقط نمایش است.
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS
  "currencyDecimals" SMALLINT NOT NULL DEFAULT 0;

ALTER TABLE "Company" DROP CONSTRAINT IF EXISTS "Company_currencyDecimals_check";
ALTER TABLE "Company" ADD CONSTRAINT "Company_currencyDecimals_check"
  CHECK ("currencyDecimals" BETWEEN 0 AND 4);

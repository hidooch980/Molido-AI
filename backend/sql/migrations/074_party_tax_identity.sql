-- هویتِ مالیاتیِ طرفِ معامله — پیش‌نیازِ گزارش فصلی (ماده ۱۶۹ مکرر).
--
-- ⚠️ «مشتری نامش را دارم» با «می‌توانم معامله‌اش را گزارش کنم» یکی نیست.
--
--    گزارش فصلی برای هر طرفِ معامله شناسه می‌خواهد: شمارهٔ ملی برای
--    شخصِ حقیقی، شناسهٔ ملی برای حقوقی، به‌همراه کد اقتصادی و کد پستی.
--    `Customer` فقط `nationalCode` داشت و `Supplier` **هیچ‌کدام** را.
--
--    یعنی تا امروز هیچ نصبی نمی‌توانست گزارشِ فصلی بدهد — و این نه خطا
--    می‌داد نه جایی دیده می‌شد، چون گزارشی وجود نداشت که کم‌بودنش را
--    نشان دهد.
--
-- ⚠️ همه‌چیز nullable است، عمداً.
--
--    خرده‌فروشیِ سوپرمارکت طرفِ شناسایی‌شده ندارد و قرار هم نیست داشته
--    باشد — تجمیعی گزارش می‌شود.  اجباری کردنِ این ستون‌ها یعنی صندوق
--    برای فروشِ پنجاه‌هزارتومانی شمارهٔ ملی بخواهد.

-- ---------- ۱) مشتری ----------
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "personType"   TEXT;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "economicCode" TEXT;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "postalCode"   TEXT;

-- ---------- ۲) تأمین‌کننده ----------
--
-- ⚠️ نامِ ستون عمداً همان `nationalCode`ِ مشتری است.
--    گزارش فصلی هر دو سو را یک‌جور می‌خواند؛ دو نامِ متفاوت یعنی هر
--    پرس‌وجو باید بداند با کدام طرف حرف می‌زند.
ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "nationalCode" TEXT;
ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "personType"   TEXT;
ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "economicCode" TEXT;
ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "postalCode"   TEXT;

-- ---------- ۳) قیدها ----------
--
-- ⚠️ `REAL`/`LEGAL`/`FOREIGN` — سه نوعی که سازمان می‌شناسد.
--    NULL یعنی «هنوز مشخص نشده»، که برای خرده‌فروشی حالتِ عادی است.
DO $$
BEGIN
  ALTER TABLE "Customer" DROP CONSTRAINT IF EXISTS "Customer_personType_check";
  ALTER TABLE "Customer" ADD CONSTRAINT "Customer_personType_check"
    CHECK ("personType" IS NULL OR "personType" IN ('REAL', 'LEGAL', 'FOREIGN'));

  ALTER TABLE "Supplier" DROP CONSTRAINT IF EXISTS "Supplier_personType_check";
  ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_personType_check"
    CHECK ("personType" IS NULL OR "personType" IN ('REAL', 'LEGAL', 'FOREIGN'));
END $$;

-- ⚠️ طولِ شناسه سنجیده می‌شود، ولی فقط وقتی مقدار داده شده.
--
--    شمارهٔ ملیِ حقیقی ۱۰ رقم و شناسهٔ ملیِ حقوقی ۱۱ رقم است.  قیدِ
--    نوع‌به‌نوع ننوشتم چون شخصِ حقوقیِ ثبت‌نشده هم وجود دارد؛ فقط
--    «رقم باشد و طولش یکی از این دو» سنجیده می‌شود.

-- اول فاصله‌های اضافی پاک شود — «۱۲۳۴۵۶۷۸۹۰ » شمارهٔ درستی است که
-- فقط بدجور ذخیره شده، و نباید به‌خاطرِ یک فاصله رد شود.
UPDATE "Customer" SET "nationalCode" = NULLIF(btrim("nationalCode"), '')
 WHERE "nationalCode" IS DISTINCT FROM NULLIF(btrim("nationalCode"), '');
UPDATE "Supplier" SET "nationalCode" = NULLIF(btrim("nationalCode"), '')
 WHERE "nationalCode" IS DISTINCT FROM NULLIF(btrim("nationalCode"), '');

-- ⚠️ `NOT VALID` عمدی است، و بی‌دقتی نیست.
--
--    این دو نصبی که می‌بینم هیچ `nationalCode`ای ندارند — سنجیده شد،
--    صفر سطر.  ولی مهاجرت روی نصب‌هایی هم اجرا می‌شود که نمی‌بینم.
--    قیدِ معمولی آن‌جا کلِ استقرار را با خطای مبهمِ «check constraint
--    violated» می‌خواباند، وسطِ به‌روزرسانی.
--
--    `NOT VALID` نوشتنِ **تازه** را می‌بندد و دادهٔ قدیمی را دست‌نخورده
--    می‌گذارد.  گزارش فصلی خودش طرف‌های بی‌شناسه را جدا نشان می‌دهد،
--    پس داده‌ی بد پنهان نمی‌ماند — فقط استقرار را نمی‌کُشد.
--
--    برای اعتبارسنجیِ کامل، هر وقت داده پاک شد:
--      ALTER TABLE "Customer" VALIDATE CONSTRAINT "Customer_nationalCode_shape";
DO $$
BEGIN
  ALTER TABLE "Customer" DROP CONSTRAINT IF EXISTS "Customer_nationalCode_shape";
  ALTER TABLE "Customer" ADD CONSTRAINT "Customer_nationalCode_shape"
    CHECK ("nationalCode" IS NULL OR "nationalCode" ~ '^[0-9]{10,11}$') NOT VALID;

  ALTER TABLE "Supplier" DROP CONSTRAINT IF EXISTS "Supplier_nationalCode_shape";
  ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_nationalCode_shape"
    CHECK ("nationalCode" IS NULL OR "nationalCode" ~ '^[0-9]{10,11}$') NOT VALID;
END $$;

-- ---------- ۴) نمایه ----------
--
-- گزارش فصلی طرفِ معامله را از روی شناسه گروه می‌کند، نه نام.
CREATE INDEX IF NOT EXISTS "Customer_nationalCode_idx"
  ON "Customer" ("companyId", "nationalCode") WHERE "nationalCode" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "Supplier_nationalCode_idx"
  ON "Supplier" ("companyId", "nationalCode") WHERE "nationalCode" IS NOT NULL;

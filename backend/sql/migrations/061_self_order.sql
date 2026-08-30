-- منوی دیجیتال و سفارشِ از سرِ میز.
--
-- ⚠️ توکنِ QR **حدس‌ناپذیر** است، نه شمارهٔ میز.
--
--    وسوسه این است که نشانی `/menu/12` باشد.  ولی آن‌وقت هر کسی از
--    هر کجای دنیا می‌تواند برای «میز ۱۲» سفارش بفرستد — بی‌آنکه
--    پایش را در رستوران گذاشته باشد.  آشپزخانه غذا می‌پزد، میز خالی
--    است، و هیچ‌کس نمی‌فهمد سفارش از کجا آمد.
--
--    با توکنِ تصادفی، کمینهٔ اعتماد این است: «کسی که فیزیکاً کنارِ
--    این میز نشسته».  بیش از این برای QR ممکن نیست، و کمتر از این
--    یعنی مسیرِ باز.
--
-- ⚠️ یکتاییِ توکن **سراسری** است، نه درون‌شرکتی.
--
--    مشتری توکن را می‌آورد و ما هنوز نمی‌دانیم مالِ کدام شرکت است —
--    شرکت را از روی خودِ توکن پیدا می‌کنیم.  همان استدلالِ
--    `SitePurchase.trackingCode` و ورود با ایمیل.  اگر درون‌شرکتی
--    بود، دو رستوران می‌توانستند توکنِ یکسان بدهند و سفارش به
--    آشپزخانهٔ اشتباه می‌رفت.

ALTER TABLE "RestaurantTable"
  ADD COLUMN IF NOT EXISTS "qrToken" text;

-- توکن برای میزهای موجود ساخته می‌شود.  `gen_random_uuid` در pgcrypto
-- هست و در همهٔ نصب‌های ما فعال است.
UPDATE "RestaurantTable"
   SET "qrToken" = replace(gen_random_uuid()::text, '-', '')
 WHERE "qrToken" IS NULL;

-- ⚠️ پیش‌فرض روی **خودِ ستون**، نه فقط در کد.
--
--    نسخهٔ اول فقط میزهای موجود را پر کرد و `createTable` را عوض
--    نکرد.  نتیجه: هر میزی که از آن پس ساخته می‌شد توکن نداشت و
--    QR‌اش هرگز کار نمی‌کرد — بی‌آنکه چیزی خطا بدهد، چون ستون
--    NULL‌پذیر بود.  آزمون گرفتش.
--
--    گذاشتنِ پیش‌فرض در پایگاه‌داده یعنی هر مسیرِ درجی — سرویس،
--    مهاجرتِ داده، وارد کردنِ دسته‌ای، حتی INSERT دستی — خودبه‌خود
--    توکن می‌گیرد.  اتکا به یادِ برنامه‌نویس، همان چیزی است که این
--    اشکال را ساخت.
ALTER TABLE "RestaurantTable"
  ALTER COLUMN "qrToken" SET DEFAULT replace(gen_random_uuid()::text, '-', '');

ALTER TABLE "RestaurantTable"
  ALTER COLUMN "qrToken" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "RestaurantTable_qrToken_key"
  ON "RestaurantTable" ("qrToken");

-- ⚠️ منشأ سفارش ثبت می‌شود.
--
--    بدونش، سفارشی که مشتری خودش زده از سفارشی که گارسون زده قابل
--    تشخیص نیست.  و آن تفاوت مهم است: اولی اعتمادِ کمتری دارد و باید
--    بشود جداگانه شمرد، بررسی کرد، و در صورت سوءاستفاده بست.
ALTER TABLE "RestaurantOrder"
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'STAFF';

ALTER TABLE "RestaurantOrder"
  ADD COLUMN IF NOT EXISTS "guestPhone" text;

-- ⚠️ کدِ پیگیریِ مشتری — حدس‌ناپذیر، به همان دلیلِ توکنِ میز.
--
--    مشتری حساب ندارد و با همین کد وضعیتِ سفارشش را می‌بیند.  کدِ
--    ترتیبی یعنی هرکسی سفارشِ دیگران را می‌خواند.
ALTER TABLE "RestaurantOrder"
  ADD COLUMN IF NOT EXISTS "guestCode" text;

CREATE UNIQUE INDEX IF NOT EXISTS "RestaurantOrder_guestCode_key"
  ON "RestaurantOrder" ("guestCode") WHERE "guestCode" IS NOT NULL;

-- ─────────────────────────── تنظیمات ───────────────────────────
--
-- ⚠️ هر رستوران خودش تصمیم می‌گیرد، نه یک متغیرِ سراسری.
--
--    یکی می‌خواهد سفارشِ مشتری مستقیم به آشپزخانه برود، دیگری
--    می‌خواهد گارسون تأیید کند، سومی اصلاً نمی‌خواهد سفارش بگیرد و
--    فقط منو نشان می‌دهد.  متغیرِ محیطی یعنی همهٔ مستأجرها یک
--    سیاست داشته باشند.
CREATE TABLE IF NOT EXISTS "SelfOrderSetting" (
  "companyId"        text PRIMARY KEY REFERENCES "Company"(id) ON DELETE CASCADE,

  -- منو دیده شود؟  خاموشش یعنی QR هیچ‌کاری نمی‌کند.
  "menuEnabled"      boolean NOT NULL DEFAULT true,

  -- مشتری بتواند سفارش ثبت کند؟
  "orderEnabled"     boolean NOT NULL DEFAULT false,

  -- ⚠️ پیش‌فرض **تأییدِ گارسون**.
  --
  --    سفارشی که مستقیم به آشپزخانه می‌رود، یعنی یک شوخیِ ساده
  --    آشپزخانه را مشغول می‌کند و مواد اولیه هدر می‌رود.  رستوران
  --    می‌تواند بازش کند، ولی باید آگاهانه.
  "requireApproval"  boolean NOT NULL DEFAULT true,

  -- پرداختِ آنلاین پیش از ارسال به آشپزخانه لازم است؟
  "requirePrepay"    boolean NOT NULL DEFAULT false,

  "servicePercent"   numeric NOT NULL DEFAULT 0 CHECK ("servicePercent" >= 0),
  "taxPercent"       numeric NOT NULL DEFAULT 0 CHECK ("taxPercent" >= 0),

  -- سقفِ مبلغِ یک سفارشِ خودگردان.  صفر یعنی بی‌سقف.
  --
  -- ⚠️ سقف، نه برای درآمد که برای **مهار خسارت**: اگر روزی کسی توکنی
  --    را به‌دست آورد، بیشترین کاری که می‌تواند بکند محدود است.
  "maxOrderAmount"   numeric NOT NULL DEFAULT 0 CHECK ("maxOrderAmount" >= 0),

  "welcomeText"      text,
  "createdAt"        timestamptz NOT NULL DEFAULT now(),
  "updatedAt"        timestamptz NOT NULL DEFAULT now()
);

-- ⚠️ RLS در همین مهاجرت — چهارمین بار که این یادداشت نوشته می‌شود.
ALTER TABLE "SelfOrderSetting" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SelfOrderSetting" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS company_isolation ON "SelfOrderSetting";
CREATE POLICY company_isolation ON "SelfOrderSetting"
  FOR ALL TO molido_app
  USING ("companyId" = current_setting('app.company_id', true))
  WITH CHECK ("companyId" = current_setting('app.company_id', true));

GRANT SELECT, INSERT, UPDATE, DELETE ON "SelfOrderSetting" TO molido_app;

-- ─────────────────── روزنه‌های عمومی ───────────────────
--
-- ⚠️ مشتری توکن را می‌آورد و ما هنوز نمی‌دانیم مالِ کدام شرکت است.
--
--    RLS بسته-به-پیش‌فرض است، پس بدونِ `app.company_id` هیچ سطری خوانده
--    نمی‌شود — حتی برای پیدا کردنِ شرکت.  مرغ و تخم‌مرغ.
--
--    الگوی حل‌شده در `complaint_public_track` و `purchase_public_track`
--    همین‌جا هم به‌کار می‌رود: سیاستی که **فقط SELECT** است و **فقط**
--    سطری را باز می‌کند که رازش دقیقاً برابر باشد.
--
--    `app.track_code` همان متغیرِ موجود است و معنایش دقیقاً همین است:
--    «رازی عمومی که یک سطر را باز می‌کند».  ساختنِ متغیرِ تازه یعنی
--    جایی که باید همیشه نوشته شود و یک بار فراموشش، سطرِ درخواستِ
--    قبلی را روی اتصالِ اشتراکی نشت می‌داد — دامی که یک بار افتاد.

DROP POLICY IF EXISTS table_qr_lookup ON "RestaurantTable";
CREATE POLICY table_qr_lookup ON "RestaurantTable"
  FOR SELECT TO molido_app
  USING ("qrToken" = NULLIF(current_setting('app.track_code', true), ''));

-- ⚠️ `FOR SELECT` و نه `FOR ALL`.
--
--    با `FOR ALL`، مشتری می‌توانست وضعیتِ میز را خودش عوض کند یا
--    سفارشش را «پرداخت‌شده» علامت بزند.
DROP POLICY IF EXISTS order_guest_track ON "RestaurantOrder";
CREATE POLICY order_guest_track ON "RestaurantOrder"
  FOR SELECT TO molido_app
  USING ("guestCode" = NULLIF(current_setting('app.track_code', true), ''));

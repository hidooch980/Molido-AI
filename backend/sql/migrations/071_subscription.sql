-- اشتراک — تا بشود نرم‌افزار را **فروخت**، نه فقط نصب کرد.
--
-- ⚠️ تا امروز هیچ‌چیز نمی‌دانست چه کسی پول داده.
--
--    ۱۰۶ جدول `companyId` دارند و RLS داده‌ها را جدا می‌کند، پس
--    چندمستأجری از روزِ اول درست بود.  ولی هیچ‌جا ثبت نمی‌شد که این
--    شرکت مشترک است یا نه، اشتراکش کی تمام می‌شود، و چند کاربر
--    می‌تواند بسازد.
--
-- ⚠️ [به‌روزرسانی — مهاجرت ۰۷۳] این یادداشت دیگر درست نیست.
--
--    ۰۷۳ روی همین جدول RLS گذاشت، با سیاستِ `vendor_read_all` برای
--    فروشنده.  یادداشتِ زیر تاریخِ تصمیمِ اولیه است و عمداً مانده، ولی
--    اگر کسی امروز رویش حساب کند، پرس‌وجویش بی‌صدا صفر سطر می‌گیرد —
--    که دو بار اتفاق افتاد و هر دو بار ساعت‌ها طول کشید تا دیده شود.
--
-- ⚠️ [تاریخی] این جدول **بین‌شرکتی** است و RLS ندارد — عمداً.
--
--    اگر با `app.company_id` فیلتر می‌شد، فروشنده نمی‌توانست فهرستِ
--    مشتریانش را ببیند: هر پرس‌وجو فقط شرکتِ خودش را برمی‌گرداند.
--
--    محافظتش در لایهٔ سرویس است: فقط `SUPER_ADMIN` می‌خواندش، و
--    شرکت فقط اشتراکِ **خودش** را می‌بیند.

CREATE TABLE IF NOT EXISTS "Subscription" (
  id          text PRIMARY KEY,

  -- ⚠️ یکتا: هر شرکت یک اشتراک، نه بیشتر.
  --
  --    دو ردیفِ فعال برای یک شرکت یعنی «کدام معتبر است؟» — سؤالی که
  --    جوابِ قطعی ندارد و در لحظهٔ قطعِ سرویس پرسیده می‌شود.
  "companyId" text NOT NULL UNIQUE REFERENCES "Company"(id) ON DELETE CASCADE,

  -- TRIAL | BASIC | PRO | ENTERPRISE
  plan        text NOT NULL DEFAULT 'TRIAL',

  -- ACTIVE | EXPIRED | SUSPENDED
  --
  -- ⚠️ SUSPENDED با EXPIRED فرق دارد: اولی تصمیمِ فروشنده است
  --    (بدهی، تخلف) و دومی گذشتِ زمان.  یکی کردنشان یعنی نشود
  --    فهمید چرا سرویس قطع شده.
  status      text NOT NULL DEFAULT 'ACTIVE',

  "startsOn"  date NOT NULL DEFAULT CURRENT_DATE,

  -- ⚠️ `NULL` یعنی **بی‌پایان** — برای نصبِ اختصاصی که یک‌بار فروخته
  --    می‌شود.  تاریخِ دور گذاشتن (۲۰۹۹) کار می‌کند ولی دروغ است و
  --    روزی کسی رویش گزارش می‌گیرد.
  "endsOn"    date,

  -- ⚠️ سقف‌ها `NULL` یعنی بی‌حد، نه صفر.
  --
  --    صفر یعنی «هیچ کاربری مجاز نیست» و شرکت را قفل می‌کند.  تفاوتِ
  --    «حد ندارد» و «حدش صفر است» دقیقاً همان چیزی است که در لحظهٔ
  --    اشتباه، سرویسِ مشتری را می‌خواباند.
  "maxUsers"    integer,
  "maxBranches" integer,

  -- محصولی که فروخته شده: store | resto | suite
  product     text,

  note        text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT "Subscription_plan_check"
    CHECK (plan IN ('TRIAL', 'BASIC', 'PRO', 'ENTERPRISE')),
  CONSTRAINT "Subscription_status_check"
    CHECK (status IN ('ACTIVE', 'EXPIRED', 'SUSPENDED')),
  CONSTRAINT "Subscription_dates_check"
    CHECK ("endsOn" IS NULL OR "endsOn" >= "startsOn"),
  CONSTRAINT "Subscription_limits_check"
    CHECK (("maxUsers" IS NULL OR "maxUsers" > 0)
       AND ("maxBranches" IS NULL OR "maxBranches" > 0))
);

CREATE INDEX IF NOT EXISTS "Subscription_status_idx"  ON "Subscription" (status);
CREATE INDEX IF NOT EXISTS "Subscription_endsOn_idx"  ON "Subscription" ("endsOn");

-- ⚠️ شرکت‌های موجود اشتراکِ **بی‌پایان** می‌گیرند.
--
--    اگر پیش‌فرض «آزمایشی ۱۴ روزه» بود، همان لحظهٔ اجرای مهاجرت
--    ساعتِ شمارشِ معکوسِ مشتریانِ فعلی شروع می‌شد و دو هفته بعد
--    سرویسشان قطع می‌شد — بدونِ اینکه کسی چیزی فروخته باشد.
--
--    قاعده: مهاجرت نباید رفتارِ موجود را عوض کند.  فروشنده بعداً
--    آگاهانه پلن می‌دهد.
INSERT INTO "Subscription" (id, "companyId", plan, status, "endsOn", note)
SELECT 'sub-' || c.id, c.id, 'ENTERPRISE', 'ACTIVE', NULL,
       'ساخته‌شده در مهاجرت ۰۷۱ — نصبِ پیش از سامانهٔ اشتراک'
  FROM "Company" c
 WHERE NOT EXISTS (SELECT 1 FROM "Subscription" s WHERE s."companyId" = c.id);

GRANT SELECT, INSERT, UPDATE ON "Subscription" TO molido_app;

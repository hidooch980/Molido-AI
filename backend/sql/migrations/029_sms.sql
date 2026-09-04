-- =============================================
-- پیامک: تاریخچه، انصراف مشتری، و قالب
--
-- سرویس ارسال از قبل بود، ولی هیچ ردی از آنچه فرستاده شده نمی‌ماند.
-- برای فروشگاهی که پیامک تبلیغاتی می‌فرستد این سه چیز لازم است:
--
--   ۱. تاریخچه — «به چه کسی چه فرستادیم و چقدر خرج شد» را باید بشود
--      جواب داد؛ هم برای شکایت مشتری، هم برای اینکه معلوم شود کدام
--      کارزار جواب داده.
--   ۲. انصراف — مشتری باید بتواند بگوید «دیگر نفرست».  فرستادن پس از
--      انصراف، هم شکایت می‌آورد و هم سرشمارهٔ فروشگاه را می‌سوزاند.
--   ۳. جلوگیری از ارسال تکراری — یک کلیک دوباره روی «ارسال» نباید
--      همان پیام را دو بار بفرستد.
-- =============================================

-- ---------- ۱) انصراف مشتری ----------
--
-- روی خودِ مشتری، نه جدول جدا: پرسش همیشه «آیا به این شماره بفرستم؟»
-- است و پاسخش باید در همان کوئری‌ای باشد که مخاطبان را می‌چیند.
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "smsOptOut" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "smsOptOutAt" TIMESTAMPTZ;

-- ---------- ۲) تاریخچهٔ پیامک ----------
CREATE TABLE IF NOT EXISTS "SmsMessage" (
  id            TEXT PRIMARY KEY,
  "companyId"   TEXT NOT NULL REFERENCES "Company"(id) ON DELETE CASCADE,

  -- شماره جدا از مشتری نگه داشته می‌شود: پیامک ممکن است به شماره‌ای
  -- برود که هنوز مشتری نیست، و اگر بعداً مشتری حذف شود، تاریخچه نباید
  -- گم شود.
  phone         TEXT NOT NULL,
  "customerId"  TEXT REFERENCES "Customer"(id) ON DELETE SET NULL,

  body          TEXT NOT NULL,

  -- QUEUED → SENT | FAILED | SKIPPED
  -- SKIPPED یعنی عمداً نفرستادیم (انصراف، شمارهٔ نامعتبر، تکراری).
  -- جدا از FAILED است چون هیچ‌کدام خطای سامانه نیستند و نباید در
  -- گزارش خطا بیایند.
  status        TEXT NOT NULL DEFAULT 'QUEUED'
                CHECK (status IN ('QUEUED', 'SENT', 'FAILED', 'SKIPPED')),
  "skipReason"  TEXT,
  error         TEXT,

  -- شناسهٔ پیام نزد اپراتور، برای پیگیری وضعیت تحویل
  "providerId"  TEXT,
  -- هزینه به ریال، همان‌طور که اپراتور برمی‌گرداند
  cost          NUMERIC(12,2),

  -- منبع: CAMPAIGN | ORDER | MANUAL | SYSTEM
  kind          TEXT NOT NULL DEFAULT 'MANUAL',
  "campaignId"  TEXT,

  -- کلید یکتاسازی: دو ارسال با همین کلید، یکی حساب می‌شود.
  "dedupeKey"   TEXT,

  "sentAt"      TIMESTAMPTZ,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- جلوگیری از ارسال تکراری در سطح دیتابیس، نه در کد.
--
-- کلیکِ دوبارهٔ کاربر یا اجرای دوبارهٔ یک کارزار نباید پیام را دو بار
-- بفرستد.  شرط `IS NOT NULL` چون ارسال دستی کلید ندارد و نباید محدود
-- شود.
CREATE UNIQUE INDEX IF NOT EXISTS "SmsMessage_dedupe_key"
  ON "SmsMessage" ("companyId", "dedupeKey")
  WHERE "dedupeKey" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "SmsMessage_company_created_idx"
  ON "SmsMessage" ("companyId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "SmsMessage_phone_idx"
  ON "SmsMessage" ("companyId", phone);

-- ---------- ۳) قالب پیام ----------
--
-- متن پیامک تبلیغاتی را فروشنده می‌نویسد، نه برنامه‌نویس.  بدون قالب،
-- هر بار باید متن کامل تایپ شود و اشتباه تایپی مستقیم به هزار مشتری
-- می‌رود.
CREATE TABLE IF NOT EXISTS "SmsTemplate" (
  id            TEXT PRIMARY KEY,
  "companyId"   TEXT NOT NULL REFERENCES "Company"(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  body          TEXT NOT NULL,
  "isActive"    BOOLEAN NOT NULL DEFAULT true,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "SmsTemplate_name_key"
  ON "SmsTemplate" ("companyId", name);

-- ---------- ۴) RLS ----------
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['SmsMessage', 'SmsTemplate'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    BEGIN
      EXECUTE format(
        'CREATE POLICY company_isolation ON %I USING ("companyId" = current_setting(''app.company_id'', true))',
        t);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO molido_app', t);
  END LOOP;
END $$;

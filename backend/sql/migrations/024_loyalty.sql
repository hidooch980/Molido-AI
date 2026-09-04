-- =============================================
-- باشگاه مشتریان: کد شخصی، کارزار، و شناسایی با QR
--
-- مدل سه‌تکه است چون این سه چیز واقعاً جدا هستند:
--   قاعدهٔ تخفیف = پیشنهاد («۲۰٪ روی خرید بالای ۵۰۰ هزار»)
--   کد          = بلیتِ صادرشده برای یک مشتری مشخص
--   کارزار      = یک ارسال به یک بخش از مشتریان
--
-- اگر کد را روی خود قاعده نگه می‌داشتیم، «کد شخصی برای هر مشتری» یعنی
-- یک قاعده به‌ازای هر مشتری — جدولی که با هزار مشتری هزار سطر پیشنهاد
-- تکراری دارد و هیچ گزارشی از آن درنمی‌آید.
-- =============================================

-- ---------- ۱) قاعده‌ای که فقط با کد باز می‌شود ----------
-- کد ثابت روی قاعده برای کد عمومی است (NOWRUZ).  کارزارها کد ثابت
-- ندارند: کدشان شخصی است، پس قاعده باید بتواند بگوید «قفل هستم» بی‌آنکه
-- کدی داشته باشد.
ALTER TABLE "DiscountRule"
  ADD COLUMN IF NOT EXISTS "requiresCode" BOOLEAN NOT NULL DEFAULT false;

-- ---------- ۲) کارزار ----------
CREATE TABLE IF NOT EXISTS "DiscountCampaign" (
  id            TEXT PRIMARY KEY,
  "companyId"   TEXT NOT NULL REFERENCES "Company"(id) ON DELETE CASCADE,
  "ruleId"      TEXT NOT NULL REFERENCES "DiscountRule"(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  -- بخش هدف در لحظهٔ ساخت حل می‌شود و در کدها ثبت می‌ماند؛ نگه داشتنش
  -- اینجا فقط برای این است که بعداً معلوم باشد چه کسی هدف بوده.
  segment       TEXT NOT NULL,
  "messageTemplate" TEXT NOT NULL,
  channel       TEXT NOT NULL DEFAULT 'SMS',
  "expiresAt"   TIMESTAMPTZ,
  "sentCount"   INTEGER NOT NULL DEFAULT 0,
  "failedCount" INTEGER NOT NULL DEFAULT 0,
  "createdBy"   TEXT,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  ALTER TABLE "DiscountCampaign" ADD CONSTRAINT "DiscountCampaign_channel_chk"
    CHECK (channel IN ('SMS', 'APP'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "DiscountCampaign_company_idx"
  ON "DiscountCampaign" ("companyId", "createdAt" DESC);

-- ---------- ۳) کد صادرشده ----------
CREATE TABLE IF NOT EXISTS "DiscountCode" (
  id            TEXT PRIMARY KEY,
  "companyId"   TEXT NOT NULL REFERENCES "Company"(id) ON DELETE CASCADE,
  "ruleId"      TEXT NOT NULL REFERENCES "DiscountRule"(id) ON DELETE CASCADE,
  "campaignId"  TEXT REFERENCES "DiscountCampaign"(id) ON DELETE SET NULL,
  -- کد به مشتری گره می‌خورد تا در شبکه‌های اجتماعی پخش نشود.  NULL یعنی
  -- کد آزاد است (مثلاً کد چاپی روی بروشور).
  "customerId"  TEXT REFERENCES "Customer"(id) ON DELETE CASCADE,
  code          TEXT NOT NULL,
  "maxUses"     INTEGER NOT NULL DEFAULT 1,
  "usedCount"   INTEGER NOT NULL DEFAULT 0,
  "expiresAt"   TIMESTAMPTZ,
  "sentAt"      TIMESTAMPTZ,
  "sendError"   TEXT,
  "redeemedAt"  TIMESTAMPTZ,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- کد در هر شرکت یکتاست.  بدون این، دو کد یکسان یعنی انتخاب بینشان
-- تصادفی است و مشتری گاهی تخفیف می‌گیرد و گاهی نه.
CREATE UNIQUE INDEX IF NOT EXISTS "DiscountCode_company_code_key"
  ON "DiscountCode" ("companyId", upper(code));

CREATE INDEX IF NOT EXISTS "DiscountCode_customer_idx"
  ON "DiscountCode" ("customerId") WHERE "customerId" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "DiscountCode_campaign_idx"
  ON "DiscountCode" ("campaignId");

DO $$
BEGIN
  ALTER TABLE "DiscountCode" ADD CONSTRAINT "DiscountCode_uses_chk"
    CHECK ("usedCount" >= 0 AND "usedCount" <= "maxUses");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- یک کد فعال از هر کارزار برای هر مشتری.  دوباره‌فرستادن یک کارزار
-- نباید به یک نفر دو کد بدهد.
CREATE UNIQUE INDEX IF NOT EXISTS "DiscountCode_one_per_campaign"
  ON "DiscountCode" ("campaignId", "customerId")
  WHERE "campaignId" IS NOT NULL AND "customerId" IS NOT NULL;

-- ---------- ۴) مصرف کد در فاکتور ----------
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "discountCodeId" TEXT
  REFERENCES "DiscountCode"(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "Sale_discountcode_idx"
  ON "Sale" ("discountCodeId") WHERE "discountCodeId" IS NOT NULL;

-- ---------- ۵) شناسایی مشتری با QR ----------
-- مشتری در اپلیکیشن یک QR می‌بیند و صندوق‌دار آن را اسکن می‌کند؛ فاکتور
-- به حساب همان مشتری می‌خورد و امتیاز و کد شخصی‌اش اعمال می‌شود.
--
-- توکن **کوتاه‌عمر** است و یک‌بارمصرف: QR روی صفحهٔ موبایل با یک عکس
-- قابل تکثیر است، پس اگر همیشگی بود، هر کسی می‌توانست خرید را به حساب
-- دیگری بزند یا از تخفیف او استفاده کند.
CREATE TABLE IF NOT EXISTS "CustomerCheckin" (
  id           TEXT PRIMARY KEY,
  "companyId"  TEXT NOT NULL REFERENCES "Company"(id) ON DELETE CASCADE,
  "customerId" TEXT NOT NULL REFERENCES "Customer"(id) ON DELETE CASCADE,
  token        TEXT NOT NULL,
  "expiresAt"  TIMESTAMPTZ NOT NULL,
  "usedAt"     TIMESTAMPTZ,
  "saleId"     TEXT,
  "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "CustomerCheckin_token_key"
  ON "CustomerCheckin" (token);

-- توکن مصرف‌نشده و منقضی‌نشدهٔ هر مشتری برای پاک‌سازی دوره‌ای
CREATE INDEX IF NOT EXISTS "CustomerCheckin_customer_idx"
  ON "CustomerCheckin" ("customerId", "expiresAt" DESC);

-- ---------- ۶) RLS ----------
DO $$
DECLARE
  target TEXT;
BEGIN
  FOREACH target IN ARRAY ARRAY['DiscountCampaign', 'DiscountCode', 'CustomerCheckin']
  LOOP
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM pg_policies
       WHERE tablename = target AND policyname = 'company_isolation'
    );

    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', target);
    EXECUTE format($f$
      CREATE POLICY company_isolation ON %I
        FOR ALL TO molido_app
        USING ("companyId" = NULLIF(current_setting('app.company_id', true), ''))
        WITH CHECK ("companyId" = NULLIF(current_setting('app.company_id', true), ''))
    $f$, target);
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO molido_app;

-- =============================================
-- ارسال صورتحساب الکترونیکی به سامانهٔ مؤدیان
--
-- سه چیز اینجا نگه داشته می‌شود:
--   ۱. تنظیمات مؤدی (شناسهٔ حافظه، شناسهٔ اقتصادی، نشانی سامانه)
--   ۲. صف ارسال — هر فاکتور یک سطر، با وضعیت و تعداد تلاش
--   ۳. تاریخچهٔ پاسخ‌ها برای پیگیری و ممیزی
--
-- چرا صف و نه ارسال مستقیم:
--
-- ارسال به سامانهٔ بیرونی می‌تواند کند باشد، قطع شود، یا خطای موقت بدهد.
-- اگر ثبت فاکتور منتظر آن بماند، یک قطعی اینترنت صندوق فروشگاه را
-- می‌خواباند.  فاکتور ثبت می‌شود، ارسالش در صف می‌نشیند.
-- =============================================

-- ---------- ۱) تنظیمات مؤدی ----------
CREATE TABLE IF NOT EXISTS "TaxSetting" (
  "companyId"     TEXT PRIMARY KEY REFERENCES "Company"(id) ON DELETE CASCADE,
  -- شناسهٔ یکتای حافظهٔ مالیاتی — ۶ نویسه، از سازمان گرفته می‌شود
  "memoryId"      TEXT,
  -- شناسهٔ اقتصادی فروشنده
  "economicCode"  TEXT,
  "apiBaseUrl"    TEXT NOT NULL DEFAULT 'https://tp.tax.gov.ir',
  -- کلید خصوصی امضا.  در دیتابیس می‌ماند چون سرور باید بدون دخالت
  -- انسان امضا کند؛ دسترسی به این جدول باید محدود بماند.
  "privateKeyPem" TEXT,
  "clientId"      TEXT,
  -- شمارندهٔ داخلی صورتحساب — بخشی از شمارهٔ منحصربه‌فرد مالیاتی
  "serial"        BIGINT NOT NULL DEFAULT 0,
  "isEnabled"     BOOLEAN NOT NULL DEFAULT false,
  -- حالت آزمایشی: همه‌چیز ساخته و ثبت می‌شود ولی چیزی فرستاده نمی‌شود.
  -- برای راه‌اندازی لازم است، وگرنه اولین آزمون داده به سامانهٔ واقعی
  -- می‌فرستد و پس گرفتنش کار ساده‌ای نیست.
  "isSandbox"     BOOLEAN NOT NULL DEFAULT true,
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- ۲) صف ارسال ----------
CREATE TABLE IF NOT EXISTS "TaxInvoice" (
  id              TEXT PRIMARY KEY,
  "companyId"     TEXT NOT NULL REFERENCES "Company"(id) ON DELETE CASCADE,
  "saleId"        TEXT NOT NULL REFERENCES "Sale"(id) ON DELETE CASCADE,
  -- شمارهٔ منحصربه‌فرد مالیاتی؛ یک‌بار ساخته می‌شود و هرگز عوض نمی‌شود
  "taxId"         TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'QUEUED',
  "referenceNo"   TEXT,
  "attempts"      INTEGER NOT NULL DEFAULT 0,
  "lastError"     TEXT,
  payload         JSONB,
  "sentAt"        TIMESTAMPTZ,
  "confirmedAt"   TIMESTAMPTZ,
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"     TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  ALTER TABLE "TaxInvoice" ADD CONSTRAINT "TaxInvoice_status_chk"
    CHECK (status IN ('QUEUED', 'SENDING', 'SENT', 'CONFIRMED', 'REJECTED', 'FAILED'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- یک فاکتور، یک ارسال.  بدون این، یک کلیک دوباره همان صورتحساب را دو
-- بار به سازمان می‌فرستد و اصلاحش دردسر واقعی دارد.
CREATE UNIQUE INDEX IF NOT EXISTS "TaxInvoice_sale_key"
  ON "TaxInvoice" ("saleId");

-- شمارهٔ مالیاتی در سطح کشور یکتاست؛ در سطح شرکت هم باید یکتا بماند.
CREATE UNIQUE INDEX IF NOT EXISTS "TaxInvoice_taxid_key"
  ON "TaxInvoice" ("companyId", "taxId");

-- صف: کارگر ارسال با همین نمایه سطرهای در انتظار را برمی‌دارد.
CREATE INDEX IF NOT EXISTS "TaxInvoice_queue_idx"
  ON "TaxInvoice" ("companyId", status, "createdAt")
  WHERE status IN ('QUEUED', 'SENDING');

-- ---------- ۳) تاریخچهٔ پاسخ ----------
-- پاسخ‌ها نگه داشته می‌شوند نه فقط آخرین وضعیت: وقتی سازمان می‌گوید
-- «صورتحساب فلان رد شده»، باید بشود دید دقیقاً چه فرستاده شده و چه
-- برگشته.
CREATE TABLE IF NOT EXISTS "TaxInvoiceLog" (
  id             TEXT PRIMARY KEY,
  "companyId"    TEXT NOT NULL REFERENCES "Company"(id) ON DELETE CASCADE,
  "taxInvoiceId" TEXT NOT NULL REFERENCES "TaxInvoice"(id) ON DELETE CASCADE,
  action         TEXT NOT NULL,
  "httpStatus"   INTEGER,
  response       JSONB,
  "createdAt"    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "TaxInvoiceLog_invoice_idx"
  ON "TaxInvoiceLog" ("taxInvoiceId", "createdAt" DESC);

-- ---------- ۴) پیوند از فاکتور ----------
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "taxInvoiceId" TEXT;

-- ---------- ۵) RLS ----------
DO $$
DECLARE
  target TEXT;
BEGIN
  FOREACH target IN ARRAY ARRAY['TaxSetting', 'TaxInvoice', 'TaxInvoiceLog']
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

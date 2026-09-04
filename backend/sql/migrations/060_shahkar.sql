-- استعلامِ شاهکار: تطبیقِ شمارهٔ موبایل با کد ملی.
--
-- ⚠️ نتیجه ذخیره می‌شود، چون هر استعلام هزینه و سهمیه دارد.
--
--    بدونِ حافظه، ویرایشِ دوبارهٔ یک پروندهٔ کالابرگ همان استعلام را
--    دوباره می‌زند.  در روزِ توزیعِ سهمیه، همین یعنی سوختنِ سهمیهٔ
--    روزانه تا ظهر و از کار افتادنِ کلِ ثبت‌نام.
--
-- ⚠️ حافظه **درون‌شرکتی** است، هرچند خودِ واقعیت ملی است.
--
--    اینکه فلان شماره به نامِ فلان کد ملی است، دادهٔ هویتیِ شخص است.
--    اشتراکش بین شرکت‌ها یعنی شرکتِ الف می‌تواند بفهمد شرکتِ ب چه
--    کسانی را ثبت کرده.  چند استعلامِ تکراری، بهای درستی برای این است.
--
-- ⚠️ نتیجهٔ `UNKNOWN` ذخیره **نمی‌شود**.
--
--    قطعیِ سرویس واقعیتی دربارهٔ کاربر نیست.  ذخیره‌اش یعنی یک
--    اختلالِ گذرا برای همیشه در پرونده بماند و تلاشِ بعدی هم همان را
--    بخواند.  فقط پاسخِ قطعیِ سامانه ماندگار می‌شود.

CREATE TABLE IF NOT EXISTS "ShahkarVerification" (
  id             text PRIMARY KEY,
  "companyId"    text NOT NULL REFERENCES "Company"(id) ON DELETE CASCADE,

  "nationalCode" text NOT NULL,
  mobile         text NOT NULL,

  -- 'MATCHED' یا 'NOT_MATCHED' — حالتِ سوم اینجا نمی‌نشیند.
  outcome        text NOT NULL CHECK (outcome IN ('MATCHED', 'NOT_MATCHED')),

  -- شناسهٔ پیگیریِ ارائه‌دهنده؛ تنها چیزی که می‌شود با آن به او مراجعه کرد.
  reference      text,
  provider       text,

  "checkedAt"    timestamptz NOT NULL DEFAULT now(),
  "createdAt"    timestamptz NOT NULL DEFAULT now(),
  "updatedAt"    timestamptz NOT NULL DEFAULT now(),

  -- ⚠️ یکتاییِ **درون‌شرکتی**، نه سراسری.
  --    دو شرکت می‌توانند مستقلاً همان جفت را استعلام کنند.
  UNIQUE ("companyId", "nationalCode", mobile)
);

CREATE INDEX IF NOT EXISTS "ShahkarVerification_lookup_idx"
  ON "ShahkarVerification" ("companyId", "nationalCode");

-- ⚠️ RLS در **همین** مهاجرت.
--
--    سه بار پیش آمد که جدولِ تازه بدونِ سیاستِ جداسازی ساخته شد و
--    فقط آزمونِ `integration` گرفتش.  جدولی که کد ملی و موبایل نگه
--    می‌دارد، بدترین جدول برای تکرارِ آن اشتباه است.
ALTER TABLE "ShahkarVerification" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ShahkarVerification" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS company_isolation ON "ShahkarVerification";
CREATE POLICY company_isolation ON "ShahkarVerification"
  FOR ALL TO molido_app
  USING ("companyId" = current_setting('app.company_id', true))
  WITH CHECK ("companyId" = current_setting('app.company_id', true));

GRANT SELECT, INSERT, UPDATE, DELETE ON "ShahkarVerification" TO molido_app;

-- الگوی چاپ چک
--
-- ⚠️ مسئلهٔ چاپِ چک، «چه چیزی» نیست؛ «کجا» است.
--
--    برگهٔ چکِ هر بانک اندازه و چیدمانِ خودش را دارد.  متن همیشه یکی
--    است — تاریخ، مبلغ، در وجه، حروف — ولی جای فیزیکی‌شان روی کاغذ
--    چند میلی‌متر با هم فرق دارد، و چند میلی‌متر یعنی چاپ روی خط.
--
--    پس مختصات **داده** است نه کد: بانکِ تازه یعنی یک ردیف، نه یک
--    استقرار.

CREATE TABLE IF NOT EXISTS "ChequePrintTemplate" (
  id            TEXT PRIMARY KEY,
  "companyId"   TEXT NOT NULL REFERENCES "Company"(id) ON DELETE CASCADE,

  name          TEXT NOT NULL,
  "bankName"    TEXT,

  -- ابعادِ برگه به میلی‌متر.  چکِ صیادی ۱۷۵×۸۰ است، ولی ثابت نوشتنش
  -- یعنی هر بانکِ متفاوت کدِ تازه می‌خواهد.
  "widthMm"     NUMERIC(6,2) NOT NULL DEFAULT 175,
  "heightMm"    NUMERIC(6,2) NOT NULL DEFAULT 80,

  -- ⚠️ مختصاتِ میدان‌ها در JSONB.
  --
  --    شکل: { "date": {"x": 20, "y": 12, "size": 10}, ... }
  --    کلیدهای شناخته‌شده: date, amountDigits, amountWords, payee, note
  --
  --    ستونِ جدا برای هر میدان یعنی افزودنِ میدانِ تازه مهاجرت می‌خواهد
  --    — و میدان‌های چک از بانکی به بانکِ دیگر فرق می‌کنند.
  fields        JSONB NOT NULL DEFAULT '{}'::jsonb,

  "isDefault"   BOOLEAN NOT NULL DEFAULT false,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "ChequePrintTemplate_name_check" CHECK (btrim(name) <> ''),
  CONSTRAINT "ChequePrintTemplate_size_check"
    CHECK ("widthMm" > 0 AND "heightMm" > 0),
  CONSTRAINT "ChequePrintTemplate_fields_check"
    CHECK (jsonb_typeof(fields) = 'object')
);

-- ⚠️ فقط یک الگوی پیش‌فرض برای هر شرکت.
--
--    دو پیش‌فرض یعنی چاپ گاهی روی یکی می‌رود و گاهی روی دیگری، بسته به
--    ترتیبِ نامعلومِ پرس‌وجو — و کسی نمی‌فهمد چرا چکِ امروز کج چاپ شد.
CREATE UNIQUE INDEX IF NOT EXISTS "ChequePrintTemplate_default_key"
  ON "ChequePrintTemplate" ("companyId") WHERE "isDefault";

CREATE INDEX IF NOT EXISTS "ChequePrintTemplate_company_idx"
  ON "ChequePrintTemplate" ("companyId");

ALTER TABLE "ChequePrintTemplate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ChequePrintTemplate" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS company_isolation ON "ChequePrintTemplate";
CREATE POLICY company_isolation ON "ChequePrintTemplate"
  USING ("companyId" = current_setting('app.company_id', true))
  WITH CHECK ("companyId" = current_setting('app.company_id', true));

GRANT SELECT, INSERT, UPDATE, DELETE ON "ChequePrintTemplate" TO molido_app;

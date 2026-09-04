-- گزارش‌ساز
--
-- ⚠️ خطرِ این قابلیت روشن است: کاربر پرس‌وجو می‌سازد.
--
--    راهِ ساده این است که یک تکه SQL بگیریم و اجرا کنیم.  آن راه یعنی
--    هر کاربرِ سامانه می‌تواند کلِ پایگاه‌داده — از جمله دادهٔ شرکت‌های
--    دیگر و درهم‌سازیِ رمزها — را بخواند یا پاک کند.
--
--    پس اینجا **هیچ SQLای از کاربر گرفته نمی‌شود**.  کاربر یک
--    «مشخصات» می‌سازد و سرور از روی فهرستِ سفیدِ خودش پرس‌وجو می‌بافد.
--    این جدول فقط همان مشخصات را نگه می‌دارد.

CREATE TABLE IF NOT EXISTS "ReportDefinition" (
  id            TEXT PRIMARY KEY,
  "companyId"   TEXT NOT NULL REFERENCES "Company"(id) ON DELETE CASCADE,

  name          TEXT NOT NULL,
  description   TEXT,

  -- نامِ مجموعه‌دادهٔ پایه (sales, purchases, ...) — از فهرستِ سفیدِ کد.
  dataset       TEXT NOT NULL,

  -- ⚠️ `spec` **مشخصات** است، نه SQL.
  --
  --    شکل: { columns, filters, groupBy, aggregates, orderBy, limit }
  --    هر نامِ میدان پیش از ساختِ پرس‌وجو با فهرستِ سفید سنجیده می‌شود و
  --    هر مقدار به‌صورت پارامتر می‌رود.  ذخیرهٔ SQL اینجا یعنی همان
  --    خطری که کلِ این طراحی برای دوری از آن است.
  spec          JSONB NOT NULL,

  "isShared"    BOOLEAN NOT NULL DEFAULT false,
  "createdBy"   TEXT REFERENCES "User"(id) ON DELETE SET NULL,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "ReportDefinition_name_check" CHECK (btrim(name) <> ''),
  CONSTRAINT "ReportDefinition_spec_check" CHECK (jsonb_typeof(spec) = 'object')
);

CREATE UNIQUE INDEX IF NOT EXISTS "ReportDefinition_name_key"
  ON "ReportDefinition" ("companyId", name);
CREATE INDEX IF NOT EXISTS "ReportDefinition_company_idx"
  ON "ReportDefinition" ("companyId", dataset);
CREATE INDEX IF NOT EXISTS "ReportDefinition_createdBy_idx"
  ON "ReportDefinition" ("createdBy");

ALTER TABLE "ReportDefinition" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ReportDefinition" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS company_isolation ON "ReportDefinition";
CREATE POLICY company_isolation ON "ReportDefinition"
  USING ("companyId" = current_setting('app.company_id', true))
  WITH CHECK ("companyId" = current_setting('app.company_id', true));

GRANT SELECT, INSERT, UPDATE, DELETE ON "ReportDefinition" TO molido_app;

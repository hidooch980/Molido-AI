-- =============================================
-- جداسازی شرکت برای جدول اختیارات
--
-- مهاجرت ۰۳۹ جدول `RolePermission` را ساخت ولی سیاست RLS برایش
-- ننوشت.  آزمون `integration.sh` همان جلسه گرفتش:
--
--     FAIL every companyId table protected (got=1 want=0)
--
-- ⚠️ این از هر نشتِ دیگری بدتر بود.
--
--    جدولِ اختیارات تعیین می‌کند چه کسی چه کاری می‌تواند بکند.  بدون
--    RLS، شرکت الف می‌توانست ردیفی برای شرکت ب بنویسد — یعنی به
--    نقش‌های شرکتِ دیگر اختیار بدهد یا بگیرد.
--
--    و چون جدولِ اختیارات، خودش دربارهٔ دسترسی است، نشتش فقط دیدنِ
--    دادهٔ دیگری نیست: کنترلِ دسترسیِ دیگری است.
--
-- درسش: هر جدولِ تازه‌ای که `companyId` دارد، همان‌جا سیاستش را هم
-- می‌خواهد.  آزمونِ خودکار این را می‌گیرد — ولی فقط اگر اجرا شود.
-- =============================================

ALTER TABLE "RolePermission" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RolePermission" FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  EXECUTE 'CREATE POLICY company_isolation ON "RolePermission"
             USING ("companyId" = current_setting(''app.company_id'', true))';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON "RolePermission" TO molido_app;

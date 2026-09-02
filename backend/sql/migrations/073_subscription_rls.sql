-- RLS برای اشتراک — به‌جای استثنا گذاشتن.
--
-- ⚠️ مهاجرت ۰۷۱ عمداً RLS نگذاشت تا فروشنده بتواند فهرستِ مشتریانش
--    را ببیند.  **آن استدلال غلط بود**، و نگهبانِ `integration`
--    گرفتش: «هر جدولِ دارای companyId باید محافظت شود».
--
--    استثنا گذاشتن برای یک جدول یعنی نگهبان از آن به بعد دربارهٔ آن
--    جدول ساکت است — و جدولِ بعدی هم به همان دلیل استثنا می‌شود.
--
-- ⚠️ راهِ درست همان است که `complaint_public_track` رفت:
--    `company_isolation` دست‌نخورده می‌ماند و یک سیاستِ **باریکِ
--    نام‌دار** کنارش می‌نشیند.
--
--    سیاست‌های RLS با OR جمع می‌شوند، پس افزودنِ یکی هیچ‌چیز را از
--    محافظتِ قبلی کم نمی‌کند.

ALTER TABLE "Subscription" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Subscription" FORCE ROW LEVEL SECURITY;

-- سیاستِ استاندارد: هر شرکت فقط اشتراکِ خودش.
DROP POLICY IF EXISTS company_isolation ON "Subscription";
CREATE POLICY company_isolation ON "Subscription"
  USING ("companyId" = current_setting('app.company_id', true))
  WITH CHECK ("companyId" = current_setting('app.company_id', true));

-- ⚠️ روزنهٔ فروشنده — **فقط خواندن**، و فقط با پرچمِ صریح.
--
--    `app.vendor` را تنها جایی می‌گذارد که نقشِ کاربر `SUPER_ADMIN`
--    باشد.  یعنی حتی اگر کسی این پرس‌وجو را جای دیگری کپی کند،
--    بدونِ آن پرچم چیزی نمی‌بیند.
--
-- ⚠️ `WITH CHECK` ندارد، عمداً: فروشنده می‌تواند همه را **ببیند**،
--    ولی نوشتنش همچنان از راهِ `company_isolation` می‌گذرد.  دیدن و
--    دست‌کاری دو اختیارِ متفاوت‌اند.
DROP POLICY IF EXISTS vendor_read_all ON "Subscription";
CREATE POLICY vendor_read_all ON "Subscription"
  FOR SELECT
  USING (current_setting('app.vendor', true) = 'true');

-- همین روزنه برای `Company`، چون فهرستِ مشتریان نامِ شرکت را می‌خواهد.
--
-- ⚠️ `Company` ستونِ `companyId` ندارد (خودش شرکت است)، پس نگهبانِ
--    `integration` سراغش نمی‌رود.  ولی همان محافظت را لازم دارد.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'Company') THEN
    DROP POLICY IF EXISTS vendor_read_all ON "Company";
    CREATE POLICY vendor_read_all ON "Company"
      FOR SELECT
      USING (current_setting('app.vendor', true) = 'true');
  END IF;
END $$;

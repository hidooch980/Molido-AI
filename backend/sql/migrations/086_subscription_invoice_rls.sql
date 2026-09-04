-- RLS برای صورت‌حسابِ اشتراک.
--
-- ⚠️ مهاجرت ۰۸۵ همان استدلالِ غلطِ ۰۷۱ را تکرار کرد: «این جدول
--    بین‌شرکتی است، پس RLS ندارد؛ محافظتش در لایهٔ سرویس است.»
--
--    و همان نگهبان دوباره گرفتش — «هر جدولِ دارای companyId باید
--    محافظت شود» — در همان اجرایی که ۰۸۵ اضافه شد.
--
--    درسِ ۰۷۳ این بود و نوشته هم شده بود: استثنا گذاشتن برای یک جدول
--    یعنی نگهبان از آن به بعد دربارهٔ آن ساکت است.  «محافظت در لایهٔ
--    سرویس» یعنی محافظتی که با اولین پرس‌وجوی فراموش‌شده از بین
--    می‌رود؛ RLS با هیچ فراموشی‌ای از بین نمی‌رود.
--
--    خواندنِ درس، جای اجرا کردنش را نمی‌گیرد.

ALTER TABLE "SubscriptionInvoice" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SubscriptionInvoice" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS company_isolation ON "SubscriptionInvoice";
CREATE POLICY company_isolation ON "SubscriptionInvoice"
  USING ("companyId" = current_setting('app.company_id', true))
  WITH CHECK ("companyId" = current_setting('app.company_id', true));

-- ⚠️ روزنهٔ فروشنده — فقط خواندن، مثل ۰۷۳.
--
--    فروشنده باید بتواند ببیند چه کسی پرداخت کرده و چه کسی نه؛ ولی
--    ساختن و پرداخت‌شده‌کردنِ صورت‌حساب همچنان از `company_isolation`
--    می‌گذرد.  دیدن و دست‌کاری دو اختیارِ متفاوت‌اند.
DROP POLICY IF EXISTS vendor_read_all ON "SubscriptionInvoice";
CREATE POLICY vendor_read_all ON "SubscriptionInvoice"
  FOR SELECT
  USING (current_setting('app.vendor', true) = 'true');

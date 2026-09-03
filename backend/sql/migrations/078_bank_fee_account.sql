-- حسابِ کارمزد بانک.
--
-- ⚠️ چرا حسابِ جدا و نه «سایر هزینه‌ها»؟
--
--    `treasuryMovementEntry` برداشتِ با بابتِ OTHER را به ۵۲۹۹ می‌ریخت.
--    کارمزدِ بانک هزینهٔ **قابلِ پیش‌بینی و قابلِ مذاکره**ای است: وقتی
--    داخلِ «سایر» گم شود، هیچ‌کس نمی‌داند سالی چقدر به بانک می‌دهد و
--    کسی هم سرش چانه نمی‌زند.
--
--    مغایرت‌گیری هم دقیقاً همین قلم را بیرون می‌کشد — سطرِ بانکی که در
--    دفتر نیست.  اگر جایی برای ثبتش نباشد، کاربر یا رهایش می‌کند یا در
--    «سایر» می‌ریزد.
--
-- ⚠️ برای شرکت‌های موجود؛ نصبِ تازه از seed می‌گیرد (درسِ ۰۷۱).
INSERT INTO "Account" (id, "companyId", code, name, type, "parentId", "isPostable")
SELECT gen_random_uuid()::text, c.id, '5207', 'کارمزد بانک', 'EXPENSE',
       (SELECT a.id FROM "Account" a WHERE a."companyId" = c.id AND a.code = '5000'),
       true
  FROM "Company" c
 WHERE NOT EXISTS (
   SELECT 1 FROM "Account" a WHERE a."companyId" = c.id AND a.code = '5207'
 );

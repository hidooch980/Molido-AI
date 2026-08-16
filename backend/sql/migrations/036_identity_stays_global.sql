-- =============================================
-- هویت سراسری می‌ماند — اصلاح مهاجرت ۰۳۵
--
-- مهاجرت ۰۳۵ قیدهای یکتای تک‌ستونی را روی جدول‌های چندمستأجری به
-- `(companyId, ...)` تبدیل کرد.  شرطش «جدول ستون companyId دارد» بود،
-- و همین سه قید هویتی را هم در دام انداخت:
--
--     User.email      →  UNIQUE ("companyId", email)
--     User.phone      →  UNIQUE ("companyId", phone)
--     ApiKey.keyHash  →  UNIQUE ("companyId", "keyHash")
--
-- هر سه غلط‌اند، چون هر سه **پیش از دانستن شرکت** جست‌وجو می‌شوند:
--
--   ورود به سامانه فقط ایمیل و رمز می‌گیرد؛ پرس‌وجویش
--   `WHERE email = $1` است، بدون هیچ شرطی روی شرکت.  اگر دو شرکت
--   ایمیل یکسان داشته باشند، معلوم نیست کدام کاربر وارد می‌شود — و
--   پستگرس هم هیچ خطایی نمی‌دهد، فقط یکی‌شان را برمی‌گرداند.
--
--   بازیابی رمز با تلفن همین وضع را دارد.
--
--   کلید API هم خودش تعیین می‌کند شرکت کدام است؛ نمی‌شود پیش از
--   یافتنش شرکت را دانست.
--
-- ⚠️ درسِ این اشتباه: «ستون companyId دارد» با «در محدودهٔ شرکت
--    جست‌وجو می‌شود» یکی نیست.  جدولِ هویت هر دو را دارد ولی فقط اولی
--    درست است.  قاعدهٔ خودکار درست بود؛ استثنایش را ننوشته بودم.
--
-- این اشتباه را آزمون `password` گرفت: `seed` با
-- «no unique or exclusion constraint matching the ON CONFLICT
-- specification» شکست و ۲۳ سنجه افتاد.  ولی خطرِ واقعی‌اش بی‌صداتر
-- بود — ورودِ مبهم، که هیچ آزمونی نمی‌گرفتش تا روزی که شرکت دوم اضافه
-- شود.
-- =============================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'User_companyId_email_key') THEN
    ALTER TABLE "User" DROP CONSTRAINT "User_companyId_email_key";
    ALTER TABLE "User" ADD CONSTRAINT "User_email_key" UNIQUE (email);
    RAISE NOTICE 'User.email دوباره سراسری شد';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'User_companyId_phone_key') THEN
    ALTER TABLE "User" DROP CONSTRAINT "User_companyId_phone_key";
    ALTER TABLE "User" ADD CONSTRAINT "User_phone_key" UNIQUE (phone);
    RAISE NOTICE 'User.phone دوباره سراسری شد';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ApiKey_companyId_keyHash_key') THEN
    ALTER TABLE "ApiKey" DROP CONSTRAINT "ApiKey_companyId_keyHash_key";
    ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_keyHash_key" UNIQUE ("keyHash");
    RAISE NOTICE 'ApiKey.keyHash دوباره سراسری شد';
  END IF;
END $$;

-- رمز دومرحله‌ای (TOTP) برای نقش‌های ممتاز.
--
-- ⚠️ چرا لازم بود؟
--
--    تا امروز حسابِ مدیر فقط با یک رمز محافظت می‌شد.  سخت‌سازی‌های
--    قبلی — قفلِ حساب، ثبتِ تلاش، سقفِ نرخ — حملهٔ **آنلاین** را کند
--    می‌کنند.  ولی اگر رمز از راه دیگری لو برود (تکرار روی سایتی که
--    نشت کرده، نگاه از روی شانه، بدافزار)، هیچ‌کدامشان جلویش را
--    نمی‌گیرند.
--
--    و مدیرِ یک فروشگاه به همه‌چیز دسترسی دارد: قیمت، خزانه، حقوق،
--    کاربران.

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "mfaSecret" text;

COMMENT ON COLUMN "User"."mfaSecret" IS
  'رازِ TOTP به قالب base32.  تهی = هنوز راه‌اندازی نشده.';

-- ⚠️ دو ستونِ جدا: «راز ساخته شد» و «واقعاً فعال شد».
--
--    راه‌اندازی دو مرحله دارد: سرور راز می‌سازد و QR می‌دهد، بعد کاربر
--    یک کدِ درست وارد می‌کند تا ثابت شود برنامه‌اش کار می‌کند.
--
--    اگر یک ستون بود، کاربری که QR را دید و بست، حسابش قفل می‌شد:
--    MFA «فعال» بود ولی هیچ برنامه‌ای راز را نداشت.  یعنی سخت‌سازی
--    خودش کاربر را بیرون می‌انداخت.
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "mfaEnabledAt" timestamptz;

COMMENT ON COLUMN "User"."mfaEnabledAt" IS
  'لحظهٔ تأییدِ اولین کدِ درست.  تهی = راز هست ولی هنوز فعال نیست.';

-- ⚠️ کدهای بازیابی **هش‌شده** ذخیره می‌شوند، مثل رمز.
--
--    هر کدام یک بار مصرف است و به اندازهٔ رمز ارزش دارد: با آن می‌شود
--    MFA را دور زد.  ذخیرهٔ خام یعنی هر کسی که به پایگاه داده برسد،
--    MFA همهٔ کاربران را دور می‌زند — یعنی دقیقاً همان چیزی که MFA
--    برای محافظت در برابرش گذاشته شد.
CREATE TABLE IF NOT EXISTS "MfaRecoveryCode" (
  id          text PRIMARY KEY,
  "userId"    text NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  "codeHash"  text NOT NULL,
  -- کدِ مصرف‌شده دوباره کار نمی‌کند.  بدون این، یک کدِ لو رفته برای
  -- همیشه یک درِ باز است.
  "usedAt"    timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "MfaRecoveryCode_user_idx"
  ON "MfaRecoveryCode" ("userId") WHERE "usedAt" IS NULL;

-- ⚠️ این جدول `companyId` **ندارد**، پس حلقهٔ RLS مهاجرت ۰۱۳ نمی‌گیردش.
--
--    شرکتش از `User` می‌آید.  سیاست از راه والد بررسی می‌شود — همان
--    الگوی مهاجرت ۰۲۳ برای جدول‌های فرزند.
ALTER TABLE "MfaRecoveryCode" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS company_isolation ON "MfaRecoveryCode";
CREATE POLICY company_isolation ON "MfaRecoveryCode"
  FOR ALL
  TO molido_app
  USING (EXISTS (SELECT 1 FROM "User" u WHERE u.id = "MfaRecoveryCode"."userId"))
  WITH CHECK (EXISTS (SELECT 1 FROM "User" u WHERE u.id = "MfaRecoveryCode"."userId"));

GRANT SELECT, INSERT, UPDATE, DELETE ON "MfaRecoveryCode" TO molido_app;

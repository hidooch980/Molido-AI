-- ورود با درگاه دولت.
--
-- ⚠️ چرا `state` در پایگاه‌داده و نه در کوکی؟
--
--    کوکی را خودِ مرورگر نگه می‌دارد؛ یعنی مهاجم می‌تواند مقدارِ
--    دلخواهش را بگذارد و بازگشتِ جعلی بسازد.  سطرِ سمتِ سرور،
--    یک‌بارمصرف و مهلت‌دار، همان حمله را می‌بندد.
--
--    ضمناً `code_verifier` باید جایی بماند که مرورگر نبیندش — وگرنه
--    کلِ فایدهٔ PKCE از بین می‌رود.
--
-- ⚠️ `companyId` می‌تواند تهی باشد.
--
--    جریانِ شهروند پیش از انتخابِ شرکت شروع می‌شود.  پس اینجا کلید
--    خارجیِ اجباری نداریم و RLS هم روی این جدول اعمال نمی‌شود:
--    سطرِ state یک توکنِ گذرا است، نه دادهٔ شرکت.
--
-- ⚠️ `usedAt` یعنی یک‌بارمصرف.
--
--    بدونِ آن، کسی که یک بازگشتِ معتبر را ضبط کرده باشد می‌تواند
--    بارها بازپخشش کند.

CREATE TABLE IF NOT EXISTS "GovSsoState" (
  id            text PRIMARY KEY,
  state         text NOT NULL UNIQUE,
  nonce         text NOT NULL,
  "codeVerifier" text NOT NULL,
  audience      text NOT NULL CHECK (audience IN ('staff','citizen','customer')),
  "companyId"   text,
  "redirectTo"  text,
  "createdAt"   timestamptz NOT NULL DEFAULT now(),
  "expiresAt"   timestamptz NOT NULL,
  "usedAt"      timestamptz
);

CREATE INDEX IF NOT EXISTS "GovSsoState_expiresAt_idx" ON "GovSsoState" ("expiresAt");

-- ⚠️ اتصالِ حساب بر پایهٔ `sub` است، نه کد ملی.
--
--    کد ملی ممکن است در پروندهٔ ما اشتباه وارد شده باشد یا اصلاً
--    نباشد؛ `sub` چیزی است که ارائه‌دهنده تضمین می‌کند همیشه به همان
--    فرد اشاره کند.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "govSubject" text;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "nationalCode" text;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "govSubject" text;

-- ⚠️ یکتایی در محدودهٔ **شرکت**، نه سراسری.
--
--    یک نفر می‌تواند هم کارمندِ شهرداری الف باشد هم پیمانکارِ ب.
--    یکتاییِ سراسری او را از دومی محروم می‌کرد.
--
--    شرطِ جزئی لازم است: بدونش همهٔ سطرهای `NULL` با هم تصادم
--    می‌کردند — یعنی فقط یک کاربر می‌توانست بدونِ اتصال بماند.
CREATE UNIQUE INDEX IF NOT EXISTS "User_companyId_govSubject_key"
  ON "User" ("companyId", "govSubject") WHERE "govSubject" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "Customer_companyId_govSubject_key"
  ON "Customer" ("companyId", "govSubject") WHERE "govSubject" IS NOT NULL;

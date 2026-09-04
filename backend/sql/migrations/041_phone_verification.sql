-- تأیید شمارهٔ موبایل با کد یک‌بارمصرف.
--
-- ⚠️ این جدول از یک آسیب‌پذیریِ تأییدشده آمد، نه از طراحی اولیه.
--
--    ثبت‌نام در فروشگاه، رکوردِ مشتریِ **حضوری** را که صندوق‌دار
--    ساخته بود «تصاحب» می‌کرد تا تاریخچهٔ خرید یکی بماند.  نیت درست
--    بود، ولی هیچ اثباتی نمی‌خواست که ثبت‌نام‌کننده صاحبِ آن شماره
--    است.
--
--    در آزمون زنده: مهاجم فقط شمارهٔ «۰۹۱۲۵۵۵۷۷۷۷» را می‌دانست،
--    ثبت‌نام کرد، و **توکنِ حسابِ مریم کریمی** را گرفت — با دسترسی به
--    `/shop/my-orders` او.
--
--    شمارهٔ موبایل راز نیست: روی رسید نوشته می‌شود، در دفترچه هست، و
--    الگویش (۰۹XXXXXXXXX) شمردنی است.
--
-- ⚠️ کد **هش‌شده** ذخیره می‌شود، نه خام.
--
--    اگر روزی کسی به این جدول دسترسی خواندن پیدا کند، نباید بتواند
--    کدهای در جریان را بخواند.  همان استدلالی که برای رمز عبور
--    می‌کنیم، اینجا هم برقرار است — کدِ شش‌رقمی هم رمز است، فقط
--    کوتاه‌عمر.

CREATE TABLE IF NOT EXISTS "PhoneVerification" (
  id          text PRIMARY KEY,
  "companyId" text NOT NULL REFERENCES "Company"(id) ON DELETE CASCADE,
  phone       text NOT NULL,
  "codeHash"  text NOT NULL,
  -- تلاش‌های ناموفق: کدِ شش‌رقمی یک میلیون حالت دارد، ولی بدون سقف
  -- تلاش، حدس زدنش با چند هزار درخواست شدنی است.
  attempts    integer NOT NULL DEFAULT 0,
  "expiresAt" timestamptz NOT NULL,
  -- کدِ مصرف‌شده دوباره کار نمی‌کند، حتی اگر هنوز منقضی نشده باشد.
  "consumedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

-- جست‌وجوی همیشگی: «آخرین کدِ زندهٔ این شماره در این شرکت».
CREATE INDEX IF NOT EXISTS "PhoneVerification_lookup_idx"
  ON "PhoneVerification" ("companyId", phone, "expiresAt" DESC);

-- ⚠️ RLS مثل هر جدول دیگر.
--
--    بدون این، شرکتِ الف می‌توانست کدهای در جریانِ شرکتِ ب را ببیند —
--    و آن یعنی همان تصاحبِ حساب، از درِ دیگر.
ALTER TABLE "PhoneVerification" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS company_isolation ON "PhoneVerification";
CREATE POLICY company_isolation ON "PhoneVerification"
  USING ("companyId" = current_setting('app.company_id', true))
  WITH CHECK ("companyId" = current_setting('app.company_id', true));

GRANT SELECT, INSERT, UPDATE, DELETE ON "PhoneVerification" TO molido_app;

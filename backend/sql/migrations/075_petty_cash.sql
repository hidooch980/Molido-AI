-- تنخواه گردان
--
-- صندوقِ کوچکی که دستِ یک نفر است تا خرج‌های خرد را بدونِ چرخهٔ خرید
-- انجام دهد: کرایه، نان، تعمیرِ فوری.
--
-- ⚠️ چرا جدا از `CashBox` و نه یک صندوقِ دیگر؟
--
--    صندوق **جای پول** است؛ تنخواه **مسئولیتِ یک شخص** است.  تفاوت
--    عملی‌اش این است که تنخواه سقف دارد، تنخواه‌دار دارد، و باید تسویه
--    شود.  اگر صندوقِ معمولی می‌شد، هیچ‌کدامِ این سه قابلِ اعمال نبود و
--    «چه کسی مسئولِ این کسری است» بی‌پاسخ می‌ماند.

-- ---------- ۱) صندوقِ تنخواه ----------
CREATE TABLE IF NOT EXISTS "PettyCash" (
  id            TEXT PRIMARY KEY,
  "companyId"   TEXT NOT NULL REFERENCES "Company"(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  -- تنخواه‌دار.  اختیاری است چون در فروشگاهِ کوچک ممکن است تفکیک نشود،
  -- ولی وقتی هست، پاسخِ «مسئولش کیست» را دارد.
  "custodianId" TEXT REFERENCES "User"(id) ON DELETE SET NULL,
  -- سقفِ تنخواه.  NULL یعنی بی‌سقف — همان قاعدهٔ `Subscription`:
  -- صفر یعنی قفل، NULL یعنی نامحدود.
  ceiling       NUMERIC(18,2),
  "isActive"    BOOLEAN NOT NULL DEFAULT true,
  note          TEXT,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "PettyCash_ceiling_check" CHECK (ceiling IS NULL OR ceiling > 0)
);

CREATE INDEX IF NOT EXISTS "PettyCash_company_idx" ON "PettyCash" ("companyId");

-- ---------- ۲) گردشِ تنخواه ----------
--
-- ⚠️ ماندهٔ تنخواه **ستون ندارد** و از همین سطرها حساب می‌شود.
--
--    `CashBox` ستونِ `balance` دارد و دلیلش درست است: صندوقِ فروشگاه
--    هزاران تراکنش در روز دارد و صندوق‌دار باید ماندهٔ لحظه‌ای را ببیند.
--
--    تنخواه ماهی چند سطر دارد.  ستونِ مانده آن‌جا فقط یک راهِ تازه برای
--    واگرایی است — هر مسیرِ فراموش‌شده‌ای (ابطال، اصلاح، حذف) عدد را از
--    واقعیت جدا می‌کند و هیچ‌کس نمی‌فهمد.  با محاسبه از سطرها، «مانده
--    غلط است» ممکن نیست؛ فقط «سطری کم یا زیاد است».
CREATE TABLE IF NOT EXISTS "PettyCashTransaction" (
  id            TEXT PRIMARY KEY,
  "companyId"   TEXT NOT NULL REFERENCES "Company"(id) ON DELETE CASCADE,
  "pettyCashId" TEXT NOT NULL REFERENCES "PettyCash"(id) ON DELETE CASCADE,

  -- CHARGE  شارژ از صندوق/بانک به تنخواه
  -- SPEND   خرجِ تنخواه‌دار
  -- RETURN  برگرداندنِ ماندهٔ استفاده‌نشده
  type          TEXT NOT NULL,
  amount        NUMERIC(18,2) NOT NULL,
  description   TEXT NOT NULL,

  -- سندِ حسابداریِ متناظر.  اجباری نیست در سطحِ پایگاه چون درج در یک
  -- تراکنش با ساختِ سند انجام می‌شود، ولی همیشه پر می‌شود.
  "entryId"     TEXT REFERENCES "JournalEntry"(id) ON DELETE SET NULL,
  "userId"      TEXT REFERENCES "User"(id) ON DELETE SET NULL,
  "occurredAt"  TIMESTAMPTZ NOT NULL DEFAULT now(),
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "PettyCashTransaction_type_check"
    CHECK (type IN ('CHARGE', 'SPEND', 'RETURN')),
  -- ⚠️ مبلغ همیشه **مثبت** است؛ جهت را `type` می‌گوید.
  --    مبلغِ منفی یعنی یک خرجِ منفی هم شارژ حساب می‌شود و جمع‌ها بی‌صدا
  --    درست به نظر می‌رسند در حالی که جهت گم شده.
  CONSTRAINT "PettyCashTransaction_amount_check" CHECK (amount > 0)
);

CREATE INDEX IF NOT EXISTS "PettyCashTransaction_fund_idx"
  ON "PettyCashTransaction" ("pettyCashId", "occurredAt");
CREATE INDEX IF NOT EXISTS "PettyCashTransaction_company_idx"
  ON "PettyCashTransaction" ("companyId");

-- ---------- ۳) جداسازیِ شرکت ----------
ALTER TABLE "PettyCash" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PettyCash" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS company_isolation ON "PettyCash";
CREATE POLICY company_isolation ON "PettyCash"
  USING ("companyId" = current_setting('app.company_id', true))
  WITH CHECK ("companyId" = current_setting('app.company_id', true));

ALTER TABLE "PettyCashTransaction" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PettyCashTransaction" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS company_isolation ON "PettyCashTransaction";
CREATE POLICY company_isolation ON "PettyCashTransaction"
  USING ("companyId" = current_setting('app.company_id', true))
  WITH CHECK ("companyId" = current_setting('app.company_id', true));

GRANT SELECT, INSERT, UPDATE ON "PettyCash" TO molido_app;
-- ⚠️ گردش فقط خواندن و درج — نه UPDATE و نه DELETE.
--    ردِ حسابرسی که بشود ویرایشش کرد، ردِ حسابرسی نیست.  اصلاح از راهِ
--    سطرِ معکوس انجام می‌شود، همان‌طور که در دفتر کل.
GRANT SELECT, INSERT ON "PettyCashTransaction" TO molido_app;

-- ---------- ۴) حسابِ معینِ تنخواه ----------
--
-- ⚠️ برای شرکت‌های **موجود** ساخته می‌شود؛ نصبِ تازه آن را از seed
--    می‌گیرد.  همان درسی که مهاجرت ۰۷۱ داد: `INSERT ... FROM "Company"`
--    روی نصبِ تازه صفر ردیف می‌سازد، چون مهاجرت پیش از ساختِ شرکت
--    اجرا می‌شود.
INSERT INTO "Account" (id, "companyId", code, name, type, "parentId", "isPostable")
SELECT gen_random_uuid()::text, c.id, '1107', 'تنخواه گردان', 'ASSET',
       (SELECT a.id FROM "Account" a WHERE a."companyId" = c.id AND a.code = '1100'),
       true
  FROM "Company" c
 WHERE NOT EXISTS (
   SELECT 1 FROM "Account" a WHERE a."companyId" = c.id AND a.code = '1107'
 );

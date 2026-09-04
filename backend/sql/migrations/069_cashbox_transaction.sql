-- ردِ حسابرسیِ صندوق — «چه کسی، کِی، چقدر، بابتِ چه».
--
-- ⚠️ تا امروز واریز و برداشتِ صندوق **هیچ ردی نمی‌گذاشت**.
--
--    `PATCH /cashbox/:id/deposit` فقط `balance` را عوض می‌کرد: نه سند
--    دفترکل می‌زد، نه سطری جایی می‌نوشت.  یعنی نمی‌شد پرسید «سه‌شنبه
--    چه کسی پنج میلیون برداشت؟» — عدد عوض شده بود و تمام.
--
--    اندازه‌گیری شد: واریزِ ۱٬۰۰۰٬۰۰۰ موجودیِ صندوق را بالا برد و
--    حسابِ ۱۱۰۱ صفر تکان خورد.  روی همین پایگاه‌دادهٔ توسعه، جمعِ
--    صندوق‌ها ۵۶٬۴۴۰٬۰۰۰ بود و ماندهٔ ۱۱۰۱ برابر ۳۶٬۳۴۰٬۰۰۰ —
--    اختلافی که هیچ آزمونی نمی‌گرفت چون تراز آزمایشی **صفر می‌ماند**:
--    وقتی اصلاً سندی زده نمی‌شود، چیزی هم نامتراز نمی‌شود.

CREATE TABLE IF NOT EXISTS "CashBoxTransaction" (
  id          text PRIMARY KEY,
  "companyId" text NOT NULL,
  "cashBoxId" text NOT NULL REFERENCES "CashBox"(id) ON DELETE CASCADE,

  -- DEPOSIT یا WITHDRAW
  type        text NOT NULL,

  amount      numeric(18,2) NOT NULL CHECK (amount > 0),

  -- ⚠️ «بابت» اجباری است، و این تصمیمِ آگاهانه‌ای است.
  --
  --    طرفِ دومِ سند به منشأ پول بستگی دارد و سامانه نمی‌تواند حدسش
  --    بزند: واریزِ مالک، انتقال از بانک، و اصلاحِ شمارش سه سندِ
  --    کاملاً متفاوت‌اند.  حدس زدنش یعنی دفتری که عددهایش درست است و
  --    معنایش غلط.
  reason      text NOT NULL,

  -- ماندهٔ صندوق **پس از** این تراکنش.
  --
  -- ⚠️ ذخیره می‌شود، نه محاسبه.  اگر روزی کسی مستقیم `balance` را
  --    دستکاری کند، مقایسهٔ این ستون با جمعِ تراکنش‌ها لُوش می‌دهد.
  "balanceAfter" numeric(18,2) NOT NULL,

  note        text,
  "userId"    text,
  "entryId"   text,

  "createdAt" timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT "CashBoxTransaction_type_check"
    CHECK (type IN ('DEPOSIT', 'WITHDRAW')),

  -- ⚠️ فهرست از روی قاعده‌های سند نوشته شده، نه سلیقه: هر بابتی که
  --    اینجا بیاید باید در `posting-rules.ts` طرفِ دوم داشته باشد.
  CONSTRAINT "CashBoxTransaction_reason_check"
    CHECK (reason IN ('OWNER', 'BANK', 'ADJUST', 'OTHER'))
);

CREATE INDEX IF NOT EXISTS "CashBoxTransaction_companyId_idx"
  ON "CashBoxTransaction" ("companyId");
CREATE INDEX IF NOT EXISTS "CashBoxTransaction_cashBoxId_idx"
  ON "CashBoxTransaction" ("cashBoxId");
CREATE INDEX IF NOT EXISTS "CashBoxTransaction_entryId_idx"
  ON "CashBoxTransaction" ("entryId");

-- ⚠️ جداسازیِ شرکت — مثل هر جدولِ دیگری که `companyId` دارد.
--
--    ردِ حسابرسیِ صندوق دقیقاً همان چیزی است که نباید بین شرکت‌ها
--    نشت کند.
ALTER TABLE "CashBoxTransaction" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CashBoxTransaction" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS company_isolation ON "CashBoxTransaction";
CREATE POLICY company_isolation ON "CashBoxTransaction"
  USING ("companyId" = current_setting('app.company_id', true))
  WITH CHECK ("companyId" = current_setting('app.company_id', true));

GRANT SELECT, INSERT ON "CashBoxTransaction" TO molido_app;

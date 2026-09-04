-- صورت‌حسابِ اشتراک — تا تمدید از **خودِ نرم‌افزار** ممکن شود.
--
-- ⚠️ تا امروز تمدید یعنی: مشتری زنگ بزند، فروشنده کارت‌به‌کارت بگیرد، و
--    بعد دستی `UPDATE "Subscription"` بزند.
--
--    یعنی هر تمدید یک ssh می‌خواست، هیچ رسیدی نمی‌ماند، و در شبِ
--    انقضا کسی نبود که کار را انجام دهد.
--
-- ⚠️ چرا جدولِ جدا و نه استفاده از `Sale`:
--
--    `Sale` فروشِ **مشتریِ شرکت** است و در دفترِ همان شرکت سند می‌زند.
--    اشتراک، فروشِ ماست به آن شرکت — اگر در `Sale` بنشیند، درآمدِ ما
--    در دفترِ مشتری ثبت می‌شود و صورتِ سود و زیانش را خراب می‌کند.

CREATE TABLE IF NOT EXISTS "SubscriptionInvoice" (
  id          text PRIMARY KEY,

  "companyId" text NOT NULL REFERENCES "Company"(id) ON DELETE CASCADE,

  -- نسخه‌ای که خریده می‌شود
  plan        text NOT NULL,

  -- تعدادِ ماهِ خریداری‌شده
  months      integer NOT NULL,

  -- ⚠️ مبلغ به **ریال**، عددِ صحیح — همان قاعدهٔ `payment.types.ts`.
  --
  --    درگاه تومان می‌خواهد و تبدیل کارِ آداپتور است.  اگر این ستون
  --    گاهی ریال و گاهی تومان باشد، روزی کسی ده برابر می‌پردازد.
  "amountRial" bigint NOT NULL,

  -- PENDING | PAID | FAILED | CANCELLED
  status      text NOT NULL DEFAULT 'PENDING',

  -- نامِ درگاه و شناسهٔ تراکنشِ آن (`authority` در زرین‌پال)
  gateway     text,
  reference   text,

  -- شمارهٔ پیگیریِ نهایی که به مشتری نشان داده می‌شود
  "trackingCode" text,

  "paidAt"    timestamptz,
  note        text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT "SubscriptionInvoice_plan_check"
    CHECK (plan IN ('BASIC', 'PRO', 'ADVANCED')),
  CONSTRAINT "SubscriptionInvoice_status_check"
    CHECK (status IN ('PENDING', 'PAID', 'FAILED', 'CANCELLED')),
  CONSTRAINT "SubscriptionInvoice_months_check"
    CHECK (months > 0 AND months <= 60),
  CONSTRAINT "SubscriptionInvoice_amount_check"
    CHECK ("amountRial" > 0)
);

CREATE INDEX IF NOT EXISTS "SubscriptionInvoice_company_idx"
  ON "SubscriptionInvoice" ("companyId", "createdAt" DESC);

-- ⚠️ یکتاییِ `reference` — نگهبانِ **تأییدِ دوباره**.
--
--    بدونش، بازگشتِ دوبارهٔ کاربر از درگاه (رفرشِ صفحهٔ بازگشت، یا
--    دکمهٔ back) می‌توانست یک پرداخت را دو بار تأیید کند و اشتراک را
--    دو دوره تمدید کند.  یک رفرش، یک سال اشتراکِ رایگان.
--
--    جزئی است چون تا پیش از رفتن به درگاه تهی است.
CREATE UNIQUE INDEX IF NOT EXISTS "SubscriptionInvoice_reference_key"
  ON "SubscriptionInvoice" (gateway, reference)
  WHERE reference IS NOT NULL;

-- ⚠️ RLS **ندارد** — عمداً، به همان دلیلِ `Subscription` در ۰۷۱.
--
--    فروشنده باید صورت‌حسابِ همهٔ مشتریان را ببیند و با فیلترِ
--    `app.company_id` هیچ‌کدام را نمی‌دید.  محافظتش در لایهٔ سرویس
--    است: مشتری با `companyId`ِ توکنِ خودش پرس‌وجو می‌کند و فروشنده
--    با نقشِ `SUPER_ADMIN`.
GRANT SELECT, INSERT, UPDATE ON "SubscriptionInvoice" TO molido_app;

-- ---------- قیمتِ ماهانهٔ هر نسخه ----------
--
-- ⚠️ در **جدول** است نه در کد، به همان دلیلِ ۰۷۲: قیمت با بازار عوض
--    می‌شود و اگر در کد باشد هر تغییرِ قیمت یک استقرار می‌خواهد.
ALTER TABLE "PlanDefault"
  ADD COLUMN IF NOT EXISTS "priceRial" bigint;

COMMENT ON COLUMN "PlanDefault"."priceRial" IS
  'قیمتِ ماهانه به ریال؛ NULL یعنی «تماس بگیرید» و آنلاین فروخته نمی‌شود';

-- ⚠️ این اعداد **جای‌نگه‌دار**ند و باید پیش از فروشِ واقعی عوض شوند.
--
--    NULL برای ADVANCED عمدی است: نصبِ اختصاصی قیمتِ ثابت ندارد و
--    نباید آنلاین فروخته شود.  عددِ حدسی گذاشتن یعنی روزی کسی آن را
--    می‌پردازد و ما به قیمتی که نگفته‌ایم متعهد می‌شویم.
UPDATE "PlanDefault" SET "priceRial" = 25000000  WHERE plan = 'BASIC'    AND "priceRial" IS NULL;
UPDATE "PlanDefault" SET "priceRial" = 60000000  WHERE plan = 'PRO'      AND "priceRial" IS NULL;

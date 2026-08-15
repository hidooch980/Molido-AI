-- =============================================
-- صندوق: تعلیق فاکتور و تخفیف قلمی
--
-- دو چیزی که هر فروشگاه واقعی روزی ده بار لازم دارد و صندوق نداشت.
-- =============================================

-- ---------- ۱) فاکتور معلق ----------
--
-- مشتری وسط حساب یادش می‌افتد چیزی برندارده؛ صندوق‌دار سبد را کنار
-- می‌گذارد و نفر بعد را حساب می‌کند.  بدون این، یا صف می‌ایستد یا سبد
-- دور ریخته می‌شود.
--
-- چرا در دیتابیس و نه در مرورگر: صندوق‌دار ممکن است صفحه را ببندد،
-- مرورگر کرش کند، یا شیفت عوض شود.  سبدی که فقط در حافظهٔ مرورگر است،
-- با اولین تازه‌سازی می‌رود.
CREATE TABLE IF NOT EXISTS "ParkedSale" (
  id            TEXT PRIMARY KEY,
  "companyId"   TEXT NOT NULL REFERENCES "Company"(id) ON DELETE CASCADE,
  "userId"      TEXT NOT NULL,
  "shiftId"     TEXT,
  label         TEXT,
  "customerId"  TEXT REFERENCES "Customer"(id) ON DELETE SET NULL,
  -- خطوط سبد همان شکلی که صندوق نگه می‌دارد.  قیمت داخلش **نمایشی**
  -- است؛ هنگام بازیابی دوباره از سرور گرفته می‌شود، وگرنه سبدی که یک
  -- ساعت معلق مانده با قیمت دیروز حساب می‌شود.
  lines         JSONB NOT NULL,
  note          TEXT,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "ParkedSale_open_idx"
  ON "ParkedSale" ("companyId", "createdAt" DESC);

-- ---------- ۲) تخفیف قلمی ----------
--
-- «این یکی ضربه دیده، ۲۰٪ کمتر» — تا امروز فقط تخفیف کل فاکتور ممکن
-- بود.
--
-- سقف در سطح شرکت تعریف می‌شود: تخفیف بدون سقف یعنی صندوق‌دار می‌تواند
-- کالا را رایگان بدهد، و این پرتکرارترین شکل سوءاستفاده در خرده‌فروشی
-- است.
ALTER TABLE "Company"
  ADD COLUMN IF NOT EXISTS "maxLineDiscountPercent" NUMERIC(5,2) NOT NULL DEFAULT 0;

-- تخفیف دستی باید معلوم باشد چه کسی داده — بدون این، مغایرت پایان شیفت
-- قابل پیگیری نیست.
ALTER TABLE "SaleItem"
  ADD COLUMN IF NOT EXISTS "manualDiscount" NUMERIC(18,2) NOT NULL DEFAULT 0;

ALTER TABLE "Sale"
  ADD COLUMN IF NOT EXISTS "discountBy" TEXT;

DO $$
BEGIN
  ALTER TABLE "SaleItem" ADD CONSTRAINT "SaleItem_manual_discount_chk"
    CHECK ("manualDiscount" >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------- ۳) RLS ----------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE tablename = 'ParkedSale' AND policyname = 'company_isolation'
  ) THEN
    ALTER TABLE "ParkedSale" ENABLE ROW LEVEL SECURITY;

    CREATE POLICY company_isolation ON "ParkedSale"
      FOR ALL TO molido_app
      USING ("companyId" = NULLIF(current_setting('app.company_id', true), ''))
      WITH CHECK ("companyId" = NULLIF(current_setting('app.company_id', true), ''));
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO molido_app;

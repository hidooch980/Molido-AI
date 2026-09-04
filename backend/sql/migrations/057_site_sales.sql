-- فروشِ ماژول از سایتِ معرفی.
--
-- ⚠️ چرا جدولِ جدا و نه استفاده از `OnlineOrder`؟
--
--    `OnlineOrder` سفارشِ **کالا** است: به `Product`، موجودی و
--    `Customer` وابسته است.  ماژول نه کالاست نه موجودی دارد، و
--    خریدارش هنوز مشتریِ ثبت‌شده نیست — تازه دارد می‌خرد.
--
--    زور کردنِ آن به قالبِ سفارشِ کالا یعنی رکوردهای ساختگی در انبار
--    و مشتری، که بعداً گزارش‌های فروش را خراب می‌کنند.
--
-- ⚠️ `SiteModule` قیمت را نگه می‌دارد، ولی `SitePurchase` هم مبلغ را
--    ذخیره می‌کند.
--
--    عمدی است: قیمتِ ماژول ممکن است فردا عوض شود و آن‌وقت سفارشِ
--    دیروز مبلغِ امروز را نشان می‌دهد.  همان درسی که `SaleItem.unitCost`
--    داد — بهای لحظهٔ معامله باید روی خودِ سند بنشیند.

CREATE TABLE IF NOT EXISTS "SiteModule" (
  id          text PRIMARY KEY,
  "companyId" text NOT NULL REFERENCES "Company"(id) ON DELETE CASCADE,
  slug        text NOT NULL,
  title       text NOT NULL,
  summary     text,
  -- مبلغ به **ریال** — همان واحدی که درگاه می‌گیرد.  نگه داشتنِ تومان
  -- در جایی و ریال در جای دیگر، دقیقاً همان اشتباهی است که تبدیل را
  -- به یک ضرب‌درِ فراموش‌شده تبدیل می‌کند.
  "priceIrr"  numeric NOT NULL CHECK ("priceIrr" >= 0),
  "isActive"  boolean NOT NULL DEFAULT true,
  "sortOrder" integer NOT NULL DEFAULT 0,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("companyId", slug)
);

CREATE TABLE IF NOT EXISTS "SitePurchase" (
  id             text PRIMARY KEY,
  "companyId"    text NOT NULL REFERENCES "Company"(id) ON DELETE CASCADE,

  -- ⚠️ کدِ رهگیری حدس‌ناپذیر است، نه شمارهٔ ترتیبی.
  --
  --    خریدار با همین کد وضعیتِ سفارشش را می‌بیند و توکنی ندارد.  کدِ
  --    قابلِ شمردن یعنی هر کسی سفارشِ دیگران را می‌خواند — همان دامی
  --    که در پیگیریِ شکایت گرفتار شدیم.
  "trackingCode" text NOT NULL UNIQUE,

  "buyerName"    text NOT NULL,
  "buyerPhone"   text NOT NULL,
  "buyerEmail"   text,
  "buyerCompany" text,
  note           text,

  -- فهرستِ ماژول‌های خریداری‌شده، به‌همراه عنوان و قیمتِ **لحظهٔ خرید**.
  items          jsonb NOT NULL,
  "amountIrr"    numeric NOT NULL CHECK ("amountIrr" > 0),

  status         text NOT NULL DEFAULT 'PENDING'
                 CHECK (status IN ('PENDING','PAID','FAILED','CANCELLED')),

  -- شناسهٔ درگاه (`Authority` در زرین‌پال) و کدِ پیگیریِ بانکی.
  "paymentRef"   text,
  "bankRef"      text,
  "paidAt"       timestamptz,

  -- سرنخِ CRM که از این خرید ساخته شد؛ تهی یعنی هنوز ساخته نشده.
  "leadId"       text,

  "createdAt"    timestamptz NOT NULL DEFAULT now(),
  "updatedAt"    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "SitePurchase_status_idx" ON "SitePurchase" (status);
CREATE INDEX IF NOT EXISTS "SitePurchase_paymentRef_idx" ON "SitePurchase" ("paymentRef");

-- ⚠️ جداسازیِ شرکت — همان حلقهٔ ۰۴۷/۰۵۲.
--
--    بدونش این دو جدول بی‌حفاظ می‌مانند و `integration` قرمز می‌شود.
--    این سومین بار است که همین دام تکرار می‌شود، پس این بار همراهِ
--    خودِ مهاجرت آمده نه در مهاجرتی جدا.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['SiteModule', 'SitePurchase'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS company_isolation ON %I', t);
    EXECUTE format($f$
      CREATE POLICY company_isolation ON %I
        FOR ALL TO molido_app
        USING ("companyId" = NULLIF(current_setting('app.company_id', true), ''))
        WITH CHECK ("companyId" = NULLIF(current_setting('app.company_id', true), ''))
    $f$, t);
  END LOOP;
END $$;

-- ⚠️ روزنهٔ عمومی — همان الگوی `complaint_public_track`.
--
--    خریدار توکن ندارد و باید وضعیتِ سفارشش را ببیند.  این سیاست فقط
--    `SELECT` است و فقط سطری را می‌دهد که کدِ رهگیری‌اش دقیقاً برابر
--    `app.track_code` باشد.
--
--    `FOR ALL` نوشتن یعنی خریدار می‌توانست سفارشش را خودش «پرداخت‌شده»
--    کند.
DO $$
BEGIN
  DROP POLICY IF EXISTS purchase_public_track ON "SitePurchase";
  CREATE POLICY purchase_public_track ON "SitePurchase"
    FOR SELECT TO molido_app
    USING ("trackingCode" = NULLIF(current_setting('app.track_code', true), ''));
END $$;

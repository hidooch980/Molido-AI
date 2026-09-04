-- =============================================
-- فروشگاه اینترنتی
--
-- تفاوت بنیادی با بقیهٔ سامانه: کاربرش **مشتری** است نه کارمند.  پس
-- احراز هویت جدا، سبد خرید، و سفارشی که خودِ مشتری ثبت می‌کند.
--
-- تصمیم اصلی: **زنجیرهٔ فروش موجود بازنویسی نمی‌شود.**  سفارش آنلاین پس از
-- تأیید به همان `SalesOrder` تبدیل می‌شود و از آنجا ارسال و فاکتور و سند
-- حسابداری مثل هر سفارش دیگری جلو می‌رود.  اگر مسیر جدا می‌ساختیم، دو
-- سیستم فروش موازی داشتیم که دیر یا زود از هم واگرا می‌شدند.
-- =============================================

-- ---------- ۱) حساب مشتری ----------
-- مشتری در `Customer` هست ولی رمز و ورود ندارد؛ آن جدول برای فروش حضوری
-- ساخته شده.  ستون‌های احراز هویت اینجا اضافه می‌شوند تا مشتریِ حضوری و
-- آنلاین یک رکورد بمانند و تاریخچهٔ خریدشان یکی باشد.
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "passwordHash" TEXT;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "emailVerified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "phoneVerified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "lastLoginAt" TIMESTAMPTZ;

-- ورود با شمارهٔ موبایل انجام می‌شود، پس باید در هر شرکت یکتا باشد.
--
-- در نصب‌های موجود ممکن است شمارهٔ تکراری وجود داشته باشد (فروش حضوری
-- کنترلی روی تلفن نداشت).  تکراری‌ها **حذف نمی‌شوند** — ممکن است فاکتور
-- داشته باشند.  فقط تلفنِ نسخه‌های بعدی خالی می‌شود تا نمایهٔ یکتا ساخته
-- شود؛ رکورد اول که قدیمی‌ترین است، شماره را نگه می‌دارد.
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY "companyId", phone ORDER BY "createdAt", id
         ) AS rn
    FROM "Customer"
   WHERE phone IS NOT NULL AND phone <> ''
)
UPDATE "Customer" c
   SET phone = NULL
  FROM ranked r
 WHERE c.id = r.id AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS "Customer_company_phone_key"
  ON "Customer" ("companyId", phone)
  WHERE phone IS NOT NULL AND phone <> '';

-- ---------- ۲) نشانی ----------
CREATE TABLE IF NOT EXISTS "CustomerAddress" (
  id           TEXT PRIMARY KEY,
  "companyId"  TEXT NOT NULL,
  "customerId" TEXT NOT NULL REFERENCES "Customer"(id) ON DELETE CASCADE,
  title        TEXT NOT NULL DEFAULT 'منزل',
  province     TEXT,
  city         TEXT,
  address      TEXT NOT NULL,
  "postalCode" TEXT,
  "receiverName" TEXT,
  "receiverPhone" TEXT,
  "isDefault"  BOOLEAN NOT NULL DEFAULT false,
  "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "CustomerAddress_customer_idx"
  ON "CustomerAddress" ("customerId");

-- فقط یک نشانی پیش‌فرض برای هر مشتری.  دو پیش‌فرض یعنی ارسال به نشانی
-- تصادفی.
CREATE UNIQUE INDEX IF NOT EXISTS "CustomerAddress_one_default"
  ON "CustomerAddress" ("customerId") WHERE "isDefault" = true;

-- ---------- ۳) سبد خرید ----------
CREATE TABLE IF NOT EXISTS "Cart" (
  id           TEXT PRIMARY KEY,
  "companyId"  TEXT NOT NULL,
  "customerId" TEXT REFERENCES "Customer"(id) ON DELETE CASCADE,
  -- مهمانِ بدون ثبت‌نام هم سبد دارد؛ با کلید مرورگر شناسایی می‌شود.
  "guestToken" TEXT,
  status       TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"  TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "Cart_status_chk" CHECK (status IN ('ACTIVE','ORDERED','ABANDONED')),
  -- سبد باید صاحب داشته باشد؛ سبدِ بی‌صاحب برای همیشه در جدول می‌ماند.
  CONSTRAINT "Cart_owner_chk"
    CHECK ("customerId" IS NOT NULL OR "guestToken" IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS "Cart_active_customer"
  ON "Cart" ("customerId") WHERE status = 'ACTIVE' AND "customerId" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "Cart_active_guest"
  ON "Cart" ("guestToken") WHERE status = 'ACTIVE' AND "guestToken" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "CartItem" (
  id          TEXT PRIMARY KEY,
  "cartId"    TEXT NOT NULL REFERENCES "Cart"(id) ON DELETE CASCADE,
  "productId" TEXT NOT NULL,
  qty         NUMERIC(18,3) NOT NULL DEFAULT 1,
  -- قیمت در لحظهٔ افزودن ثبت می‌شود تا تغییر قیمت وسط خرید، سبد مشتری را
  -- بی‌خبر عوض نکند.  در تسویه دوباره با قیمت روز مقایسه می‌شود.
  "priceAtAdd" NUMERIC(18,2) NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "CartItem_qty_chk" CHECK (qty > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS "CartItem_unique"
  ON "CartItem" ("cartId", "productId");

-- ---------- ۴) سفارش آنلاین ----------
CREATE TABLE IF NOT EXISTS "OnlineOrder" (
  id            TEXT PRIMARY KEY,
  "companyId"   TEXT NOT NULL,
  "orderNo"     TEXT NOT NULL,
  "customerId"  TEXT REFERENCES "Customer"(id) ON DELETE SET NULL,
  "addressId"   TEXT,
  -- عکس نشانی در لحظهٔ سفارش: اگر مشتری بعداً نشانی را عوض کند، سفارشِ
  -- گذشته نباید به نشانی جدید منتقل شود.
  "shipAddress" TEXT,
  "receiverName" TEXT,
  "receiverPhone" TEXT,

  subtotal      NUMERIC(18,2) NOT NULL DEFAULT 0,
  discount      NUMERIC(18,2) NOT NULL DEFAULT 0,
  "shippingFee" NUMERIC(18,2) NOT NULL DEFAULT 0,
  tax           NUMERIC(18,2) NOT NULL DEFAULT 0,
  total         NUMERIC(18,2) NOT NULL DEFAULT 0,

  "paymentMethod" TEXT NOT NULL DEFAULT 'COD',
  "paymentStatus" TEXT NOT NULL DEFAULT 'PENDING',
  "paymentRef"  TEXT,
  status        TEXT NOT NULL DEFAULT 'PLACED',

  -- پیوند به زنجیرهٔ فروش موجود
  "salesOrderId" TEXT,
  note          TEXT,
  "placedAt"    TIMESTAMPTZ NOT NULL DEFAULT now(),
  "confirmedAt" TIMESTAMPTZ,
  "cancelledAt" TIMESTAMPTZ,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "OnlineOrder_status_chk" CHECK (status IN (
    'PLACED','CONFIRMED','PREPARING','SHIPPED','DELIVERED','CANCELLED'
  )),
  CONSTRAINT "OnlineOrder_payment_chk" CHECK ("paymentMethod" IN (
    'COD','GATEWAY','WALLET','CARD_TO_CARD'
  )),
  CONSTRAINT "OnlineOrder_paystatus_chk" CHECK ("paymentStatus" IN (
    'PENDING','PAID','FAILED','REFUNDED'
  )),
  CONSTRAINT "OnlineOrder_total_chk" CHECK (total >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS "OnlineOrder_company_no_key"
  ON "OnlineOrder" ("companyId", "orderNo");
CREATE INDEX IF NOT EXISTS "OnlineOrder_customer_idx"
  ON "OnlineOrder" ("customerId", "placedAt" DESC);
CREATE INDEX IF NOT EXISTS "OnlineOrder_company_status_idx"
  ON "OnlineOrder" ("companyId", status);

CREATE TABLE IF NOT EXISTS "OnlineOrderItem" (
  id          TEXT PRIMARY KEY,
  "orderId"   TEXT NOT NULL REFERENCES "OnlineOrder"(id) ON DELETE CASCADE,
  "productId" TEXT,
  -- نام و قیمت در لحظهٔ سفارش ثبت می‌شوند: کالا ممکن است بعداً حذف یا
  -- گران شود، ولی فاکتور مشتری باید همان چیزی بماند که خرید کرده.
  name        TEXT NOT NULL,
  qty         NUMERIC(18,3) NOT NULL,
  "unitPrice" NUMERIC(18,2) NOT NULL,
  total       NUMERIC(18,2) NOT NULL,

  CONSTRAINT "OnlineOrderItem_qty_chk" CHECK (qty > 0)
);

CREATE INDEX IF NOT EXISTS "OnlineOrderItem_order_idx"
  ON "OnlineOrderItem" ("orderId");

-- ---------- ۵) تنظیمات فروشگاه ----------
CREATE TABLE IF NOT EXISTS "ShopSetting" (
  "companyId"      TEXT PRIMARY KEY,
  "shopName"       TEXT,
  "shopDescription" TEXT,
  "isOpen"         BOOLEAN NOT NULL DEFAULT true,
  -- هزینهٔ ارسال ثابت، و سقفی که بالاتر از آن ارسال رایگان است
  "shippingFee"    NUMERIC(18,2) NOT NULL DEFAULT 0,
  "freeShippingOver" NUMERIC(18,2),
  "minOrderAmount" NUMERIC(18,2) NOT NULL DEFAULT 0,
  -- انباری که سفارش آنلاین از آن تأمین می‌شود
  "warehouseId"    TEXT,
  "supportPhone"   TEXT,
  "createdAt"      TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- ۶) کالا در فروشگاه ----------
-- همهٔ کالاها آنلاین فروخته نمی‌شوند؛ باید صریح باشد.
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "isOnline" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "onlinePrice" NUMERIC(18,2);
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "imageUrl" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "description" TEXT;

CREATE INDEX IF NOT EXISTS "Product_online_idx"
  ON "Product" ("companyId") WHERE "isOnline" = true;

-- ---------- ۷) RLS ----------
DO $$
DECLARE
  target RECORD;
BEGIN
  FOR target IN
    SELECT c.relname AS table_name
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN information_schema.columns col
        ON col.table_name = c.relname
       AND col.table_schema = n.nspname
       AND col.column_name = 'companyId'
     WHERE n.nspname = 'public'
       AND c.relkind = 'r'
       AND NOT EXISTS (
         SELECT 1 FROM pg_policies p
          WHERE p.tablename = c.relname AND p.policyname = 'company_isolation'
       )
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', target.table_name);
    EXECUTE format($f$
      CREATE POLICY company_isolation ON %I
        FOR ALL TO molido_app
        USING ("companyId" = NULLIF(current_setting('app.company_id', true), ''))
        WITH CHECK ("companyId" = NULLIF(current_setting('app.company_id', true), ''))
    $f$, target.table_name);
    RAISE NOTICE 'RLS policy added: %', target.table_name;
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO molido_app;

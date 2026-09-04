-- =============================================
-- منشی خرید — استعلام قیمت از تأمین‌کننده‌ها
--
-- کاری که امروز دستی انجام می‌شود: انباردار می‌بیند برنج تمام شده، به
-- سه تأمین‌کننده زنگ می‌زند، قیمت‌ها را روی کاغذ می‌نویسد، مقایسه
-- می‌کند، و به یکی سفارش می‌دهد.
--
-- سه چیز در این مسیر گم می‌شود:
--   • قیمت‌های استعلام‌شده هیچ‌جا نمی‌مانند — ماه بعد دوباره باید زنگ زد.
--   • معلوم نیست چرا از این یکی خریدیم؛ اگر گران بود، کسی نمی‌فهمد.
--   • کالایی که کسی یادش نرفت زنگ بزند، تا روز تمام شدنش پیدا نمی‌شود.
-- =============================================

-- ---------- ۱) درخواست استعلام ----------
--
-- یک «دور» استعلام: چند کالا، چند تأمین‌کننده، یک تصمیم.
CREATE TABLE IF NOT EXISTS "PurchaseInquiry" (
  id            TEXT PRIMARY KEY,
  "companyId"   TEXT NOT NULL REFERENCES "Company"(id) ON DELETE CASCADE,
  "inquiryNo"   TEXT NOT NULL,
  title         TEXT,

  -- DRAFT → CALLING → COMPARING → ORDERED | CANCELLED
  --
  -- `CALLING` جدا از `DRAFT` است چون وسط تماس‌ها نباید کسی اقلام را
  -- عوض کند: تأمین‌کنندهٔ اول روی فهرست قدیمی قیمت داده.
  status        TEXT NOT NULL DEFAULT 'DRAFT'
                CHECK (status IN ('DRAFT', 'CALLING', 'COMPARING', 'ORDERED', 'CANCELLED')),

  "warehouseId" TEXT REFERENCES "Warehouse"(id) ON DELETE SET NULL,
  note          TEXT,

  -- خریدی که از این استعلام درآمد.  بدون این، «چرا این قیمت» بی‌پاسخ
  -- می‌ماند.
  "purchaseId"  TEXT REFERENCES "Purchase"(id) ON DELETE SET NULL,

  "createdBy"   TEXT,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "PurchaseInquiry_no_key"
  ON "PurchaseInquiry" ("companyId", "inquiryNo");

CREATE INDEX IF NOT EXISTS "PurchaseInquiry_company_status_idx"
  ON "PurchaseInquiry" ("companyId", status, "createdAt" DESC);

-- ---------- ۲) اقلام استعلام ----------
CREATE TABLE IF NOT EXISTS "PurchaseInquiryItem" (
  id            TEXT PRIMARY KEY,
  "inquiryId"   TEXT NOT NULL REFERENCES "PurchaseInquiry"(id) ON DELETE CASCADE,
  "productId"   TEXT NOT NULL REFERENCES "Product"(id) ON DELETE CASCADE,
  qty           NUMERIC(12,3) NOT NULL,

  -- آخرین قیمت خرید، در لحظهٔ ساخت استعلام.
  --
  -- نگه داشته می‌شود چون قیمت کالا فردا عوض می‌شود و آن‌وقت معلوم
  -- نیست پیشنهاد تأمین‌کننده گران بود یا ارزان.
  "lastPrice"   NUMERIC(14,2),

  UNIQUE ("inquiryId", "productId")
);

-- ---------- ۳) تماس با تأمین‌کننده ----------
--
-- هر ردیف یک تماس است — چه دستی زده شده باشد چه با ویپ.
CREATE TABLE IF NOT EXISTS "SupplierCall" (
  id            TEXT PRIMARY KEY,
  "companyId"   TEXT NOT NULL REFERENCES "Company"(id) ON DELETE CASCADE,
  "inquiryId"   TEXT NOT NULL REFERENCES "PurchaseInquiry"(id) ON DELETE CASCADE,
  "supplierId"  TEXT NOT NULL REFERENCES "Supplier"(id) ON DELETE CASCADE,

  -- PENDING → RINGING → ANSWERED → QUOTED | NO_ANSWER | REFUSED | FAILED
  --
  -- `QUOTED` جدا از `ANSWERED` است: تأمین‌کننده‌ای که جواب داد ولی
  -- قیمت نداد، با کسی که اصلاً برنداشت فرق دارد — اولی را باید دوباره
  -- گرفت، دومی را نه.
  status        TEXT NOT NULL DEFAULT 'PENDING'
                CHECK (status IN ('PENDING', 'RINGING', 'ANSWERED', 'QUOTED',
                                  'NO_ANSWER', 'REFUSED', 'FAILED')),

  -- MANUAL | VOIP — چه کسی تماس گرفت.
  --
  -- تفکیکش لازم است: قیمتی که اپراتور انسانی شنیده با قیمتی که موتور
  -- گفتار استخراج کرده، اعتبار یکسان ندارند.
  channel       TEXT NOT NULL DEFAULT 'MANUAL'
                CHECK (channel IN ('MANUAL', 'VOIP')),

  phone         TEXT,
  "providerId"  TEXT,          -- شناسهٔ تماس نزد ارائه‌دهندهٔ ویپ
  "recordingUrl" TEXT,
  transcript    TEXT,
  "durationSec" INTEGER,
  error         TEXT,
  note          TEXT,

  "calledAt"    TIMESTAMPTZ,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- یک تأمین‌کننده یک تماس در هر استعلام.  دو بار زنگ زدن به یک نفر
  -- برای یک فهرست، هم بی‌ادبی است هم دو قیمت متناقض می‌سازد.
  UNIQUE ("inquiryId", "supplierId")
);

CREATE INDEX IF NOT EXISTS "SupplierCall_company_idx"
  ON "SupplierCall" ("companyId", "createdAt" DESC);

-- ---------- ۴) قیمت پیشنهادی ----------
CREATE TABLE IF NOT EXISTS "SupplierQuote" (
  id            TEXT PRIMARY KEY,
  "companyId"   TEXT NOT NULL REFERENCES "Company"(id) ON DELETE CASCADE,
  "callId"      TEXT NOT NULL REFERENCES "SupplierCall"(id) ON DELETE CASCADE,
  "productId"   TEXT NOT NULL REFERENCES "Product"(id) ON DELETE CASCADE,

  "unitPrice"   NUMERIC(14,2) NOT NULL,
  "availableQty" NUMERIC(12,3),
  "leadDays"    INTEGER,
  note          TEXT,

  -- برندهٔ مقایسه.  یک قلم فقط یک برنده دارد؛ ایندکس یکتای جزئی
  -- پایین‌تر همین را در دیتابیس تضمین می‌کند، نه در کد.
  "isSelected"  BOOLEAN NOT NULL DEFAULT false,

  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE ("callId", "productId")
);

DO $$
BEGIN
  ALTER TABLE "SupplierQuote" ADD CONSTRAINT "quote_price_positive"
    CHECK ("unitPrice" > 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "SupplierQuote_product_idx"
  ON "SupplierQuote" ("companyId", "productId", "createdAt" DESC);

-- ---------- ۵) تنظیمات ویپ ----------
--
-- جدا از `.env` چون هر شرکت حساب خودش را دارد و مدیر باید بتواند از
-- پنل عوضش کند — نه اینکه برای تغییر سرشماره به سرور SSH بزند.
CREATE TABLE IF NOT EXISTS "VoipSetting" (
  "companyId"   TEXT PRIMARY KEY REFERENCES "Company"(id) ON DELETE CASCADE,
  provider      TEXT,          -- نام ارائه‌دهنده
  "isEnabled"   BOOLEAN NOT NULL DEFAULT false,
  "callerId"    TEXT,          -- شماره‌ای که روی گوشی تأمین‌کننده می‌افتد
  "apiKey"      TEXT,
  "webhookSecret" TEXT,
  "maxCallsPerRun" INTEGER NOT NULL DEFAULT 20,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  ALTER TABLE "VoipSetting" ADD CONSTRAINT "voip_max_calls_sane"
    CHECK ("maxCallsPerRun" BETWEEN 1 AND 200);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------- ۶) RLS ----------
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['PurchaseInquiry', 'SupplierCall', 'SupplierQuote', 'VoipSetting'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    BEGIN
      EXECUTE format(
        'CREATE POLICY company_isolation ON %I USING ("companyId" = current_setting(''app.company_id'', true))',
        t);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO molido_app', t);
  END LOOP;
END $$;

-- اقلام استعلام `companyId` ندارد (از سربرگ می‌آید)، پس دسترسی‌اش را
-- مستقیم می‌دهیم؛ RLS سربرگ جلوی دیدن استعلام شرکت دیگر را می‌گیرد.
GRANT SELECT, INSERT, UPDATE, DELETE ON "PurchaseInquiryItem" TO molido_app;

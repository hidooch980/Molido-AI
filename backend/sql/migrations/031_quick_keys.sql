-- =============================================
-- کلید سریع صندوق — سفارشی‌سازی منوی فروش
--
-- تنها قابلیتی از فهرست رقبا که نداشتیم.  صندوق تا امروز فقط با اسکن
-- کار می‌کرد، و این برای نصف کارِ یک فروشگاه واقعی کافی نیست:
--
--   • کالای فله (میوه، نان، سبزی) بارکد ندارد.
--   • کالای پرفروش (نایلون، سیگار، شارژ) اسکنش وقت‌گیرتر از یک دکمه است.
--   • کافه‌رستوران اصلاً بارکد ندارد.
--
-- بدون کلید سریع، صندوق‌دار باید نام را تایپ و از فهرست انتخاب کند —
-- سه برابر زمان یک لمس.
-- =============================================

-- ---------- ۱) گروه کلیدها ----------
--
-- گروه‌بندی لازم است چون بیش از ۲۰ کلید روی یک صفحه گم می‌شود.  هر
-- گروه یک زبانه در صندوق است: «میوه»، «لبنیات»، «پرفروش‌ها».
CREATE TABLE IF NOT EXISTS "QuickKeyGroup" (
  id           TEXT PRIMARY KEY,
  "companyId"  TEXT NOT NULL REFERENCES "Company"(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  color        TEXT,
  "sortOrder"  INTEGER NOT NULL DEFAULT 0,
  "isActive"   BOOLEAN NOT NULL DEFAULT true,
  "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "QuickKeyGroup_name_key"
  ON "QuickKeyGroup" ("companyId", name);

-- ---------- ۲) خود کلید ----------
CREATE TABLE IF NOT EXISTS "QuickKey" (
  id           TEXT PRIMARY KEY,
  "companyId"  TEXT NOT NULL REFERENCES "Company"(id) ON DELETE CASCADE,
  "groupId"    TEXT NOT NULL REFERENCES "QuickKeyGroup"(id) ON DELETE CASCADE,

  -- کالا با حذفش، کلیدش هم می‌رود.  کلیدی که به کالای حذف‌شده اشاره
  -- کند، هر بار لمس شدن خطا می‌دهد و صندوق‌دار نمی‌فهمد چرا.
  "productId"  TEXT NOT NULL REFERENCES "Product"(id) ON DELETE CASCADE,

  -- برچسب دلخواه: نام کالا در سامانه ممکن است «برنج هاشمی درجه یک
  -- ۱۰ کیلویی» باشد، ولی روی دکمه باید «برنج ۱۰ک» بنویسد.
  label        TEXT,
  color        TEXT,

  -- مقدار پیش‌فرض: نان یک عدد نیست، ده تاست.  بدون این، صندوق‌دار
  -- باید بعد از هر لمس مقدار را دستی عوض کند.
  "defaultQty" NUMERIC(10,3) NOT NULL DEFAULT 1,

  "sortOrder"  INTEGER NOT NULL DEFAULT 0,
  "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- یک کالا یک بار در هر گروه.  دو دکمهٔ یکسان کنار هم فقط سردرگمی است.
CREATE UNIQUE INDEX IF NOT EXISTS "QuickKey_group_product_key"
  ON "QuickKey" ("groupId", "productId");

CREATE INDEX IF NOT EXISTS "QuickKey_company_idx"
  ON "QuickKey" ("companyId", "sortOrder");

DO $$
BEGIN
  ALTER TABLE "QuickKey" ADD CONSTRAINT "quick_key_qty_positive"
    CHECK ("defaultQty" > 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------- ۳) RLS ----------
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['QuickKeyGroup', 'QuickKey'] LOOP
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

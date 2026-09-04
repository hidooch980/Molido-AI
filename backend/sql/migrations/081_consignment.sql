-- کالای امانی
--
-- دو جهتِ کاملاً متفاوت که فقط اسمشان شبیه است:
--
--   OUT  کالای امانیِ **داده‌شده** — مالِ ماست، جای دیگری است.
--   IN   کالای امانیِ **گرفته‌شده** — دستِ ماست، مالِ ما نیست.
--
-- ⚠️ تلهٔ کلاسیک: امانی دادن **فروش نیست**.
--
--    وسوسه‌انگیز است که خروجِ کالا را فروش ثبت کنیم — انبار خالی می‌شود
--    و فاکتور صادر.  ولی تا وقتی امانت‌گیر نفروخته، نه درآمدی محقق شده
--    و نه مالکیت منتقل.  ثبتِ زودهنگام یعنی درآمدِ امسال بالا و سالِ
--    بعد پایین، و اگر کالا برگردد یک فروشِ برگشتیِ ساختگی.
--
--    پس کالا از انبار خارج می‌شود ولی به حسابِ «موجودی کالای امانی نزد
--    دیگران» می‌رود — همچنان دارایی، فقط جای دیگر.
--
-- ⚠️ و تلهٔ قرینه‌اش: امانیِ گرفته‌شده **دارایی ما نیست**.
--
--    اگر به `Inventory` اضافه شود، ارزشِ موجودی و ترازنامه هر دو
--    متورم می‌شوند — دارایی‌ای که مالِ ما نیست.  این جدول عمداً به
--    `Inventory` دست نمی‌زند.

CREATE TABLE IF NOT EXISTS "Consignment" (
  id            TEXT PRIMARY KEY,
  "companyId"   TEXT NOT NULL REFERENCES "Company"(id) ON DELETE CASCADE,

  -- OUT = داده‌ایم، IN = گرفته‌ایم
  direction     TEXT NOT NULL,
  "docNo"       TEXT NOT NULL,

  -- طرفِ مقابل: برای OUT مشتری، برای IN تأمین‌کننده.
  "customerId"  TEXT REFERENCES "Customer"(id) ON DELETE SET NULL,
  "supplierId"  TEXT REFERENCES "Supplier"(id) ON DELETE SET NULL,

  -- انبارِ مبدأ (OUT).  برای IN معنایی ندارد چون وارد انبار نمی‌شود.
  "warehouseId" TEXT REFERENCES "Warehouse"(id) ON DELETE SET NULL,

  status        TEXT NOT NULL DEFAULT 'OPEN',
  note          TEXT,
  "userId"      TEXT REFERENCES "User"(id) ON DELETE SET NULL,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "Consignment_direction_check" CHECK (direction IN ('OUT', 'IN')),
  CONSTRAINT "Consignment_status_check"
    CHECK (status IN ('OPEN', 'CLOSED')),

  -- ⚠️ طرفِ مقابل باید با جهت بخواند.
  --    امانیِ داده‌شده به تأمین‌کننده و گرفته‌شده از مشتری، هر دو نشانهٔ
  --    داده‌ی به‌هم‌ریخته‌اند — و بعداً هیچ گزارشی درست درنمی‌آید.
  CONSTRAINT "Consignment_party_check" CHECK (
    (direction = 'OUT' AND "customerId" IS NOT NULL AND "supplierId" IS NULL)
    OR
    (direction = 'IN'  AND "supplierId" IS NOT NULL AND "customerId" IS NULL)
  ),
  CONSTRAINT "Consignment_warehouse_check"
    CHECK (direction = 'IN' OR "warehouseId" IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS "Consignment_docNo_key"
  ON "Consignment" ("companyId", "docNo");
CREATE INDEX IF NOT EXISTS "Consignment_company_idx"
  ON "Consignment" ("companyId", direction, status);
CREATE INDEX IF NOT EXISTS "Consignment_customer_idx" ON "Consignment" ("customerId");
CREATE INDEX IF NOT EXISTS "Consignment_supplier_idx" ON "Consignment" ("supplierId");
CREATE INDEX IF NOT EXISTS "Consignment_warehouse_idx" ON "Consignment" ("warehouseId");
CREATE INDEX IF NOT EXISTS "Consignment_user_idx" ON "Consignment" ("userId");

CREATE TABLE IF NOT EXISTS "ConsignmentItem" (
  id              TEXT PRIMARY KEY,
  "companyId"     TEXT NOT NULL REFERENCES "Company"(id) ON DELETE CASCADE,
  "consignmentId" TEXT NOT NULL REFERENCES "Consignment"(id) ON DELETE CASCADE,
  "productId"     TEXT NOT NULL REFERENCES "Product"(id) ON DELETE RESTRICT,

  quantity        NUMERIC(18,3) NOT NULL,
  "unitPrice"     NUMERIC(18,2) NOT NULL DEFAULT 0,
  -- بهای تمام‌شده در لحظهٔ خروج قفل می‌شود (فقط OUT).
  -- ⚠️ همان درسِ `SaleItem.unitCost`: بهای **امروز** برای کالایی که
  --    پارسال رفته، عددِ غلطی است که درست به نظر می‌رسد.
  "unitCost"      NUMERIC(18,2),

  "settledQty"    NUMERIC(18,3) NOT NULL DEFAULT 0,
  "returnedQty"   NUMERIC(18,3) NOT NULL DEFAULT 0,

  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"     TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "ConsignmentItem_qty_check" CHECK (quantity > 0),
  CONSTRAINT "ConsignmentItem_settled_check" CHECK ("settledQty" >= 0),
  CONSTRAINT "ConsignmentItem_returned_check" CHECK ("returnedQty" >= 0),

  -- ⚠️ تسویه‌شده + برگشتی هرگز از مقدارِ امانی بیشتر نمی‌شود.
  --
  --    بدونِ این قید، دو تسویهٔ هم‌زمان می‌توانند بیش از موجودی را
  --    بفروشند و کالایی «تسویه» شود که وجود ندارد.  قید در پایگاه‌داده
  --    است نه در کد، چون شرطِ رقابتی را فقط پایگاه‌داده می‌تواند ببندد.
  CONSTRAINT "ConsignmentItem_balance_check"
    CHECK ("settledQty" + "returnedQty" <= quantity)
);

CREATE INDEX IF NOT EXISTS "ConsignmentItem_consignment_idx"
  ON "ConsignmentItem" ("consignmentId");
CREATE INDEX IF NOT EXISTS "ConsignmentItem_product_idx"
  ON "ConsignmentItem" ("productId");
CREATE INDEX IF NOT EXISTS "ConsignmentItem_company_idx"
  ON "ConsignmentItem" ("companyId");

ALTER TABLE "Consignment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Consignment" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS company_isolation ON "Consignment";
CREATE POLICY company_isolation ON "Consignment"
  USING ("companyId" = current_setting('app.company_id', true))
  WITH CHECK ("companyId" = current_setting('app.company_id', true));

ALTER TABLE "ConsignmentItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ConsignmentItem" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS company_isolation ON "ConsignmentItem";
CREATE POLICY company_isolation ON "ConsignmentItem"
  USING ("companyId" = current_setting('app.company_id', true))
  WITH CHECK ("companyId" = current_setting('app.company_id', true));

GRANT SELECT, INSERT, UPDATE ON "Consignment" TO molido_app;
GRANT SELECT, INSERT, UPDATE ON "ConsignmentItem" TO molido_app;

-- ---------- حسابِ موجودیِ امانیِ نزد دیگران ----------
--
-- دارایی است، ولی جدا از «موجودی کالا»ی ۱۱۰۴ — چون شمارشِ انبار آن را
-- پیدا نمی‌کند و اگر با هم یکی باشند، هر انبارگردانی کسری نشان می‌دهد.
INSERT INTO "Account" (id, "companyId", code, name, type, "parentId", "isPostable")
SELECT gen_random_uuid()::text, c.id, '1108', 'موجودی کالای امانی نزد دیگران',
       'ASSET',
       (SELECT a.id FROM "Account" a WHERE a."companyId" = c.id AND a.code = '1100'),
       true
  FROM "Company" c
 WHERE NOT EXISTS (
   SELECT 1 FROM "Account" a WHERE a."companyId" = c.id AND a.code = '1108'
 );

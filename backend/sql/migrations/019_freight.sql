-- =============================================
-- کرایهٔ حمل
--
-- دو سمت دارد و حسابداری‌شان یکی نیست:
--
-- ۱. **حمل ورودی (خرید)** — بخشی از بهای تمام‌شدهٔ کالاست، نه هزینهٔ دوره.
--    اگر هزینه شود، بهای موجودی کمتر از واقع می‌ماند و سود ناخالص بیش از
--    واقع گزارش می‌شود.  پس روی اقلام سرشکن می‌شود («بهای تمام‌شدهٔ رسیده»).
--
-- ۲. **حمل خروجی (فروش)** — هزینهٔ توزیع است.  اگر از مشتری گرفته شود،
--    سمت درآمدی هم دارد.
-- =============================================

-- ---------- ۱) حمل ورودی ----------
ALTER TABLE "Purchase" ADD COLUMN IF NOT EXISTS "freightCost" NUMERIC(18,2) NOT NULL DEFAULT 0;
ALTER TABLE "Purchase" ADD COLUMN IF NOT EXISTS "freightCarrier" TEXT;
-- آیا کرایه روی بهای کالا سرشکن شود یا هزینهٔ دوره باشد.  برخی کسب‌وکارها
-- به‌دلیل سادگی، کرایه را هزینه می‌کنند؛ انتخاب باید صریح باشد نه ضمنی.
ALTER TABLE "Purchase" ADD COLUMN IF NOT EXISTS "capitalizeFreight" BOOLEAN NOT NULL DEFAULT true;

-- سهم هر قلم از کرایه، و بهای تمام‌شدهٔ واحد پس از سرشکن.
ALTER TABLE "PurchaseItem" ADD COLUMN IF NOT EXISTS "freightShare" NUMERIC(18,2) NOT NULL DEFAULT 0;
ALTER TABLE "PurchaseItem" ADD COLUMN IF NOT EXISTS "landedUnitCost" NUMERIC(18,2);

DO $$
BEGIN
  ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_freight_chk"
    CHECK ("freightCost" >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------- ۲) حمل خروجی ----------
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "freightCharge" NUMERIC(18,2) NOT NULL DEFAULT 0;
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "freightCost"   NUMERIC(18,2) NOT NULL DEFAULT 0;

DO $$
BEGIN
  ALTER TABLE "Sale" ADD CONSTRAINT "Sale_freight_chk"
    CHECK ("freightCharge" >= 0 AND "freightCost" >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- حواله: هزینهٔ واقعی حمل جدا از مبلغی که از مشتری گرفته شده.
ALTER TABLE "Shipment" ADD COLUMN IF NOT EXISTS "carrierCost" NUMERIC(18,2) NOT NULL DEFAULT 0;
ALTER TABLE "Shipment" ADD COLUMN IF NOT EXISTS "journalEntryId" TEXT;

DO $$
BEGIN
  ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_cost_chk"
    CHECK ("carrierCost" >= 0 AND fee >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------- ۳) حساب‌ها ----------
-- ۵۲۰۴ «حمل و نقل» از قبل هست.  درآمد حمل جداست تا حاشیهٔ توزیع قابل
-- سنجش بماند: اگر با فروش کالا قاطی شود، هیچ‌وقت معلوم نمی‌شود حمل سودده
-- است یا زیان‌ده.
INSERT INTO "Account" (id, "companyId", name, code, type, "isPostable")
SELECT gen_random_uuid()::text, c.id, v.name, v.code, v.type, true
FROM "Company" c
CROSS JOIN (VALUES
  ('درآمد حمل و نقل', '4106', 'REVENUE'),
  ('کرایه حمل پرداختنی', '2107', 'LIABILITY')
) AS v(name, code, type)
WHERE NOT EXISTS (
  SELECT 1 FROM "Account" a WHERE a."companyId" = c.id AND a.code = v.code
);

-- ---------- ۴) RLS برای هر جدول تازه ----------
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

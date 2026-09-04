-- =============================================
-- RLS برای جدول‌های فرزند
--
-- مهاجرت ۰۱۳ سیاست را روی هر جدولی که `companyId` داشت گذاشت.  جدول‌های
-- سطر-فاکتور ستون `companyId` ندارند — شرکتشان از رکورد والد می‌آید — پس
-- کاملاً از قلم افتادند و **هیچ** سیاستی رویشان نیست.
--
-- در عمل یعنی: `SELECT * FROM "Inventory"` با نقش برنامه، موجودی همهٔ
-- شرکت‌ها را برمی‌گرداند.  کوئری‌های فعلی همیشه به والد JOIN می‌زنند و
-- عملاً درست کار می‌کنند، ولی این یعنی جداسازی به «یادمان بماند JOIN
-- بزنیم» وابسته است، نه به دیتابیس — و RLS دقیقاً برای همین گذاشته شد.
--
-- سیاست از راه والد بررسی می‌کند.  چون خود والد هم سیاست دارد، زیرپرس‌وجو
-- فقط رکوردهای همان شرکت را می‌بیند و EXISTS برای بقیه false می‌شود.
-- =============================================

DO $$
DECLARE
  target RECORD;
BEGIN
  FOR target IN
    SELECT * FROM (VALUES
      -- (جدول فرزند، ستون کلید خارجی، جدول والد)
      ('Inventory',          'warehouseId', 'Warehouse'),
      ('SaleItem',           'saleId',      'Sale'),
      ('PurchaseItem',       'purchaseId',  'Purchase'),
      ('ProductReturnItem',  'returnId',    'ProductReturn'),
      ('StockCountLine',     'countId',     'StockCount'),
      ('ProductVariant',     'productId',   'Product'),
      ('QuotationItem',      'quotationId', 'Quotation'),
      ('ShipmentItem',       'shipmentId',  'Shipment'),
      ('SalesOrderItem',     'orderId',     'SalesOrder'),
      ('CartItem',           'cartId',      'Cart'),
      ('OnlineOrderItem',    'orderId',     'OnlineOrder'),
      ('RestaurantOrderItem','orderId',     'RestaurantOrder'),
      ('MenuRecipe',         'menuItemId',  'MenuItem'),
      ('JournalLine',        'entryId',     'JournalEntry'),
      ('Installment',        'saleId',      'Sale'),
      ('Payment',            'saleId',      'Sale'),
      ('ContractPayment',    'contractId',  'Contract'),
      ('TicketMessage',      'ticketId',    'Ticket'),
      ('LoanRepayment',      'loanId',      'Loan')
    ) AS t(child, fk, parent)
  LOOP
    -- جدول یا ستونی که در این نصب نیست، بی‌سروصدا رد می‌شود: پروفایل‌های
    -- محصول (فروشگاه/رستوران/سوئیت) جدول‌های متفاوتی دارند.
    CONTINUE WHEN NOT EXISTS (
      SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = target.child
    );
    CONTINUE WHEN NOT EXISTS (
      SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = target.parent
    );
    CONTINUE WHEN NOT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = target.child
         AND column_name = target.fk
    );
    CONTINUE WHEN NOT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = target.parent
         AND column_name = 'companyId'
    );

    -- جدولی که خودش `companyId` دارد سیاست مستقیم ۰۱۳ را گرفته؛ دست نزن.
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = target.child
         AND column_name = 'companyId'
    );

    CONTINUE WHEN EXISTS (
      SELECT 1 FROM pg_policies
       WHERE tablename = target.child AND policyname = 'company_isolation_via_parent'
    );

    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', target.child);

    -- شرط برای USING و WITH CHECK یکی است: خواندن و نوشتن هر دو باید به
    -- والدی محدود شوند که به شرکت جاری تعلق دارد.  اگر WITH CHECK را جا
    -- می‌گذاشتیم، درج سطر زیر فاکتور شرکت دیگر ممکن می‌ماند.
    EXECUTE format($f$
      CREATE POLICY company_isolation_via_parent ON %I
        FOR ALL TO molido_app
        USING (EXISTS (
          SELECT 1 FROM %I parent
           WHERE parent.id = %I.%I
             AND parent."companyId" = NULLIF(current_setting('app.company_id', true), '')
        ))
        WITH CHECK (EXISTS (
          SELECT 1 FROM %I parent
           WHERE parent.id = %I.%I
             AND parent."companyId" = NULLIF(current_setting('app.company_id', true), '')
        ))
    $f$,
      target.child,
      target.parent, target.child, target.fk,
      target.parent, target.child, target.fk);

    RAISE NOTICE 'RLS via parent: % -> %', target.child, target.parent;
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO molido_app;

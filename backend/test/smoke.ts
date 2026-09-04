/**
 * Drives the migrated services against a real PostgreSQL instance to confirm
 * the hand-written SQL parses, binds and returns what the API promised.
 */
import { randomUUID } from 'node:crypto';
import { BarcodeCatalogService } from '../src/catalog/barcode-catalog.service';
import { ShahkarService } from '../src/shahkar/shahkar.service';
import { ShahkarProvider } from '../src/shahkar/shahkar.provider';
import { DatabaseService } from '../src/database/database.service';

async function main() {
  const db = new DatabaseService();
  await db.onModuleInit();

  const companyId = randomUUID();
  const userId = randomUUID();
  await db.query('INSERT INTO "Company" (id, name) VALUES ($1, $2)', [companyId, 'شرکت آزمایشی']);
  await db.query(
    `INSERT INTO "User" (id, "firstName", "lastName", email, password, "companyId")
     VALUES ($1, 'علی', 'رضایی', $2, 'x', $3)`,
    [userId, `${userId}@test.local`, companyId],
  );

  const results: Array<[string, string]> = [];
  const check = async (label: string, run: () => Promise<unknown>) => {
    try {
      await run();
      results.push([label, 'ok']);
    } catch (error) {
      results.push([label, `FAIL ${(error as Error).message}`]);
    }
  };

  const { ProductsService } = await import('../src/products/products.service');
  const { SalesService } = await import('../src/sales/sales.service');
  const { PurchasesService } = await import('../src/purchases/purchases.service');
  const { PricingService } = await import('../src/pricing/pricing.service');
  const { InventoryService } = await import('../src/inventory/inventory.service');
  const { ReportsService } = await import('../src/reports/reports.service');
  const { RestaurantService } = await import('../src/restaurant/restaurant.service');
  const { CashBoxService } = await import('../src/cashbox/cashbox.service');
  const { ChequesService } = await import('../src/cheques/cheques.service');
  const { TreasuryService } = await import('../src/treasury/treasury.service');
  const { PayrollService } = await import('../src/payroll/payroll.service');
  const { AiService } = await import('../src/ai/ai.service');
  const { LlmService } = await import('../src/ai/llm.service');
  const { RationService } = await import('../src/ration/ration.service');
  const { RevenueService } = await import('../src/revenue/revenue.service');
  const { AuditTrailService } = await import('../src/audit-log/audit-trail.service');
  const { NotificationsService } = await import('../src/notifications/notifications.service');
  const { RemindersService } = await import('../src/notifications/reminders.service');
  const { AccountingService } = await import('../src/accounting/accounting.service');
  const { PosTerminalsService } = await import('../src/pos-terminals/pos-terminals.service');
  const { ContractsService } = await import('../src/contracts/contracts.service');
  const { AssetsService } = await import('../src/assets/assets.service');

  /**
   * کد ملیِ **معتبر** می‌سازد، با رقمِ کنترلیِ درست.
   *
   * WARN نسخهٔ اول `String(Date.now()).slice(-10)` می‌نوشت — ده رقم که
   *      تقریباً هیچ‌وقت رقمِ کنترلیِ درستی ندارد.
   *
   *      از ۹ شهریور که `isValidNationalCode` به کالابرگ اضافه شد، این
   *      دو سنجه شکسته بودند و کسی ندید: نگهبانِ نقشه زودتر شکست
   *      می‌خورد و smoke اصلاً اجرا نمی‌شد.
   *
   *      الگوریتم همان `src/shahkar/national-code.ts` است: وزنِ ۱۰ تا ۲
   *      روی نُه رقمِ اول، باقی‌ماندهٔ ۱۱.
   */
  const makeNationalCode = (seed: number): string => {
    const nine = String(seed % 1_000_000_000).padStart(9, '0');
    let sum = 0;
    for (let i = 0; i < 9; i += 1) sum += Number(nine[i]) * (10 - i);
    const remainder = sum % 11;
    const check = remainder < 2 ? remainder : 11 - remainder;
    return `${nine}${check}`;
  };

  const noopN8n = new Proxy({}, { get: () => async () => undefined }) as never;
  // ConfigService خالی: مدل زبانی غیرفعال است و مسیر تحلیل داخلی تست می‌شود
  const emptyConfig = { get: () => undefined } as never;

  const { CashierShiftService } = await import('../src/retail/cashier-shift.service');
  const { PostingService } = await import('../src/accounting/posting.service');

  const auditTrail = new AuditTrailService(db);
  const posting = new PostingService(db);
  const revenue = new RevenueService(db, auditTrail, noopN8n, posting);
  // ⚠️ سرویسِ **واقعیِ** شاهکار، نه بدل.
  //
  //    بدونِ پیکربندی خودش هیچ مسیری را نمی‌بندد، پس رفتارِ smoke
  //    عوض نمی‌شود — ولی اگر روزی `enforce` اشتباه صدا زده شود،
  //    اینجا دیده می‌شود.  بدلِ همیشه-ساکت آن روز را پنهان می‌کرد.
  const shahkar = new ShahkarService(db, new ShahkarProvider(emptyConfig), emptyConfig);
  const ration = new RationService(db, auditTrail, shahkar);
  const shiftService = new CashierShiftService(db, auditTrail);
  const llm = new LlmService(emptyConfig);

  const products = new ProductsService(db, new BarcodeCatalogService(db, emptyConfig));
  const sales = new SalesService(db, noopN8n, shiftService, ration, posting, new PricingService(db), null);
  const purchases = new PurchasesService(db, posting);
  const inventory = new InventoryService(db);
  const reports = new ReportsService(db);
  // WARN این سه سرویس `posting` می‌خواهند، نه `{}`.
  //
  //      بدلِ خالی یعنی `this.posting.postAuto is not a function` — و
  //      بدتر: تا وقتی نگهبانِ نقشه زودتر شکست می‌خورد، این خطا اصلاً
  //      اجرا نمی‌شد و کسی نمی‌دیدش.  یک شکستِ زودهنگام، شش شکستِ
  //      بعدی را پنهان کرده بود.
  //
  //      `posting` بالاتر از قبل ساخته شده؛ فقط به این سه داده نشده بود.
  const restaurant = new RestaurantService(db, noopN8n, shiftService, posting);
  const cashbox = new CashBoxService(db, posting);
  const cheques = new ChequesService(db);
  const treasury = new TreasuryService(db, posting);
  const payroll = new PayrollService(db, posting);
  const ai = new AiService(db, llm);
  // یادآوری‌ها در فیدِ هشدار می‌آیند، پس سرویسش وابستگیِ اعلان است.
  const notifications = new NotificationsService(db, new RemindersService(db));
  const accounting = new AccountingService(db);
  const pos = new PosTerminalsService(db);
  const contracts = new ContractsService(db);
  const assets = new AssetsService(db, posting);

  // ---- catalogue and stock ----
  const warehouseId = randomUUID();
  await db.query(
    'INSERT INTO "Warehouse" (id, "companyId", name, code) VALUES ($1, $2, $3, $4)',
    [warehouseId, companyId, 'انبار مرکزی', `W-${Date.now()}`],
  );

  let productId = '';
  await check('products.create', async () => {
    const product = await products.create(
      {
        name: 'چای',
        sku: `TEA-${Date.now()}`,
        purchasePrice: 100,
        salePrice: 150,
        minStock: 5,
        unit: 'عدد',
      } as never,
      companyId,
    );
    productId = product.id;
  });
  await check('products.findAll (paged)', () =>
    products.findAll(companyId, { search: 'چ', page: 1, limit: 10 }),
  );
  await check('products.findAll (unpaged)', () => products.findAll(companyId));
  await check('products.findOne', () => products.findOne(productId, companyId));
  await check('products.update', () =>
    products.update(productId, { salePrice: 160 } as never, companyId),
  );

  await check('inventory.adjust', () =>
    inventory.adjust(companyId, { productId, warehouseId, quantityChange: 100 }),
  );
  await check('inventory.findAll', () => inventory.findAll(companyId));
  await check('inventory.lowStock', () => inventory.lowStock(companyId));

  // ---- purchase cycle ----
  const supplierId = randomUUID();
  await db.query('INSERT INTO "Supplier" (id, "companyId", name) VALUES ($1, $2, $3)', [
    supplierId,
    companyId,
    'تأمین‌کننده الف',
  ]);
  let purchaseId = '';
  await check('purchases.create', async () => {
    const purchase = await purchases.create(
      { supplierId, warehouseId, items: [{ productId, quantity: 10 }] } as never,
      companyId,
    );
    purchaseId = purchase.id;
  });
  await check('purchases.receive', () => purchases.receive(purchaseId, companyId));
  await check('purchases.findAll', () => purchases.findAll(companyId));
  await check('purchases.findOne', () => purchases.findOne(purchaseId, companyId));

  // ---- sale cycle ----
  const cashBox = await cashbox.create(companyId, { name: 'صندوق ۱', code: `C-${Date.now()}` });
  let saleId = '';
  await check('sales.create', async () => {
    const sale = await sales.create(
      {
        warehouseId,
        items: [{ productId, quantity: 2 }],
        paidAmount: 100,
        cashBoxId: cashBox.id,
      } as never,
      companyId,
      userId,
    );
    saleId = sale.id;
  });
  await check('sales.findAll (paged)', () => sales.findAll(companyId, { page: 1, limit: 5 }));
  await check('sales.findOne', () => sales.findOne(saleId, companyId));
  await check('sales.printInvoice', () => sales.printInvoice(saleId, companyId));
  await check('sales.createInstallments', () =>
    sales.createInstallments(saleId, companyId, { count: 3 }),
  );
  await check('sales.listInstallments', () => sales.listInstallments(saleId, companyId));
  await check('sales.cancel', () => sales.cancel(saleId, companyId));

  await check('cashbox.deposit', () => cashbox.deposit(cashBox.id, companyId, 500));
  await check('cashbox.withdraw', () => cashbox.withdraw(cashBox.id, companyId, 100));
  await check('cashbox.findAll', () => cashbox.findAll(companyId));
  await check('cashbox.findOne', () => cashbox.findOne(cashBox.id, companyId));

  // ---- reports and analysis ----
  await check('reports.dashboard', () => reports.dashboard(companyId));
  await check('reports.salesReport', () => reports.salesReport(companyId));
  await check('reports.profitReport', () => reports.profitReport(companyId));
  await check('reports.topProducts', () => reports.topProducts(companyId));
  await check('reports.purchasesReport', () => reports.purchasesReport(companyId));
  await check('reports.inventoryReport', () => reports.inventoryReport(companyId));
  await check('reports.salesReportCsv', () => reports.salesReportCsv(companyId));
  await check('reports.inventoryReportCsv', () => reports.inventoryReportCsv(companyId));

  await check('accounting.summary', () => accounting.summary(companyId));
  await check('accounting.createAccount', () =>
    accounting.createAccount(companyId, { name: 'نقد', code: `10-${Date.now()}`, type: 'ASSET' }),
  );
  await check('accounting.findAllAccounts', () => accounting.findAllAccounts(companyId));

  await check('ai.salesAnalysis', () => ai.salesAnalysis(companyId));
  await check('ai.inventoryAnalysis', () => ai.inventoryAnalysis(companyId));
  await check('ai.priceSuggestions', () => ai.priceSuggestions(companyId));
  await check('ai.expiryAnalysis', () => ai.expiryAnalysis(companyId));
  await check('ai.managerReport', () => ai.managerReport(companyId));

  await check('notifications.getAllAlerts', () => notifications.getAllAlerts(companyId));
  await check('notifications.getRecentSalesAlerts', () =>
    notifications.getRecentSalesAlerts(companyId),
  );

  // ---- finance ----
  await check('cheques.create+stats', async () => {
    await cheques.create(companyId, {
      chequeNo: `CH-${Date.now()}`,
      dueDate: new Date().toISOString(),
      amount: 1000,
    });
    await cheques.findAll(companyId, { dueSoon: true });
    await cheques.stats(companyId);
  });
  await check('treasury flow', async () => {
    const account = await treasury.createAccount(companyId, { name: 'بانک', openingBalance: 1000 });
    const other = await treasury.createAccount(companyId, { name: 'بانک ۲' });
    await treasury.createTransaction(companyId, {
      accountId: account.id,
      type: 'DEPOSIT',
      amount: 500,
    });
    await treasury.transfer(companyId, {
      fromAccountId: account.id,
      toAccountId: other.id,
      amount: 200,
    });
    await treasury.findTransactions(companyId, { accountId: account.id });
    await treasury.findOneAccount(account.id, companyId);
    await treasury.stats(companyId);
  });
  await check('payroll flow', async () => {
    const employee = await payroll.createEmployee(companyId, {
      employeeNo: `E-${Date.now()}`,
      firstName: 'مریم',
      lastName: 'احمدی',
      baseSalary: 10_000_000,
    });
    const slip = await payroll.createSlip(companyId, {
      employeeId: employee.id,
      period: '2026-08',
      overtimeHours: 10,
    });
    await payroll.approveSlip(slip.id, companyId);
    await payroll.paySlip(slip.id, companyId);
    await payroll.findSlips(companyId, { period: '2026-08' });
    await payroll.findOneEmployee(employee.id, companyId);
    await payroll.findAllEmployees(companyId, { search: 'مریم', onlyActive: true });
    await payroll.stats(companyId);
  });
  await check('contracts flow', async () => {
    const contract = await contracts.create(companyId, {
      contractNo: `CT-${Date.now()}`,
      title: 'پیمان',
      partyName: 'شرکت ب',
      amount: 5000,
      endDate: new Date().toISOString(),
    });
    const payment = await contracts.addPayment(contract.id, companyId, {
      amount: 500,
      dueDate: new Date().toISOString(),
    });
    await contracts.payPayment(payment.id, companyId);
    await contracts.update(contract.id, companyId, { title: 'پیمان ۲' });
    await contracts.updateStatus(contract.id, companyId, 'ACTIVE');
    await contracts.findAll(companyId, { expiringSoon: true, search: 'پیمان' });
    await contracts.findOne(contract.id, companyId);
    await contracts.stats(companyId);
  });

  // ---- restaurant ----
  await check('restaurant flow', async () => {
    const area = (await restaurant.createArea(companyId, { name: 'سالن ۱' })) as { id: string };
    const table = (await restaurant.createTable(companyId, {
      areaId: area.id,
      tableNo: '1',
      capacity: 4,
    })) as { id: string };
    const category = (await restaurant.createMenuCategory(companyId, {
      name: 'نوشیدنی',
    })) as { id: string };
    const item = (await restaurant.createMenuItem(companyId, {
      categoryId: category.id,
      name: 'چای',
      price: 50_000,
      station: 'BAR',
    } as never)) as { id: string };

    await restaurant.setRecipe(companyId, item.id, {
      lines: [{ productId, qty: 1, unit: 'gr', wastePct: 5 }],
    } as never);
    await restaurant.recipe(companyId, item.id);
    await restaurant.menu(companyId);
    await restaurant.menuItems(companyId, { search: 'چ' });
    await restaurant.tables(companyId, { areaId: area.id });
    await restaurant.areas(companyId);
    await restaurant.menuCategories(companyId);

    const order = (await restaurant.createOrder(companyId, userId, {
      tableId: table.id,
      items: [{ menuItemId: item.id, qty: 2 }],
      servicePercent: 10,
      taxPercent: 9,
    } as never)) as { id: string };

    await restaurant.addItems(companyId, order.id, {
      items: [{ menuItemId: item.id, qty: 1 }],
    } as never);
    await restaurant.sendToKitchen(companyId, order.id);
    const board = (await restaurant.kitchenBoard(companyId)) as unknown as Array<{
      id: string;
    }>;
    await restaurant.setItemStatus(companyId, board[0].id, 'READY');
    await restaurant.order(companyId, order.id);
    await restaurant.orders(companyId, { open: 'true' });
    await restaurant.printReceipt(companyId, order.id);
    await restaurant.settle(companyId, order.id, {
      paidAmount: 1_000_000,
      warehouseId,
      cashBoxId: cashBox.id,
      tipAmount: 1000,
    } as never);
    await restaurant.topItems(companyId, {});
    await restaurant.stats(companyId);

    const reservation = (await restaurant.createReservation(companyId, {
      tableId: table.id,
      customerName: 'سارا',
      reservedAt: new Date(Date.now() + 86400_000).toISOString(),
    })) as { id: string };
    await restaurant.updateReservation(companyId, reservation.id, { status: 'CONFIRMED' });
    await restaurant.reservations(companyId, {});

    const shift = (await restaurant.openShift(companyId, userId, {})) as { id: string };
    await restaurant.closeShift(companyId, shift.id, { closingCash: 100 });
    await restaurant.shifts(companyId);
    await restaurant.toggleAvailability(companyId, item.id);
  });

  // ⚠️ آزمون‌های شهرداری، دفتر فنی و آتش‌نشانی برداشته شدند.
  //
  //    سه گروهِ قابلیت (`municipal`، `verticals`، `operations`) به
  //    درخواستِ صاحبِ محصول حذف شدند — مهاجرت ۰۵۶ جدول‌هایشان را هم
  //    برد.  نگه داشتنِ آزمونی که ماژولش وجود ندارد یعنی خطای
  //    ساختِ ماژول، نه شکستِ مفید.

  await check('pos-terminals flow', async () => {
    const terminal = await pos.create(companyId, {
      terminalNo: `T-${Date.now()}`,
      bankName: 'بانک ملت',
      cashBoxId: cashBox.id,
    });
    await pos.update(terminal.id, companyId, { location: 'صندوق اصلی' });
    await pos.updateStatus(terminal.id, companyId, 'UNDER_REPAIR');
    await pos.findAll(companyId, { search: 'T-' });
    await pos.findOne(terminal.id, companyId);
    await pos.stats(companyId);
    await pos.remove(terminal.id, companyId);
  });

  // ---- retail: scan, weighed goods, cashier shift, split tender ----
  await check('retail: full supermarket cycle', async () => {
    const { ScanService } = await import('../src/retail/scan.service');
    const { buildScaleBarcode } = await import('../src/retail/barcode');

    const shifts = shiftService;
    const scanner = new ScanService(db);
    const posSales = new SalesService(db, noopN8n, shifts, ration, posting, new PricingService(db), null);

    // --- کالای شمارشی با بارکد ---
    const barcode = '4006381333931';
    const boxed = await products.create(
      {
        name: 'نوشابه',
        sku: `COLA-${Date.now()}`,
        barcode,
        purchasePrice: 8_000,
        salePrice: 12_000,
        unit: 'عدد',
        minStock: 5,
      } as never,
      companyId,
    );

    // --- کالای وزنی با کد ترازو ---
    const scaleCode = '54321';
    const weighed = await products.create(
      {
        name: 'گوشت گوساله',
        sku: `MEAT-${Date.now()}`,
        purchasePrice: 800_000,
        salePrice: 1_200_000,
        unit: 'کیلوگرم',
        minStock: 1,
        isWeighed: true,
        scaleCode,
      } as never,
      companyId,
    );

    await inventory.adjust(companyId, {
      productId: boxed.id,
      warehouseId,
      quantityChange: 100,
    });
    await inventory.adjust(companyId, {
      productId: weighed.id,
      warehouseId,
      quantityChange: 50,
    });

    // --- اسکن بارکد معمولی ---
    const scanned = await scanner.scan(companyId, barcode, { warehouseId });
    if (scanned.source !== 'BARCODE') throw new Error(`expected BARCODE, got ${scanned.source}`);
    if (scanned.quantity !== 1) throw new Error('boxed item should scan as one unit');
    if (scanned.available !== 100) throw new Error(`stock ${scanned.available}, expected 100`);

    // --- اسکن برچسب ترازو: ۱٫۲۵۰ کیلوگرم ---
    const label = buildScaleBarcode(scaleCode, 1.25);
    const weighedScan = await scanner.scan(companyId, label, { warehouseId });
    if (weighedScan.source !== 'SCALE') throw new Error('scale label not recognised');
    if (Math.abs(weighedScan.quantity - 1.25) > 0.001) {
      throw new Error(`weight ${weighedScan.quantity}, expected 1.25`);
    }
    if (weighedScan.lineTotal !== 1_500_000) {
      throw new Error(`line total ${weighedScan.lineTotal}, expected 1500000`);
    }

    // --- اسکن با SKU ---
    const bySku = await scanner.scan(companyId, boxed.sku as string, { warehouseId });
    if (bySku.source !== 'SKU') throw new Error('SKU lookup failed');

    // --- کد ناموجود باید خطا بدهد ---
    let missingFound = false;
    try {
      await scanner.scan(companyId, 'NO-SUCH-CODE');
      missingFound = true;
    } catch {
      // expected
    }
    if (missingFound) throw new Error('unknown code did not raise');

    // --- باز کردن شیفت ---
    const shift = await shifts.open(companyId, userId, {
      cashBoxId: cashBox.id,
      warehouseId,
      openingCash: 500_000,
    });

    // یک صندوق‌دار نباید دو شیفت باز داشته باشد
    let doubleOpen = false;
    try {
      await shifts.open(companyId, userId, { cashBoxId: cashBox.id });
      doubleOpen = true;
    } catch {
      // expected
    }
    if (doubleOpen) throw new Error('a second shift was opened for the same cashier');

    // --- فروش با تسویهٔ نقد + کارت ---
    const sale = await posSales.create(
      {
        warehouseId,
        items: [
          { productId: boxed.id, quantity: 2 },
          { productId: weighed.id, quantity: 1.25 },
        ],
        payments: [
          { method: 'CASH', amount: 500_000, cashBoxId: cashBox.id },
          { method: 'CARD', amount: 1_024_000, cashBoxId: cashBox.id },
        ],
      } as never,
      companyId,
      userId,
    );

    if (sale.status !== 'PAID') throw new Error(`sale status ${sale.status}, expected PAID`);
    const [saleRow] = await db.query<{ shiftId: string | null }>(
      'SELECT "shiftId" FROM "Sale" WHERE id = $1',
      [sale.id],
    );
    if (saleRow?.shiftId !== shift.id) {
      throw new Error('sale was not bound to the open shift');
    }

    // --- پرداخت بیش از مبلغ فاکتور باید رد شود ---
    let overpaid = false;
    try {
      await posSales.create(
        {
          warehouseId,
          items: [{ productId: boxed.id, quantity: 1 }],
          payments: [{ method: 'CASH', amount: 999_999_999, cashBoxId: cashBox.id }],
        } as never,
        companyId,
        userId,
      );
      overpaid = true;
    } catch {
      // expected
    }
    if (overpaid) throw new Error('an overpayment was accepted');

    // --- گزارش زندهٔ شیفت ---
    const live = await shifts.findOne(companyId, shift.id);
    if (live.live.cashTotal !== 500_000) {
      throw new Error(`shift cash ${live.live.cashTotal}, expected 500000`);
    }
    if (live.live.cardTotal !== 1_024_000) {
      throw new Error(`shift card ${live.live.cardTotal}, expected 1024000`);
    }
    if (live.live.expectedCash !== 1_000_000) {
      throw new Error(`expected cash ${live.live.expectedCash}, expected 1000000`);
    }

    // --- بستن شیفت با کسری عمدی ---
    const closed = await shifts.close(companyId, shift.id, userId, {
      countedCash: 990_000,
      note: 'کسری صندوق',
    });
    if (Number(closed.difference) !== -10_000) {
      throw new Error(`difference ${closed.difference}, expected -10000`);
    }
    if (Number(closed.salesCount) !== 1) {
      throw new Error(`shift sales count ${closed.salesCount}, expected 1`);
    }

    // بستن دوباره ممکن نیست
    let closedTwice = false;
    try {
      await shifts.close(companyId, shift.id, userId, {});
      closedTwice = true;
    } catch {
      // expected
    }
    if (closedTwice) throw new Error('shift was closed twice');

    // --- موجودی وزنی باید اعشاری کسر شده باشد ---
    const stock = await db.query<{ quantity: string }>(
      'SELECT quantity FROM "Inventory" WHERE "productId" = $1 AND "warehouseId" = $2',
      [weighed.id, warehouseId],
    );
    if (Math.abs(Number(stock[0].quantity) - 48.75) > 0.001) {
      throw new Error(`weighed stock ${stock[0].quantity}, expected 48.75`);
    }
  });

  // ⚠️ دو آزمونِ درآمد که با «قبضِ شهرداری» کار می‌کردند برداشته شدند.
  //
  //    خودِ لایهٔ درآمد می‌ماند و آزمونش هم — بلوکِ بعدی مقصدِ نامعتبر
  //    و مبلغِ منفی را می‌سنجد و به هیچ ماژولِ حذف‌شده‌ای وابسته نیست.
  //
  //    آنچه رفت، فقط **وسیلهٔ** آزمون بود: `MunicipalBill` دیگر وجود
  //    ندارد (مهاجرت ۰۵۶).  اگر روزی زیرسامانهٔ دیگری بخواهد از
  //    `revenue.collect` استفاده کند، آزمونِ زنجیرهٔ کامل با همان
  //    ساخته می‌شود.

  await check('revenue: rejects bad destination', async () => {
    let accepted = false;
    try {
      // neither a cash box nor a treasury account
      await revenue.collect(companyId, {
        entityType: 'SmokeTest',
        entityId: randomUUID(),
        amount: 100,
      });
      accepted = true;
    } catch {
      // expected
    }
    if (accepted) throw new Error('collect accepted a payment with no destination');

    let negativeAccepted = false;
    try {
      await revenue.collect(companyId, {
        entityType: 'SmokeTest',
        entityId: randomUUID(),
        amount: -5,
        cashBoxId: cashBox.id,
      });
      negativeAccepted = true;
    } catch {
      // expected
    }
    if (negativeAccepted) throw new Error('collect accepted a negative amount');
  });

  // ---- generated BaseCrudService path ----
  // ---- دارایی ثابت و استهلاک ----
  await check('assets: create + depreciation + dispose', async () => {
    const asset = await assets.create(companyId, {
      assetNo: `A-${Date.now()}`,
      name: 'میز اداری',
      purchasePrice: 12_000_000,
      salvageValue: 0,
      usefulLifeYears: 5,
      inServiceDate: '2020-01-01',
    });

    const id = asset.id as string;
    await assets.findAll(companyId);
    await assets.findOne(companyId, id);
    await assets.update(companyId, id, { name: 'میز مدیریت' });

    // ۱۲٬۰۰۰٬۰۰۰ در ۵ سال ⇒ ماهانه ۲۰۰٬۰۰۰
    const run = await assets.runDepreciation(companyId, userId, '2026-03-01');
    if (run.total <= 0) throw new Error('استهلاک ثبت نشد');

    // اجرای دوباره برای همان ماه نباید چیزی اضافه کند
    const again = await assets.runDepreciation(companyId, userId, '2026-03-01');
    if (again.total !== 0) throw new Error('استهلاک تکراری ثبت شد');

    await assets.stats(companyId);
    await assets.dispose(companyId, userId, id, { proceeds: 1_000_000 });
  });


  // ---- دریافت وجه مشترک ----

  // ---- کالابرگ ----
  await check('ration flow', async () => {
    const nationalCode = makeNationalCode(Date.now());
    const account = await ration.create(companyId, {
      nationalCode,
      holderName: 'خانوار آزمایشی',
      householdSize: 4,
    });

    await ration.allocate(companyId, account.id, {
      amount: 5_000_000,
      periodCode: `T-${Date.now()}`,
    });

    // کالای مشمول با قیمت مصوب
    await db.query(
      `UPDATE "Product" SET "isRationEligible" = true, "rationPrice" = 100
       WHERE id = $1`,
      [productId],
    );

    const eligibility = await ration.eligibility(companyId, [
      { productId, quantity: 3 },
    ]);
    if (eligibility.eligibleTotal !== 300) {
      throw new Error(`سهم مشمول اشتباه است: ${eligibility.eligibleTotal}`);
    }

    const sale = await sales.create(
      {
        warehouseId,
        items: [{ productId, quantity: 3 }],
        rationAccountId: account.id,
      } as never,
      companyId,
      userId,
    );

    const afterSpend = await ration.findOne(companyId, account.id);
    if (Number(afterSpend.balance) !== 5_000_000 - 300) {
      throw new Error(`مانده پس از خرید اشتباه است: ${afterSpend.balance}`);
    }

    // لغو فاکتور باید اعتبار را برگرداند
    await sales.cancel(sale.id, companyId);
    const afterReverse = await ration.findOne(companyId, account.id);
    if (Number(afterReverse.balance) !== 5_000_000) {
      throw new Error(`اعتبار پس از لغو برنگشت: ${afterReverse.balance}`);
    }

    await ration.findByNationalCode(companyId, nationalCode);
    await ration.findAll(companyId, { search: nationalCode });
    await ration.settlementReport(companyId);
  });

  await check('ration: خرید بیش از اعتبار رد می‌شود', async () => {
    const nationalCode = makeNationalCode(Date.now() + 1);
    const account = await ration.create(companyId, { nationalCode });
    await ration.allocate(companyId, account.id, {
      amount: 100,
      periodCode: `T-${Date.now()}-low`,
    });

    let rejected = false;
    try {
      await sales.create(
        {
          warehouseId,
          items: [{ productId, quantity: 5 }],
          rationAccountId: account.id,
        } as never,
        companyId,
        userId,
      );
    } catch {
      rejected = true;
    }
    if (!rejected) throw new Error('برداشت بیش از اعتبار رد نشد');
  });

  // ---- تحلیل‌های فروشگاهی ----
  await check('ai.reorderSuggestions', () => ai.reorderSuggestions(companyId));
  await check('ai.deadStock', () => ai.deadStock(companyId));
  await check('ai.cashierAnomalies', () => ai.cashierAnomalies(companyId));
  await check('ai.salesForecast', () => ai.salesForecast(companyId));

  await db.onModuleDestroy();

  const failures = results.filter(([, status]) => status !== 'ok');
  for (const [label, status] of results) {
    console.log(`${status === 'ok' ? 'PASS' : 'FAIL'}  ${label}${status === 'ok' ? '' : ` — ${status}`}`);
  }
  console.log(`\n${results.length - failures.length}/${results.length} checks passed`);
  if (failures.length) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

/**
 * تست دفتر کل روی PostgreSQL واقعی
 *
 *   DATABASE_URL=... npm run test:ledger
 *
 * قواعد حسابداری در سطح دیتابیس اعمال می‌شوند (تریگرهای
 * `007_general_ledger.sql`)؛ اینجا سنجیده می‌شود که `PostingService` و
 * `LedgerService` هم درست از آن‌ها استفاده می‌کنند و گزارش‌ها با هم می‌خوانند.
 */
import { randomUUID } from 'node:crypto';
import { ShahkarService } from '../src/shahkar/shahkar.service';
import { ShahkarProvider } from '../src/shahkar/shahkar.provider';
import process from 'node:process';
import { DatabaseService } from '../src/database/database.service';
import { LedgerService } from '../src/accounting/ledger.service';
import { PostingService } from '../src/accounting/posting.service';

let passed = 0;
let failed = 0;

function step(label: string, detail = '') {
  passed += 1;
  console.log(`  ✅ ${label}${detail ? ` — ${detail}` : ''}`);
}

function fail(label: string, error: unknown) {
  failed += 1;
  console.log(`  ❌ ${label} — ${error instanceof Error ? error.message : String(error)}`);
}

function expect(label: string, actual: unknown, wanted: unknown) {
  if (Math.abs(Number(actual) - Number(wanted)) < 0.005) {
    step(label, String(Number(actual).toLocaleString('fa-IR')));
  } else {
    fail(label, `انتظار ${wanted} بود، ${actual} دریافت شد`);
  }
}

async function rejects(label: string, run: () => Promise<unknown>) {
  try {
    await run();
    fail(label, 'رد نشد!');
  } catch {
    step(label);
  }
}

async function main(): Promise<void> {
  const db = new DatabaseService();
  await db.onModuleInit();

  const posting = new PostingService(db);
  const ledger = new LedgerService(db, posting);

  console.log('\n  📒 تست دفتر کل\n');

  // ---------- شرکت آزمایشی مستقل ----------
  // شرکت جدا ساخته می‌شود تا گزارش‌ها با دادهٔ seed قاطی نشوند و ادعاهای عددی
  // دقیق باقی بمانند.
  const companyId = randomUUID();
  await db.query('INSERT INTO "Company" (id, name) VALUES ($1, $2)', [
    companyId,
    'شرکت آزمون دفتر',
  ]);

  const accounts: Array<[string, string, string]> = [
    ['1101', 'صندوق', 'ASSET'],
    ['1103', 'حساب‌های دریافتنی', 'ASSET'],
    ['1104', 'موجودی کالا', 'ASSET'],
    ['2101', 'حساب‌های پرداختنی', 'LIABILITY'],
    ['3101', 'سرمایه', 'EQUITY'],
    ['4101', 'فروش کالا', 'REVENUE'],
    ['5101', 'بهای تمام‌شدهٔ کالای فروش‌رفته', 'EXPENSE'],
    ['5202', 'اجاره', 'EXPENSE'],
  ];

  for (const [code, name, type] of accounts) {
    await db.query(
      'INSERT INTO "Account" (id, "companyId", code, name, type) VALUES ($1, $2, $3, $4, $5)',
      [randomUUID(), companyId, code, name, type],
    );
  }

  // حساب کل غیرقابل ثبت، برای آزمودن کنترل
  await db.query(
    `INSERT INTO "Account" (id, "companyId", code, name, type, "isPostable")
     VALUES ($1, $2, '1000', 'دارایی‌ها', 'ASSET', false)`,
    [randomUUID(), companyId],
  );

  const year = new Date().getFullYear();
  await db.query(
    `INSERT INTO "FiscalYear" (id, "companyId", code, "startsOn", "endsOn")
     VALUES ($1, $2, $3, $4, $5)`,
    [randomUUID(), companyId, String(year), `${year}-01-01`, `${year}-12-31`],
  );
  step('شرکت، کدینگ حساب و سال مالی ساخته شد');

  // ---------- سرمایهٔ اولیه ----------

  await posting.post(companyId, {
    sourceType: 'MANUAL',
    description: 'آوردهٔ نقدی مالک',
    lines: [
      { accountCode: '1101', debit: 100_000_000 },
      { accountCode: '3101', credit: 100_000_000 },
    ],
  });
  step('سند سرمایهٔ اولیه');

  // ---------- خرید نسیه ----------

  await posting.post(companyId, {
    sourceType: 'Purchase',
    sourceId: 'purchase-1',
    description: 'خرید کالا از تأمین‌کننده',
    lines: [
      { accountCode: '1104', debit: 30_000_000 },
      { accountCode: '2101', credit: 30_000_000 },
    ],
  });
  step('سند خرید نسیه');

  // یک سند مبنا دو بار ثبت نمی‌شود
  await rejects('ثبت دوبارهٔ یک فاکتور خرید رد شد', () =>
    posting.post(companyId, {
      sourceType: 'Purchase',
      sourceId: 'purchase-1',
      description: 'تکراری',
      lines: [
        { accountCode: '1104', debit: 30_000_000 },
        { accountCode: '2101', credit: 30_000_000 },
      ],
    }),
  );

  // ---------- فروش نقدی با بهای تمام‌شده ----------

  await posting.post(companyId, {
    sourceType: 'Sale',
    sourceId: 'sale-1',
    description: 'فروش نقدی',
    lines: [
      { accountCode: '1101', debit: 25_000_000 },
      { accountCode: '4101', credit: 25_000_000 },
    ],
  });

  await posting.post(companyId, {
    sourceType: 'Sale',
    sourceId: 'sale-1-cogs',
    description: 'بهای تمام‌شدهٔ کالای فروش‌رفته',
    lines: [
      { accountCode: '5101', debit: 15_000_000 },
      { accountCode: '1104', credit: 15_000_000 },
    ],
  });
  step('سند فروش و بهای تمام‌شده');

  // ---------- هزینه ----------

  await posting.post(companyId, {
    sourceType: 'Expense',
    sourceId: 'expense-1',
    description: 'اجارهٔ ماهانه',
    lines: [
      { accountCode: '5202', debit: 5_000_000 },
      { accountCode: '1101', credit: 5_000_000 },
    ],
  });
  step('سند هزینهٔ اجاره');

  // ---------- ورودی نامعتبر ----------

  await rejects('سند نامتوازن رد شد', () =>
    posting.post(companyId, {
      sourceType: 'MANUAL',
      description: 'نامتوازن',
      lines: [
        { accountCode: '1101', debit: 1000 },
        { accountCode: '4101', credit: 999 },
      ],
    }),
  );

  await rejects('سند روی حساب کل رد شد', () =>
    posting.post(companyId, {
      sourceType: 'MANUAL',
      description: 'حساب کل',
      lines: [
        { accountCode: '1000', debit: 1000 },
        { accountCode: '4101', credit: 1000 },
      ],
    }),
  );

  await rejects('حساب ناموجود رد شد', () =>
    posting.post(companyId, {
      sourceType: 'MANUAL',
      description: 'حساب ناموجود',
      lines: [
        { accountCode: '9999', debit: 1000 },
        { accountCode: '4101', credit: 1000 },
      ],
    }),
  );

  await rejects('سند با مبلغ صفر رد شد', () =>
    posting.post(companyId, {
      sourceType: 'MANUAL',
      description: 'صفر',
      lines: [
        { accountCode: '1101', debit: 0 },
        { accountCode: '4101', credit: 0 },
      ],
    }),
  );

  // ---------- تراز آزمایشی ----------

  const trial = await ledger.trialBalance(companyId);
  if (trial.balanced) step('تراز آزمایشی متوازن است');
  else fail('تراز آزمایشی', `بدهکار ${trial.totals.debit} ≠ بستانکار ${trial.totals.credit}`);

  // ۱۰۰م سرمایه + ۳۰م خرید + ۲۵م فروش + ۱۵م بهای تمام‌شده + ۵م اجاره
  expect('جمع گردش بدهکار', trial.totals.debit, 175_000_000);

  // ---------- دفتر معین صندوق ----------

  const cash = await ledger.accountLedger(companyId, '1101');
  // ۱۰۰م آورده + ۲۵م فروش − ۵م اجاره
  expect('ماندهٔ صندوق', cash.closing, 120_000_000);
  expect('تعداد گردش صندوق', cash.movements.length, 3);

  // ---------- صورت سود و زیان ----------

  const income = await ledger.incomeStatement(companyId);
  expect('درآمد', income.totalRevenue, 25_000_000);
  expect('هزینه', income.totalExpense, 20_000_000);
  expect('سود دوره', income.netIncome, 5_000_000);

  // ---------- ترازنامه ----------

  const sheet = await ledger.balanceSheet(companyId);
  // صندوق ۱۲۰م + موجودی کالا ۱۵م
  expect('جمع دارایی', sheet.totalAssets, 135_000_000);
  expect('جمع بدهی', sheet.totalLiabilities, 30_000_000);
  expect('جمع سرمایه', sheet.totalEquity, 100_000_000);

  if (sheet.balanced) step('ترازنامه تراز است (دارایی = بدهی + سرمایه + سود)');
  else fail('ترازنامه', 'تراز نیست');

  // ---------- سند معکوس ----------

  const entries = await ledger.entries(companyId, { sourceType: 'Expense' });
  const expenseEntry = entries[0] as { id: string };

  await posting.reverse(companyId, expenseEntry.id, 'اجاره اشتباه ثبت شده بود');
  step('سند اجاره خنثی شد');

  await rejects('خنثی کردن دوبارهٔ یک سند رد شد', () =>
    posting.reverse(companyId, expenseEntry.id),
  );

  const afterReverse = await ledger.incomeStatement(companyId);
  expect('هزینه پس از برگشت', afterReverse.totalExpense, 15_000_000);
  expect('سود پس از برگشت', afterReverse.netIncome, 10_000_000);

  const cashAfter = await ledger.accountLedger(companyId, '1101');
  expect('ماندهٔ صندوق پس از برگشت', cashAfter.closing, 125_000_000);

  const trialAfter = await ledger.trialBalance(companyId);
  if (trialAfter.balanced) step('تراز پس از سند معکوس همچنان متوازن است');
  else fail('تراز پس از برگشت', 'نامتوازن شد');

  // ---------- بستن سال مالی ----------

  const years = await ledger.fiscalYears(companyId);
  await ledger.closeFiscalYear(companyId, years[0].id);
  step('سال مالی بسته شد');

  await rejects('سند در سال بسته رد شد', () =>
    posting.post(companyId, {
      sourceType: 'MANUAL',
      description: 'پس از بستن سال',
      lines: [
        { accountCode: '1101', debit: 1000 },
        { accountCode: '4101', credit: 1000 },
      ],
    }),
  );

  await rejects('بستن دوبارهٔ سال مالی رد شد', () =>
    ledger.closeFiscalYear(companyId, years[0].id),
  );


  // ═══════════ ثبت خودکار از عملیات ═══════════
  //
  // مهم‌ترین بخش: سند باید از خود فروش و خرید بیاید، نه دست‌نویس.  شرکت
  // جداگانه‌ای با کدینگ کامل ساخته می‌شود تا ادعاهای عددی دقیق بمانند.

  const { SalesService } = await import('../src/sales/sales.service');
  const { PurchasesService } = await import('../src/purchases/purchases.service');
  const { PricingService } = await import('../src/pricing/pricing.service');
  const { CashierShiftService } = await import('../src/retail/cashier-shift.service');
  const { RationService } = await import('../src/ration/ration.service');
  const { AuditTrailService } = await import('../src/audit-log/audit-trail.service');

  const noop = new Proxy({}, { get: () => async () => undefined }) as never;
  const audit = new AuditTrailService(db);
  const shifts = new CashierShiftService(db, audit);
  // سرویسِ واقعیِ شاهکار بدونِ پیکربندی — هیچ مسیری را نمی‌بندد.
  const emptyConfig = { get: () => undefined } as never;
  const rationSvc = new RationService(
    db,
    audit,
    new ShahkarService(db, new ShahkarProvider(emptyConfig), emptyConfig),
  );
  const sales = new SalesService(db, noop, shifts, rationSvc, posting, new PricingService(db), null);
  const purchases = new PurchasesService(db, posting);

  const autoCo = randomUUID();
  await db.query('INSERT INTO "Company" (id, name, "ledgerEnabled") VALUES ($1, $2, true)', [
    autoCo,
    'شرکت ثبت خودکار',
  ]);

  const autoAccounts: Array<[string, string, string]> = [
    ['1101', 'صندوق', 'ASSET'],
    ['1102', 'بانک', 'ASSET'],
    ['1103', 'حساب‌های دریافتنی', 'ASSET'],
    ['1104', 'موجودی کالا', 'ASSET'],
    ['1105', 'اسناد دریافتنی', 'ASSET'],
    ['1106', 'مالیات خرید', 'ASSET'],
    ['2101', 'حساب‌های پرداختنی', 'LIABILITY'],
    ['2103', 'مالیات بر ارزش افزوده', 'LIABILITY'],
    ['4101', 'فروش کالا', 'REVENUE'],
    ['4102', 'تخفیفات فروش', 'REVENUE'],
    ['4104', 'سایر درآمدها', 'REVENUE'],
    ['5101', 'بهای تمام‌شده', 'EXPENSE'],
    ['5299', 'سایر هزینه‌ها', 'EXPENSE'],
  ];
  for (const [code, name, type] of autoAccounts) {
    await db.query(
      'INSERT INTO "Account" (id, "companyId", code, name, type) VALUES ($1, $2, $3, $4, $5)',
      [randomUUID(), autoCo, code, name, type],
    );
  }
  await db.query(
    `INSERT INTO "FiscalYear" (id, "companyId", code, "startsOn", "endsOn")
     VALUES ($1, $2, $3, $4, $5)`,
    [randomUUID(), autoCo, String(year), `${year}-01-01`, `${year}-12-31`],
  );

  const autoUser = randomUUID();
  await db.query(
    `INSERT INTO "User" (id, "firstName", "lastName", email, password, "companyId")
     VALUES ($1, 'صندوق', 'دار', $2, 'x', $3)`,
    [autoUser, `${autoUser}@t.local`, autoCo],
  );

  const warehouseId = randomUUID();
  await db.query(
    'INSERT INTO "Warehouse" (id, "companyId", name, code) VALUES ($1, $2, $3, $4)',
    [warehouseId, autoCo, 'انبار', `W-${Date.now()}`],
  );

  const cashBoxId = randomUUID();
  await db.query(
    'INSERT INTO "CashBox" (id, "companyId", name, code) VALUES ($1, $2, $3, $4)',
    [cashBoxId, autoCo, 'صندوق', `C-${Date.now()}`],
  );

  const productId = randomUUID();
  await db.query(
    `INSERT INTO "Product" (id, "companyId", name, sku, unit, "purchasePrice", "salePrice")
     VALUES ($1, $2, 'کالای تست', $3, 'عدد', 600, 1000)`,
    [productId, autoCo, `SKU-${Date.now()}`],
  );
  step('شرکت با ثبت خودکار روشن آماده شد');

  // ---------- خرید: ثبت سفارش سند نمی‌زند ----------

  const purchase = await purchases.create(
    {
      supplierId: await (async () => {
        const supplierId = randomUUID();
        await db.query(
          'INSERT INTO "Supplier" (id, "companyId", name) VALUES ($1, $2, $3)',
          [supplierId, autoCo, 'تأمین‌کننده'],
        );
        return supplierId;
      })(),
      warehouseId,
      items: [{ productId, quantity: 100 }],
      tax: 0,
    } as never,
    autoCo,
  );

  const afterOrder = await ledger.trialBalance(autoCo);
  expect('ثبت سفارش خرید سند نمی‌زند', afterOrder.accounts.length, 0);

  // ---------- دریافت کالا: سند می‌خورد ----------

  await purchases.receive(purchase.id, autoCo);

  const afterReceive = await ledger.accountLedger(autoCo, '1104');
  expect('موجودی کالا پس از دریافت', afterReceive.closing, 60_000);

  const payable = await ledger.accountLedger(autoCo, '2101');
  expect('بدهی به تأمین‌کننده', payable.closing, 60_000);

  // ---------- فروش نقدی: سند فروش و بهای تمام‌شده ----------

  const sale = await sales.create(
    {
      warehouseId,
      items: [{ productId, quantity: 10 }],
      payments: [{ method: 'CASH', amount: 10_000, cashBoxId }],
    } as never,
    autoCo,
    autoUser,
  );

  const cashLedger = await ledger.accountLedger(autoCo, '1101');
  expect('صندوق پس از فروش نقدی', cashLedger.closing, 10_000);

  const revenueLedger = await ledger.accountLedger(autoCo, '4101');
  expect('درآمد فروش', revenueLedger.closing, 10_000);

  const cogsLedger = await ledger.accountLedger(autoCo, '5101');
  expect('بهای تمام‌شده (۱۰ × ۶۰۰)', cogsLedger.closing, 6_000);

  const inventoryLedger = await ledger.accountLedger(autoCo, '1104');
  expect('موجودی کالا پس از فروش', inventoryLedger.closing, 54_000);

  const autoTrial = await ledger.trialBalance(autoCo);
  if (autoTrial.balanced) step('تراز پس از ثبت خودکار متوازن است');
  else fail('تراز پس از ثبت خودکار', 'نامتوازن');

  // ---------- فروش نسیه ----------

  await sales.create(
    { warehouseId, items: [{ productId, quantity: 5 }], payments: [] } as never,
    autoCo,
    autoUser,
  );

  const receivable = await ledger.accountLedger(autoCo, '1103');
  expect('حساب دریافتنی پس از فروش نسیه', receivable.closing, 5_000);

  // ---------- سود ----------

  const autoIncome = await ledger.incomeStatement(autoCo);
  // درآمد ۱۵٬۰۰۰ − بهای تمام‌شده ۹٬۰۰۰
  expect('سود پس از دو فروش', autoIncome.netIncome, 6_000);

  // ---------- لغو فاکتور: سند برمی‌گردد ----------

  await sales.cancel(sale.id, autoCo);

  const cashAfterCancel = await ledger.accountLedger(autoCo, '1101');
  expect('صندوق پس از لغو فاکتور', cashAfterCancel.closing, 0);

  const incomeAfterCancel = await ledger.incomeStatement(autoCo);
  // فقط فاکتور نسیه می‌ماند: ۵٬۰۰۰ درآمد − ۳٬۰۰۰ بهای تمام‌شده
  expect('سود پس از لغو', incomeAfterCancel.netIncome, 2_000);

  const trialAfterCancel = await ledger.trialBalance(autoCo);
  if (trialAfterCancel.balanced) step('تراز پس از لغو فاکتور متوازن است');
  else fail('تراز پس از لغو', 'نامتوازن');

  // ---------- شرکت بدون حسابداری نباید مختل شود ----------

  const offCo = randomUUID();
  await db.query('INSERT INTO "Company" (id, name) VALUES ($1, $2)', [
    offCo,
    'شرکت بدون حسابداری',
  ]);
  const offWarehouse = randomUUID();
  await db.query(
    'INSERT INTO "Warehouse" (id, "companyId", name, code) VALUES ($1, $2, $3, $4)',
    [offWarehouse, offCo, 'انبار', `W2-${Date.now()}`],
  );
  const offUser = randomUUID();
  await db.query(
    `INSERT INTO "User" (id, "firstName", "lastName", email, password, "companyId")
     VALUES ($1, 'کاربر', 'دوم', $2, 'x', $3)`,
    [offUser, `${offUser}@t.local`, offCo],
  );
  const offProduct = randomUUID();
  await db.query(
    `INSERT INTO "Product" (id, "companyId", name, sku, unit, "purchasePrice", "salePrice",
                            "trackInventory")
     VALUES ($1, $2, 'کالا', $3, 'عدد', 100, 200, false)`,
    [offProduct, offCo, `SKU2-${Date.now()}`],
  );

  const offSale = await sales.create(
    { warehouseId: offWarehouse, items: [{ productId: offProduct, quantity: 1 }] } as never,
    offCo,
    offUser,
  );
  if (offSale?.id) step('شرکت بدون کدینگ حساب همچنان می‌فروشد (سند صادر نمی‌شود)');
  else fail('شرکت بدون حسابداری', 'فروش انجام نشد');

  const offEntries = await ledger.entries(offCo, {});
  expect('شرکت بدون حسابداری سندی ندارد', offEntries.length, 0);

  await db.onModuleDestroy();
}

main()
  .then(() => {
    console.log(`\n  ${'─'.repeat(44)}`);
    if (failed === 0) {
      console.log(`  ✅ همهٔ ${passed} بررسی دفتر کل موفق بود\n`);
    } else {
      console.log(`  موفق: ${passed}   ناموفق: ${failed}\n`);
      process.exit(1);
    }
  })
  .catch((error: unknown) => {
    console.error(`\n  ❌ تست متوقف شد: ${error instanceof Error ? error.message : error}\n`);
    process.exit(1);
  });

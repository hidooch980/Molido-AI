/**
 * تست سرتاسری فروشگاه — روی سامانهٔ در حال اجرا
 *
 *   npm run test:store
 *   npm run test:store -- http://192.168.1.10:3000
 *
 * برخلاف test/smoke.ts که سرویس‌ها را مستقیم صدا می‌زند، این تست فقط از HTTP
 * استفاده می‌کند؛ یعنی همان مسیری را می‌سنجد که صندوق واقعی طی می‌کند:
 * احراز هویت، مجوزها، اعتبارسنجی ورودی و سریال‌سازی پاسخ.
 *
 * چیزی از سامانه پاک نمی‌کند؛ داده‌های آزمایشی با پیشوند E2E ساخته می‌شوند.
 */
import process from 'node:process';

const BASE = (process.argv[2] ?? process.env.MOLIDO_URL ?? 'http://localhost:3000').replace(
  /\/+$/,
  '',
);
const EMAIL = process.env.MOLIDO_EMAIL ?? 'admin@molido.ai';
const PASSWORD = process.env.MOLIDO_PASSWORD ?? 'admin123';

let token = '';
let passed = 0;
let failed = 0;

const fa = (value: unknown) => Number(value ?? 0).toLocaleString('fa-IR');

async function call<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const message =
      (data as { message?: string | string[] } | null)?.message ?? `HTTP ${response.status}`;
    throw new Error(Array.isArray(message) ? message.join('، ') : String(message));
  }

  return data as T;
}

function step(label: string, detail = '') {
  passed += 1;
  console.log(`  ✅ ${label}${detail ? ` — ${detail}` : ''}`);
}

function fail(label: string, error: unknown) {
  failed += 1;
  console.log(`  ❌ ${label} — ${error instanceof Error ? error.message : String(error)}`);
}

/** ادعایی که اگر برقرار نباشد تست را می‌شکند. */
function expect(label: string, actual: unknown, wanted: unknown) {
  if (Number(actual) === Number(wanted)) {
    step(label, `${fa(actual)}`);
  } else {
    fail(label, `انتظار ${fa(wanted)} بود، ${fa(actual)} دریافت شد`);
  }
}

type Id = { id: string };

async function main(): Promise<void> {
  console.log(`\n  🏪 تست فروشگاه — ${BASE}\n`);

  // ---------- ۰. اتصال ----------

  try {
    await call('GET', '/readyz');
    step('سامانه در دسترس است');
  } catch (error) {
    console.log(`\n  ❌ اتصال برقرار نشد: ${(error as Error).message}`);
    console.log(`  آیا سامانه روی ${BASE} اجرا شده است؟\n`);
    process.exit(1);
  }

  const auth = await call<{ accessToken: string }>('POST', '/auth/login', {
    email: EMAIL,
    password: PASSWORD,
  });
  token = auth.accessToken;
  step('ورود موفق', EMAIL);

  // ---------- ۱. پیش‌نیازها ----------

  const cashBoxes = await call<Array<Id & { name: string }>>('GET', '/cashbox');
  if (!cashBoxes.length) throw new Error('هیچ صندوقی تعریف نشده — ابتدا seed را اجرا کنید');
  const cashBox = cashBoxes[0];

  const warehousesRaw = await call<Array<Id & { name: string }> | { data: Array<Id> }>(
    'GET',
    '/warehouses',
  );
  const warehouses = Array.isArray(warehousesRaw) ? warehousesRaw : warehousesRaw.data;
  if (!warehouses.length) throw new Error('هیچ انباری تعریف نشده');
  const warehouse = warehouses[0];

  step('صندوق و انبار', `${cashBox.name}`);

  // ---------- ۲. کالای آزمایشی ----------

  const stamp = Date.now();
  const product = await call<Id & { name: string }>('POST', '/products', {
    name: `کالای آزمایشی ${stamp}`,
    sku: `E2E-${stamp}`,
    unit: 'عدد',
    purchasePrice: 60_000,
    salePrice: 100_000,
    minStock: 5,
    isRationEligible: true,
    rationPrice: 80_000,
  });
  step('کالا ساخته شد', product.name);

  // ---------- ۳. موجودی ----------

  await call('POST', '/inventory/adjust', {
    productId: product.id,
    warehouseId: warehouse.id,
    quantityChange: 100,
  });
  step('موجودی اولیه ثبت شد', '۱۰۰ عدد');

  // موجودی منفی نباید ممکن باشد
  try {
    await call('POST', '/inventory/adjust', {
      productId: product.id,
      warehouseId: warehouse.id,
      quantityChange: -1000,
    });
    fail('کسر بیش از موجودی', 'رد نشد!');
  } catch {
    step('کسر بیش از موجودی رد شد');
  }

  // ---------- ۴. اسکن ----------

  const scan = await call<{ product: Id & { name: string }; unitPrice: number }>(
    'GET',
    `/retail/scan?code=E2E-${stamp}&warehouseId=${warehouse.id}`,
  );
  expect('اسکن با SKU — قیمت', scan.unitPrice, 100_000);

  try {
    await call('GET', '/retail/scan?code=کد-وجود-ندارد-۱۲۳');
    fail('اسکن کد نامعتبر', 'رد نشد!');
  } catch {
    step('اسکن کد نامعتبر رد شد');
  }

  // ---------- ۵. شیفت ----------

  const open = await call<Id | null>('GET', '/retail/shifts/current');
  if (open) {
    await call('PATCH', `/retail/shifts/${open.id}/close`, { countedCash: 0 });
    step('شیفت باز قبلی بسته شد');
  }

  const shift = await call<Id>('POST', '/retail/shifts/open', {
    cashBoxId: cashBox.id,
    warehouseId: warehouse.id,
    openingCash: 500_000,
  });
  step('شیفت باز شد', 'موجودی اولیه ۵۰۰٬۰۰۰');

  // یک صندوق‌دار نباید دو شیفت باز داشته باشد
  try {
    await call('POST', '/retail/shifts/open', {
      cashBoxId: cashBox.id,
      warehouseId: warehouse.id,
    });
    fail('شیفت دوم هم‌زمان', 'رد نشد!');
  } catch {
    step('شیفت دوم هم‌زمان رد شد');
  }

  // ---------- ۶. فروش نقدی ساده ----------

  const cashSale = await call<Id & { invoiceNo: string; total: string; status: string }>(
    'POST',
    '/sales',
    {
      warehouseId: warehouse.id,
      items: [{ productId: product.id, quantity: 3 }],
      payments: [{ method: 'CASH', amount: 300_000, cashBoxId: cashBox.id }],
    },
  );
  expect('فروش نقدی — مبلغ', cashSale.total, 300_000);
  if (cashSale.status === 'PAID') step('وضعیت فاکتور', 'PAID');
  else fail('وضعیت فاکتور', `PAID انتظار می‌رفت، ${cashSale.status} دریافت شد`);

  // ---------- ۷. تسویهٔ نقد + کارت ----------

  const splitSale = await call<Id & { total: string }>('POST', '/sales', {
    warehouseId: warehouse.id,
    items: [{ productId: product.id, quantity: 5 }],
    payments: [
      { method: 'CASH', amount: 200_000, cashBoxId: cashBox.id },
      { method: 'CARD', amount: 300_000 },
    ],
  });
  expect('تسویهٔ نقد+کارت — مبلغ', splitSale.total, 500_000);

  // پرداخت بیش از مبلغ فاکتور نباید پذیرفته شود
  try {
    await call('POST', '/sales', {
      warehouseId: warehouse.id,
      items: [{ productId: product.id, quantity: 1 }],
      payments: [{ method: 'CASH', amount: 999_999, cashBoxId: cashBox.id }],
    });
    fail('پرداخت بیش از مبلغ', 'رد نشد!');
  } catch {
    step('پرداخت بیش از مبلغ فاکتور رد شد');
  }

  // ---------- ۸. کالابرگ ----------

  const nationalCode = String(stamp).slice(-10).padStart(10, '0');
  const account = await call<Id & { balance: string }>('POST', '/ration/accounts', {
    nationalCode,
    holderName: 'خانوار آزمایشی',
    householdSize: 4,
  });
  await call('POST', `/ration/accounts/${account.id}/allocate`, {
    amount: 1_000_000,
    periodCode: `E2E-${stamp}`,
  });
  step('حساب کالابرگ', `کد ملی ${nationalCode} • اعتبار ۱٬۰۰۰٬۰۰۰`);

  // شارژ دوبارهٔ همان دوره نباید ممکن باشد
  try {
    await call('POST', `/ration/accounts/${account.id}/allocate`, {
      amount: 1_000_000,
      periodCode: `E2E-${stamp}`,
    });
    fail('شارژ دوبارهٔ یک دوره', 'رد نشد!');
  } catch {
    step('شارژ دوبارهٔ یک دوره رد شد');
  }

  const eligibility = await call<{ eligibleTotal: number }>('POST', '/ration/eligibility', {
    items: [{ productId: product.id, quantity: 4 }],
  });
  // ۴ عدد × قیمت مصوب ۸۰٬۰۰۰ = ۳۲۰٬۰۰۰ (نه قیمت فروش ۱۰۰٬۰۰۰)
  expect('سهم کالابرگ با قیمت مصوب', eligibility.eligibleTotal, 320_000);

  const rationSale = await call<Id & { total: string; rationAmount: number }>('POST', '/sales', {
    warehouseId: warehouse.id,
    rationAccountId: account.id,
    items: [{ productId: product.id, quantity: 4 }],
    payments: [{ method: 'CASH', amount: 80_000, cashBoxId: cashBox.id }],
  });
  expect('فاکتور کالابرگی — مبلغ کل', rationSale.total, 400_000);
  expect('سهم پرداخت‌شده از کالابرگ', rationSale.rationAmount, 320_000);

  const afterSpend = await call<{ balance: string }>('GET', `/ration/accounts/${account.id}`);
  expect('مانده کالابرگ پس از خرید', afterSpend.balance, 680_000);

  // ---------- ۹. لغو فاکتور و برگشت اعتبار ----------

  const boxBefore = await call<{ balance: string }>('GET', `/cashbox/${cashBox.id}`);

  await call('PATCH', `/sales/${rationSale.id}/cancel`, {});
  const afterCancel = await call<{ balance: string }>('GET', `/ration/accounts/${account.id}`);
  expect('اعتبار کالابرگ پس از لغو برگشت', afterCancel.balance, 1_000_000);

  // نقد فاکتور لغوشده باید از صندوق هم کم شده باشد، وگرنه پایان شیفت کسری
  // کاذب نشان می‌دهد.  تغییر سنجیده می‌شود نه مقدار مطلق، چون صندوق بین
  // اجراهای تست مشترک است.
  const boxAfter = await call<{ balance: string }>('GET', `/cashbox/${cashBox.id}`);
  expect(
    'نقد فاکتور لغوشده از صندوق کسر شد',
    Number(boxBefore.balance) - Number(boxAfter.balance),
    80_000,
  );

  // ---------- ۱۰. بستن شیفت و مغایرت‌گیری ----------

  // نقد شیفت: ۳۰۰٬۰۰۰ + ۲۰۰٬۰۰۰ = ۵۰۰٬۰۰۰
  // نقد فاکتور لغوشده (۸۰٬۰۰۰) به مشتری پس داده شده و از صندوق کسر می‌شود.
  // موجودی اولیه ۵۰۰٬۰۰۰ + فروش نقدی ۵۰۰٬۰۰۰ = ۱٬۰۰۰٬۰۰۰
  const closed = await call<{
    expectedCash: string;
    countedCash: string;
    difference: string;
    salesCount: number;
  }>('PATCH', `/retail/shifts/${shift.id}/close`, { countedCash: 1_000_000 });

  expect('نقد مورد انتظار شیفت', closed.expectedCash, 1_000_000);
  expect('مغایرت صندوق', closed.difference, 0);

  // ---------- ۱۱. گزارش و تحلیل ----------

  const dashboard = await call<{ productsCount: number }>('GET', '/reports/dashboard');
  step('داشبورد', `${fa(dashboard.productsCount)} کالا`);

  const reorder = await call<{ count: number }>('GET', '/ai/reorder-suggestions');
  step('پیشنهاد سفارش خرید', `${fa(reorder.count)} قلم`);

  const forecast = await call<{ expectedTotal: number }>('GET', '/ai/sales-forecast?daysAhead=7');
  step('پیش‌بینی فروش هفتهٔ آینده', fa(forecast.expectedTotal));

  await call('GET', '/ai/dead-stock');
  step('گزارش کالای راکد');

  await call('GET', '/ai/cashier-anomalies');
  step('بررسی مغایرت صندوق‌داران');

  // ---------- ۱۲. واحد پول ----------

  const currency = await call<{ code: string; symbol: string; decimals: number }>(
    'GET',
    '/company/currency',
  );
  step('واحد پول', `${currency.code} (${currency.symbol})`);

  try {
    await call('PATCH', '/company', { currency: 'XYZ' });
    fail('واحد پول نامعتبر', 'رد نشد!');
  } catch {
    step('واحد پول نامعتبر رد شد');
  }

  // ---------- ۱۳. دستیار هوشمند ----------

  const ask = await call<{ tool: string | null; answer: string }>('POST', '/ai/ask', {
    question: 'این هفته چه کالایی باید سفارش بدهم؟',
  });
  if (ask.tool === 'reorderSuggestions') step('دستیار — پرسش سفارش خرید', ask.tool);
  else fail('دستیار — پرسش سفارش خرید', `ابزار ${ask.tool} انتخاب شد`);

  const askProfit = await call<{ tool: string | null }>('POST', '/ai/ask', {
    question: 'سود این دوره چقدر بوده است؟',
  });
  if (askProfit.tool === 'profitReport') step('دستیار — پرسش سود');
  else fail('دستیار — پرسش سود', `ابزار ${askProfit.tool} انتخاب شد`);

  const askNonsense = await call<{ tool: string | null; answer: string }>('POST', '/ai/ask', {
    question: 'امروز هوا چطور است؟',
  });
  if (askNonsense.tool === null) step('دستیار — پرسش نامربوط را نمی‌فهمد (درست)');
  else fail('دستیار — پرسش نامربوط', `به‌اشتباه ${askNonsense.tool} را اجرا کرد`);

  const briefing = await call<{ highlights: Array<{ level: string; text: string }> }>(
    'GET',
    '/ai/briefing',
  );
  step('بریفینگ روزانه', `${fa(briefing.highlights.length)} نکته`);

  // ---------- ۱۴. خروجی ----------

  const csv = await fetch(`${BASE}/reports/sales/export`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (csv.ok) step('خروجی CSV فروش');
  else fail('خروجی CSV فروش', `HTTP ${csv.status}`);
}

main()
  .then(() => {
    console.log(`\n  ${'─'.repeat(40)}`);
    if (failed === 0) {
      console.log(`  ✅ همهٔ ${passed} بررسی موفق بود — فروشگاه آمادهٔ بهره‌برداری است\n`);
    } else {
      console.log(`  موفق: ${passed}   ناموفق: ${failed}\n`);
      process.exit(1);
    }
  })
  .catch((error: unknown) => {
    console.log(`\n  ❌ تست متوقف شد: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });

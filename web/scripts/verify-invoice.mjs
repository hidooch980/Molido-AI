/**
 * آزمون محاسبهٔ فاکتور فروش.
 *
 * چرا اسکریپت node و نه jest: پروژهٔ web هیچ اجراکنندهٔ آزمونی ندارد و
 * افزودن jest + babel + ts-jest برای یک ماژول خالص، وابستگی و پیکربندی
 * بیشتری می‌آورد از خود کدی که قرار است آزموده شود.  node ۲۲ خودش تایپ
 * را حذف می‌کند، پس فایل TypeScript مستقیم import می‌شود.
 *
 * اجرا:  node --experimental-strip-types web/scripts/verify-invoice.mjs
 */
import assert from 'node:assert/strict';

const {
  computeTotals,
  lineDiscountAmount,
  lineGross,
  lineNet,
  lineTaxAmount,
  shortStock,
} = await import('../app/sales/new/invoice-lines.ts');

let pass = 0;
let fail = 0;

function chk(name, fn) {
  try {
    fn();
    pass += 1;
    console.log(`  OK   ${name}`);
  } catch (error) {
    fail += 1;
    console.log(`  FAIL ${name}`);
    console.log(`       ${error.message.split('\n')[0]}`);
  }
}

const L = (over = {}) => ({
  key: 'k', productId: 'p', name: 'کالا', sku: 'SKU', barcode: null,
  unit: 'عدد', available: null, quantity: 1, unitPrice: 1000,
  discountPercent: 0, taxPercent: 0, note: '', serial: '', ...over,
});

const NONE = { discountPercent: 0, fallbackTaxPercent: 0, additions: 0, deductions: 0 };

console.log('--- 1) مبلغ قلم ---');

chk('ناخالص = مقدار × بهای واحد', () =>
  assert.equal(lineGross(L({ quantity: 3, unitPrice: 3_980_000 })), 11_940_000));

chk('مقدار اعشاری کالای وزنی', () =>
  assert.equal(lineGross(L({ quantity: 1.25, unitPrice: 240_000 })), 300_000));

chk('گرد کردن به ریال', () =>
  // ۰٫۳۳۳ × ۱۰۰۰ باید ۳۳۳ باشد، نه ۳۳۳٫۰۰۰۰۰۰۰۴
  assert.equal(lineGross(L({ quantity: 0.333, unitPrice: 1000 })), 333));

chk('مقدار منفی صفر حساب می‌شود', () =>
  assert.equal(lineGross(L({ quantity: -5 })), 0));

chk('NaN فاکتور را خراب نمی‌کند', () =>
  assert.equal(lineGross(L({ quantity: Number.NaN })), 0));

chk('تخفیف درصدی به ریال', () =>
  assert.equal(lineDiscountAmount(L({ quantity: 2, unitPrice: 500_000, discountPercent: 10 })), 100_000));

chk('تخفیف بیش از ۱۰۰٪ محدود می‌شود', () => {
  const l = L({ unitPrice: 1000, discountPercent: 250 });
  assert.equal(lineDiscountAmount(l), 1000);
  assert.equal(lineNet(l), 0);
});

chk('تخفیف منفی نادیده گرفته می‌شود', () =>
  assert.equal(lineDiscountAmount(L({ discountPercent: -20 })), 0));

console.log('--- 2) جمع فاکتور ---');

chk('جمع اقلام مطابق نمونهٔ فاکتور', () => {
  const lines = Array.from({ length: 8 }, (_, i) =>
    L({ key: String(i), unitPrice: 3_980_000 }));
  lines.push(L({ key: '9', unitPrice: 1_600_000 }));
  assert.equal(computeTotals(lines, NONE).itemsTotal, 33_440_000);
});

chk('تخفیف کلی روی مبلغِ پس از تخفیف قلم', () => {
  // ۱۰۰۰ با ۱۰٪ قلم => ۹۰۰ ؛ ۱۰٪ کلی روی ۹۰۰ => ۹۰، نه ۱۰۰
  const t = computeTotals([L({ unitPrice: 1000, discountPercent: 10 })],
    { ...NONE, discountPercent: 10 });
  assert.equal(t.lineDiscount, 100);
  assert.equal(t.overallDiscount, 90);
  assert.equal(t.payable, 810);
});

chk('مالیات جایگزین پس از هر دو تخفیف', () => {
  const t = computeTotals([L({ unitPrice: 1_000_000 })],
    { ...NONE, discountPercent: 20, fallbackTaxPercent: 10 });
  assert.equal(t.overallDiscount, 200_000);
  assert.equal(t.tax, 80_000);
  assert.equal(t.payable, 880_000);
});

chk('اضافات و کسورات', () =>
  assert.equal(computeTotals([L({ unitPrice: 1_000_000 })],
    { ...NONE, additions: 150_000, deductions: 50_000 }).payable, 1_100_000));

chk('مالیات روی اضافات بسته نمی‌شود', () =>
  // کرایهٔ حمل مشمول ارزش افزودهٔ کالا نیست؛ اگر داخل پایه بیاید، مبلغ
  // مالیات با سامانهٔ مؤدیان نمی‌خواند.
  assert.equal(computeTotals([L({ unitPrice: 1_000_000 })],
    { ...NONE, fallbackTaxPercent: 10, additions: 500_000 }).tax, 100_000));

console.log('--- 2b) مالیات ردیفی ---');

chk('مالیات ردیف روی مبلغِ پس از تخفیف', () =>
  // ۱۰۰۰ با ۱۰٪ تخفیف => ۹۰۰ ؛ ۹٪ مالیات => ۸۱، نه ۹۰
  assert.equal(lineTaxAmount(L({ unitPrice: 1000, discountPercent: 10, taxPercent: 9 })), 81));

chk('مالیات ردیفی بر نرخ سراسری مقدم است', () => {
  // اگر جمع شوند، مالیات دو بار بسته می‌شود.
  const t = computeTotals([L({ unitPrice: 1000, taxPercent: 9 })],
    { ...NONE, fallbackTaxPercent: 50 });
  assert.equal(t.tax, 90);
});

chk('نرخ سراسری فقط وقتی هیچ ردیفی نرخ ندارد', () => {
  const t = computeTotals([L({ unitPrice: 1000, taxPercent: 0 })],
    { ...NONE, fallbackTaxPercent: 9 });
  assert.equal(t.tax, 90);
});

chk('نرخ‌های متفاوت ردیف‌ها جدا حساب می‌شوند', () => {
  // فروشگاهی که هم کالای مشمول دارد هم معاف — همان چیزی که یک نرخ
  // سراسری هرگز درست حساب نمی‌کند.
  const t = computeTotals([
    L({ key: 'a', unitPrice: 1000, taxPercent: 9 }),
    L({ key: 'b', unitPrice: 1000, taxPercent: 0 }),
  ], NONE);
  assert.equal(t.tax, 90);
});

chk('کسورات بزرگ فاکتور را منفی نمی‌کند', () =>
  assert.equal(computeTotals([L({ unitPrice: 1000 })],
    { ...NONE, deductions: 999_999 }).payable, 0));

chk('فاکتور خالی صفر است نه NaN', () => {
  const t = computeTotals([], { ...NONE, discountPercent: 10, fallbackTaxPercent: 9 });
  assert.equal(t.payable, 0);
  assert.equal(t.tax, 0);
});

console.log('--- 3) هشدار موجودی ---');

chk('قلم بیش از موجودی برگردانده می‌شود', () =>
  assert.deepEqual(
    shortStock([L({ key: 'a', quantity: 5, available: 2 }), L({ key: 'b', quantity: 1, available: 9 })])
      .map((l) => l.key),
    ['a']));

chk('کالای بدون کنترل موجودی هشدار ندارد', () =>
  assert.deepEqual(shortStock([L({ quantity: 1000, available: null })]), []));

chk('مقدار برابر موجودی هشدار نیست', () =>
  assert.deepEqual(shortStock([L({ quantity: 3, available: 3 })]), []));

console.log(`\n   PASS: ${pass}   FAIL: ${fail}`);
process.exit(fail === 0 ? 0 : 1);

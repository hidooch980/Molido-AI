/**
 * آزمون تعریف ابزارهای MCP.
 *
 * بخش خالص است و شبکه نمی‌خواهد: هر ابزار ورودی را به یک درخواست
 * تبدیل می‌کند، و درستیِ همان تبدیل اینجا سنجیده می‌شود.
 *
 * اجرا: node mcp/tools.spec.mjs
 */

import { TOOLS, buildRequest, clampLimit, rangeOf, toolByName } from './tools.mjs';

let pass = 0;
let fail = 0;

function chk(label, got, want) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) {
    pass += 1;
    console.log(`  OK   ${label}`);
  } else {
    fail += 1;
    console.log(`  FAIL ${label} (got=${g} want=${w})`);
  }
}

function throws(label, fn, fragment) {
  try {
    fn();
    fail += 1;
    console.log(`  FAIL ${label} (خطایی پرتاب نشد)`);
  } catch (error) {
    if (String(error.message).includes(fragment)) {
      pass += 1;
      console.log(`  OK   ${label}`);
    } else {
      fail += 1;
      console.log(`  FAIL ${label} (پیام: ${error.message})`);
    }
  }
}

// تاریخ ثابت — بدون آن، آزمونِ بازه فردا نتیجهٔ دیگری می‌دهد.
const NOW = new Date('2026-08-15T10:30:00Z');

console.log('--- فهرست ابزارها ---');
chk('ده ابزار', TOOLS.length, 10);
chk('نام‌ها یکتا هستند', new Set(TOOLS.map((t) => t.name)).size, TOOLS.length);
chk(
  'همه توضیح دارند',
  TOOLS.every((t) => t.description.length > 20),
  true,
);
chk(
  'همه شمای ورودی دارند',
  TOOLS.every((t) => t.inputSchema?.type === 'object'),
  true,
);
// نامِ ابزار در فهرست کلاینت دیده می‌شود؛ نام فارسی آنجا کار نمی‌کند.
chk(
  'نام‌ها انگلیسی و snake_case هستند',
  TOOLS.every((t) => /^[a-z][a-z0-9_]*$/.test(t.name)),
  true,
);

console.log('--- بازهٔ زمانی ---');
chk('امروز', rangeOf('today', NOW), { from: '2026-08-15', to: '2026-08-15' });
chk('هفته', rangeOf('week', NOW), { from: '2026-08-08', to: '2026-08-15' });
chk('ماه', rangeOf('month', NOW), { from: '2026-07-15', to: '2026-08-15' });
chk('سال', rangeOf('year', NOW), { from: '2025-08-15', to: '2026-08-15' });
// بازهٔ ناشناس نباید خطا بدهد؛ امروز جواب معقولی است.
chk('بازهٔ ناشناس → امروز', rangeOf('quarter', NOW), {
  from: '2026-08-15',
  to: '2026-08-15',
});

console.log('--- مهار سقف ---');
chk('عدد معمولی', clampLimit(15), 15);
chk('رشتهٔ عددی', clampLimit('30'), 30);
chk('صفر → پیش‌فرض', clampLimit(0), 20);
chk('منفی → پیش‌فرض', clampLimit(-5), 20);
chk('غیرعدد → پیش‌فرض', clampLimit('خیلی'), 20);
// مدل گاهی عدد بی‌معنی می‌فرستد؛ سقف نباید به سرور برسد.
chk('بیش از سقف مهار می‌شود', clampLimit(100000), 100);
chk('اعشاری گرد می‌شود', clampLimit(7.9), 7);

console.log('--- ساخت درخواست ---');
chk('جست‌وجوی کالا', buildRequest('search_products', { query: 'نان' }, NOW), {
  method: 'GET',
  path: '/retail/search',
  query: { q: 'نان', limit: 20 },
});
chk(
  'گزارش فروش با بازه',
  buildRequest('sales_report', { period: 'week' }, NOW),
  { method: 'GET', path: '/reports/sales', query: { from: '2026-08-08', to: '2026-08-15' } },
);
chk('نمای کلی بدون پارامتر', buildRequest('dashboard', {}, NOW), {
  method: 'GET',
  path: '/reports/dashboard',
  query: {},
});
chk(
  'پارامتر اختیاریِ نبوده، فرستاده نمی‌شود',
  buildRequest('low_stock', {}, NOW).query,
  {},
);
chk(
  'پارامتر اختیاریِ داده‌شده، فرستاده می‌شود',
  buildRequest('low_stock', { warehouseId: 'w1' }, NOW).query,
  { warehouseId: 'w1' },
);
// شناسه در مسیر می‌نشیند و باید کدگذاری شود، وگرنه شناسهٔ حاوی «/»
// مسیر دیگری می‌سازد.
chk(
  'شناسه در مسیر کدگذاری می‌شود',
  buildRequest('price_history', { productId: 'a/b c' }, NOW).path,
  '/purchasing/price-history/a%2Fb%20c',
);

console.log('--- اعتبارسنجی ورودی ---');
throws('ابزار ناشناس', () => buildRequest('no_such_tool', {}, NOW), 'ناشناخته');
throws(
  'پارامتر لازمِ نبوده',
  () => buildRequest('search_products', {}, NOW),
  'query',
);
throws(
  'پارامتر لازمِ خالی',
  () => buildRequest('search_products', { query: '   ' }, NOW),
  'query',
);
// بازهٔ نامعتبر نباید خطا بدهد — مدل گاهی «last week» می‌فرستد و
// شکستنِ ابزار بدتر از پیش‌فرض گرفتن است.
chk(
  'بازهٔ نامعتبر، پیش‌فرض می‌گیرد',
  buildRequest('sales_report', { period: 'last week' }, NOW).query,
  { from: '2026-08-15', to: '2026-08-15' },
);

console.log('--- فقط خواندنی ---');
// هیچ ابزاری نباید بنویسد.  اشتباه مدل در گزارش، یک جملهٔ غلط است؛
// اشتباهش در ثبت فاکتور، پولِ واقعیِ مشتری.
chk(
  'همهٔ درخواست‌ها GET هستند',
  TOOLS.every((t) => t.request({ query: 'x', productId: 'p' }, NOW).method === 'GET'),
  true,
);

console.log('--- یافتن ابزار ---');
chk('ابزار موجود', toolByName('dashboard')?.name, 'dashboard');
chk('ابزار ناموجود', toolByName('nope'), null);

console.log('');
console.log(`   PASS: ${pass}   FAIL: ${fail}`);
process.exit(fail === 0 ? 0 : 1);

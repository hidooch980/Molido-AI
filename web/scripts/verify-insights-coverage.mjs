/**
 * نگهبانِ پوششِ تحلیل‌ها.
 *
 * ⚠️ چرا لازم شد؟
 *
 *    یازده مسیرِ `/ai/*` ساخته و آزموده شده بود و صفحه فقط چهار تا را
 *    صدا می‌زد.  شش تحلیل — تحلیل فروش، گزارش مدیریتی، پیشنهاد قیمت،
 *    سرعت مصرف انبار، ناهنجاری صندوق، نزدیک به انقضا — هیچ راهی به
 *    دستِ کاربر نداشتند.
 *
 *    بدتر: توضیحِ بالای همان فایل می‌گفت «هر هشت نقطه» پوشش داده شده.
 *    یعنی نه‌تنها شکاف بود، که سندی هم وجود داشت که می‌گفت نیست.
 *
 * ⚠️ این خرابی **هیچ نشانه‌ای** نمی‌دهد.
 *
 *    مسیرِ API سالم است و ۲۰۰ می‌دهد.  صفحه هم سالم است و بدونِ خطا
 *    بالا می‌آید.  تنها راهِ دیدنش این است که کسی فهرستِ کنترلر را با
 *    فهرستِ صفحه مقایسه کند — کاری که ماه‌ها نشد.
 *
 * ⚠️ استثنا با **دلیل** ثبت می‌شود، نه با سکوت.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');

const CONTROLLER = join(root, 'backend', 'src', 'ai', 'ai.controller.ts');
const PAGE = join(root, 'web', 'app', 'insights', 'page.tsx');

/**
 * مسیرهایی که عمداً در صفحهٔ تحلیل‌ها نیستند.
 */
const EXEMPT = new Map([
  [
    'ask',
    'پرسشِ آزاد به مدل زبانی نیاز دارد (`AI_API_KEY`).  صفحهٔ تحلیل‌ها ' +
      'باید بدونِ هیچ پیکربندیِ اضافه کار کند؛ این یکی جای خودش را دارد.',
  ],
]);

const controller = readFileSync(CONTROLLER, 'utf8');
const page = readFileSync(PAGE, 'utf8');

// مسیرها از دکوراتورهای کنترلر.
const routes = [
  ...new Set(
    [...controller.matchAll(/@(?:Get|Post)\('([a-z0-9-]+)'\)/g)].map((m) => m[1]),
  ),
];

/**
 * ⚠️ کامنت‌ها **پیش از** جست‌وجو حذف می‌شوند.
 *
 *    نسخهٔ اول کلِ فایل را می‌گشت، و `/ai/ask` در توضیحِ بالای صفحه
 *    آمده بود — پس «صدا زده شده» شمرده شد و استثنایش «کهنه» گزارش
 *    شد.  همان دامی که `verify-guard-wiring` هم یک بار در آن افتاد:
 *    نگهبانی که با یک توضیح گول بخورد، نگهبان نیست.
 */
const codeOnly = page
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

const called = new Set(
  [...codeOnly.matchAll(/['"`]\/ai\/([a-z0-9-]+)['"`]/g)].map((m) => m[1]),
);

const missing = routes.filter((r) => !called.has(r) && !EXEMPT.has(r));

// استثنایی که دیگر لازم نیست، خودش بدهی است.
const stale = [...EXEMPT.keys()].filter((r) => !routes.includes(r) || called.has(r));

console.log('--- پوششِ تحلیل‌ها (کنترلر ↔ صفحه) ---');
console.log();
console.log(`  مسیرِ /ai:            ${routes.length}`);
console.log(`  صدا زده در صفحه:     ${called.size}`);
console.log(`  استثنای نام‌دار:      ${EXEMPT.size}`);
console.log();

let bad = false;

if (missing.length) {
  bad = true;
  console.log(`  FAIL ${missing.length} تحلیل ساخته شده و هیچ صفحه‌ای صدایش نمی‌زند:`);
  for (const r of missing) console.log(`       /ai/${r}`);
  console.log();
  console.log('     یا در web/app/insights/page.tsx نشانش دهید،');
  console.log('     یا با دلیل به EXEMPT اضافه کنید.');
  console.log();
}

if (stale.length) {
  console.log('  ⚠️ استثنای کهنه (دیگر لازم نیست):');
  for (const r of stale) console.log(`       ${r}`);
  console.log();
}

if (!bad) console.log('  OK   هر تحلیلِ ساخته‌شده راهی به دستِ کاربر دارد');
console.log();
console.log(`   PASS: ${bad ? 0 : 1}   FAIL: ${bad ? 1 : 0}`);

process.exit(bad ? 1 : 0);

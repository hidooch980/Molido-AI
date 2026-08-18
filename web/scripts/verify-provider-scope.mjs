/**
 * هر کامپوننتی که در `layout.tsx` رندر می‌شود و `useI18n()` صدا می‌زند،
 * باید **داخل** `<LanguageProvider>` باشد.
 *
 * ⚠️ این دام ساخت را شکست و تشخیصش را هم گمراه کرد.
 *
 *    `ServiceWorkerRegistrar` سال‌ها بیرون از provider بود و اشکالی
 *    نداشت — چون هیچ متنی نداشت.  وقتی سه‌زبانه شد و `useI18n()` صدا
 *    زد، هر صفحه‌ای که prerender می‌شد می‌افتاد.
 *
 *    و پیامِ خطا **نامِ صفحه‌ای را می‌داد که هیچ ربطی نداشت**: هر بار
 *    /pos، /sales، /pricing، /settings — چون کارگرهای موازیِ Next به
 *    ترتیب متفاوتی می‌رسیدند.  وقت رفت برای گشتن در آن صفحه‌ها.
 *
 * ⚠️ چرا `tsc` نمی‌گیردش؟
 *
 *    از نظر نوع‌ها همه‌چیز درست است: `useI18n()` تابعی است که مقدار
 *    برمی‌گرداند.  خطا در **زمان اجرا** است، و فقط وقتی دیده می‌شود
 *    که صفحه‌ای واقعاً prerender شود.
 *
 *    یعنی بدون این نگهبان، تنها راهِ فهمیدنش یک ساختِ کاملِ سه‌دقیقه‌ای
 *    است — که کسی وسط کار نمی‌زند.
 *
 * اجرا:  node web/scripts/verify-provider-scope.mjs
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const APP = join(here, '..', 'app');
const layout = readFileSync(join(APP, 'layout.tsx'), 'utf8');

/** `<Foo ... />` هایی که در `<body>` رندر می‌شوند. */
const body = layout.slice(layout.indexOf('<body'), layout.indexOf('</body>'));

/** بخشِ داخلِ provider. */
const open = body.indexOf('<LanguageProvider');
const close = body.indexOf('</LanguageProvider>');
const inside = open !== -1 && close !== -1 ? body.slice(open, close) : '';

const rendered = [...body.matchAll(/<([A-Z]\w*)\b/g)].map((m) => m[1]);
const unique = [...new Set(rendered)].filter((n) => n !== 'LanguageProvider');

/** نامِ کامپوننت -> مسیرِ import در layout. */
const imports = {};
for (const m of layout.matchAll(/import\s+(\w+)\s+from\s+'([^']+)'/g)) {
  imports[m[1]] = m[2];
}

const bad = [];
let checked = 0;

for (const name of unique) {
  const spec = imports[name];
  if (!spec || !spec.startsWith('.')) continue;

  let file;
  for (const ext of ['.tsx', '.ts', '/index.tsx']) {
    const candidate = join(APP, spec.replace(/^\.\//, '') + ext);
    try {
      readFileSync(candidate, 'utf8');
      file = candidate;
      break;
    } catch {
      /* بعدی */
    }
  }
  if (!file) continue;

  checked += 1;
  const src = readFileSync(file, 'utf8');
  if (!/useI18n\s*\(/.test(src)) continue;

  // این کامپوننت ترجمه می‌خواهد — باید داخل provider رندر شود.
  const insideProvider = new RegExp(`<${name}\\b`).test(inside);
  if (!insideProvider) bad.push({ name, spec });
}

console.log(`  کامپوننتِ رندرشده در layout: ${checked}`);
console.log();

if (bad.length === 0) {
  console.log('  OK   هر مصرف‌کنندهٔ ترجمه داخل provider است');
  console.log();
  console.log('   PASS: 1   FAIL: 0');
  process.exit(0);
}

console.log(`  FAIL ${bad.length} کامپوننت بیرون از provider ولی با useI18n:`);
for (const b of bad) {
  console.log(`       <${b.name} />   (${b.spec})`);
}
console.log();
console.log('  رفع: داخل <LanguageProvider> ببریدش.');
console.log('  وگرنه هر صفحه‌ای که prerender شود می‌افتد — با نامِ صفحه‌ای');
console.log('  که هیچ ربطی ندارد.');
console.log();
console.log('   PASS: 0   FAIL: 1');
process.exit(1);

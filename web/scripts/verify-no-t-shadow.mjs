/**
 * متغیری به نام `t` که قلابِ ترجمه را سایه بیندازد.
 *
 * ⚠️ این تله امروز **سه بار** گرفت.
 *
 *     const [s, t, st] = await Promise.all(…)   // shift
 *     tables.map((t) => …)                      // reservations
 *     terminals.map((t) => …)                   // pos-terminals
 *
 * ⚠️ و بدترین حالتش این است که `tsc` **ساکت** می‌ماند.
 *
 *    تا وقتی هیچ `t('key')` ای داخل همان تابع نباشد، هیچ خطایی نیست.
 *    تله بی‌صدا آنجا می‌ماند تا اولین کسی که بخواهد یک رشتهٔ دیگر را
 *    ترجمه کند — و آن‌وقت `t('key')` روی یک شیء `Table` صدا زده
 *    می‌شود، نه روی تابع ترجمه.
 *
 *    خطایی که فقط هنگام تغییرِ بعدی ظاهر شود، از خطایی که همین حالا
 *    می‌افتد بدتر است: کسی که آن را می‌بیند، کاری نکرده که باعثش شده
 *    باشد.
 *
 * فقط فایلی سنجیده می‌شود که `useI18n` دارد — جایی که `t` معنای
 * مشخصی دارد.  در بقیهٔ فایل‌ها `t` نامِ آزادی است.
 *
 * اجرا:  node web/scripts/verify-no-t-shadow.mjs
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const WEB = 'D:\\aziz\\molido-ai\\Molido-AI-main\\web';

function walk(d) {
  const out = [];
  for (const n of readdirSync(d)) {
    const f = join(d, n);
    if (statSync(f).isDirectory()) out.push(...walk(f));
    else if (f.endsWith('.tsx') || f.endsWith('.ts')) out.push(f);
  }
  return out;
}

/**
 * شکل‌هایی که `t` را **می‌سازند**، نه آن‌هایی که مصرفش می‌کنند.
 *
 *   ((t) => …)      پارامتر تابع
 *   ((t, i) => …)   پارامتر اول از چند تا
 *   [a, t] =        تخریب آرایه
 *   const t =       تعریف مستقیم
 *
 * `setTop(t)` و `foo(t)` نباید بگیرند — آن‌ها `t` را مصرف می‌کنند.
 */
const PATTERNS = [
  { re: /\(\s*t\s*(?:,|\)\s*=>)/g, what: 'پارامتر تابع' },
  { re: /\[\s*(?:[\w$]+\s*,\s*)*t\s*(?:,[^\]]*)?\]\s*=/g, what: 'تخریب آرایه' },
  { re: /\b(?:const|let|var)\s+t\s*=/g, what: 'تعریف متغیر' },
];

const hits = [];

for (const root of ['app', 'components', 'lib']) {
  for (const file of walk(join(WEB, root))) {
    const text = readFileSync(file, 'utf8');
    if (!text.includes('useI18n')) continue;

    const lines = text.split('\n');
    lines.forEach((line, i) => {
      const s = line.trim();
      if (s.startsWith('//') || s.startsWith('*')) return;
      if (s.includes('const { t }') || s.includes('const { t,')) return;

      for (const { re, what } of PATTERNS) {
        re.lastIndex = 0;
        if (re.test(line)) {
          hits.push({
            file: file.slice(WEB.length + 1),
            line: i + 1,
            what,
            text: s.slice(0, 56),
          });
          break;
        }
      }
    });
  }
}

console.log(`  فایلِ دارای useI18n سنجیده شد`);
console.log();

if (hits.length === 0) {
  console.log('  OK   هیچ متغیری قلابِ ترجمه را سایه نمی‌اندازد');
  console.log();
  console.log('   PASS: 1   FAIL: 0');
  process.exit(0);
}

console.log(`  FAIL ${hits.length} سایه روی قلابِ ترجمه:`);
for (const h of hits) {
  console.log(`       ${h.file}:${h.line}  (${h.what})`);
  console.log(`         ${h.text}`);
}
console.log();
console.log('   PASS: 0   FAIL: 1');
process.exit(1);

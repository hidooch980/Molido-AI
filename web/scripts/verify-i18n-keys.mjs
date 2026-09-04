/**
 * هر `t('key')` کلیدش در واژه‌نامه هست؟
 *
 * ⚠️ این خرابی **بی‌صدا** است.
 *
 *    `t()` برای کلیدِ ناشناخته خودِ کلید را برمی‌گرداند.  یعنی کاربر
 *    به‌جای «ثبت قیمت‌ها» می‌بیند `maryamSavePrices` — و هیچ خطایی
 *    در کنسول نیست، هیچ آزمونی نمی‌افتد، و `tsc` هم چیزی نمی‌گوید
 *    چون کلید فقط یک رشته است.
 *
 *    امروز ۲۱۸ کلید دستی اضافه شد و هر غلطِ املایی در نامِ کلید
 *    همین را می‌ساخت.  این نگهبان همان را می‌گیرد.
 *
 * اجرا:  node web/scripts/verify-i18n-keys.mjs
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const WEB = 'D:\\aziz\\molido-ai\\Molido-AI-main\\web';
const dict = readFileSync(join(WEB, 'lib', 'i18n.ts'), 'utf8');

const keys = new Set();
for (const m of dict.matchAll(/^ {2}([a-zA-Z0-9_]+):\s*\{/gm)) keys.add(m[1]);

function walk(d) {
  const out = [];
  for (const n of readdirSync(d)) {
    const f = join(d, n);
    if (statSync(f).isDirectory()) out.push(...walk(f));
    else if (f.endsWith('.tsx')) out.push(f);
  }
  return out;
}

const bad = [];
let total = 0;
for (const root of ['app', 'components']) {
  for (const f of walk(join(WEB, root))) {
    const text = readFileSync(f, 'utf8');
    for (const m of text.matchAll(/\bt\('([a-zA-Z0-9_]+)'\)/g)) {
      total += 1;
      if (!keys.has(m[1])) bad.push(`${f.slice(WEB.length + 1)}: ${m[1]}`);
    }
  }
}

console.log(`  کلید در واژه‌نامه: ${keys.size}   فراخوانی t(): ${total}`);
console.log();
if (bad.length === 0) {
  console.log('  OK   هر کلیدی که صدا زده می‌شود در واژه‌نامه هست');
  console.log();
  console.log('   PASS: 1   FAIL: 0');
  process.exit(0);
}
console.log(`  FAIL ${bad.length} کلیدِ ناموجود — کاربر خودِ کلید را می‌بیند:`);
for (const b of bad.slice(0, 15)) console.log(`       ${b}`);
console.log();
console.log('   PASS: 0   FAIL: 1');
process.exit(1);

/**
 * رمزِ پیش‌فرضِ سفت‌شده در کد نمانده باشد.
 *
 * پیدا شده در بازرسی: `N8N_WEBHOOK_SECRET` در دو جا پیش‌فرضِ
 * `'molido_n8n_secret'` داشت — رمزی که در مخزنِ **عمومی** گیت‌هاب
 * نوشته شده بود.
 *
 * تولید امن بود چون متغیر تنظیم شده بود.  ولی هر استقرارِ تازه‌ای که
 * آن را جا می‌انداخت، بی‌هیچ خطا و هشدار با رمزی کار می‌کرد که همه
 * می‌دانند — و چون **کار می‌کرد**، کسی متوجه نمی‌شد.
 *
 * درِ باز که شبیه درِ قفل به نظر می‌رسد، از درِ باز بدتر است.
 *
 * ⚠️ هر `??` روی `config.get` بد نیست.
 *
 *    `AI_MODEL ?? 'gpt-4o-mini'` یا `ARI_CONTEXT ?? 'from-internal'`
 *    پیش‌فرضِ درست‌اند: راز نیستند و نبودشان چیزی را باز نمی‌کند.
 *
 *    آنچه ممنوع است، پیش‌فرضِ **غیرخالی** برای متغیری است که نامش
 *    راز را می‌رساند.  پیش‌فرضِ خالی (`?? ''`) مجاز است چون بسته
 *    می‌ماند، نه باز.
 *
 * اجرا:  node web/scripts/verify-no-default-secrets.mjs
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, '..', '..', 'backend', 'src');

/** نامِ متغیری که راز را می‌رساند. */
const SECRETISH = /(SECRET|PASSWORD|PASSWD|TOKEN|API_?KEY|PRIVATE_?KEY|CREDENTIAL)/i;

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (full.endsWith('.ts') && !full.endsWith('.spec.ts')) out.push(full);
  }
  return out;
}

const offences = [];

for (const file of walk(SRC)) {
  const text = readFileSync(file, 'utf8');
  const lines = text.split('\n');

  lines.forEach((line, i) => {
    // توضیح، خودش کد نیست — و توضیحاتِ همین رفع، نام رمز قدیمی را
    // نگه داشته‌اند تا کسی دوباره همان راه را نرود.
    const t = line.trim();
    if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return;

    // config.get<...>('X') ?? 'مقدار'
    const m = line.match(
      /get<[^>]*>\(\s*['"]([A-Z0-9_]+)['"]\s*\)[^?]*\?\?\s*(['"])(.*?)\2/,
    );
    if (!m) return;

    const [, envName, , fallback] = m;
    if (!SECRETISH.test(envName)) return;
    if (fallback === '') return; // خالی یعنی بسته — مجاز

    offences.push({
      file: relative(SRC, file),
      line: i + 1,
      envName,
      fallback,
    });
  });
}

if (offences.length === 0) {
  console.log('  OK   رمز پیش‌فرضِ سفت‌شده نیست');
  console.log('\n   PASS: 1   FAIL: 0');
  process.exit(0);
}

console.log(`  FAIL ${offences.length} رمز پیش‌فرض در کد:`);
for (const o of offences) {
  console.log(
    `       ${o.file}:${o.line}  ${o.envName} ?? "${o.fallback}"` +
      '  => باید در نبودش بسته بماند، نه باز',
  );
}
console.log('\n   PASS: 0   FAIL: 1');
process.exit(1);

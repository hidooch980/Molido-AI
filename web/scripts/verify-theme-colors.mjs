/**
 * رنگِ خامِ معنایی در استایل نمانده باشد.
 *
 * پنل پنج پوسته دارد و هر کدام `--danger`/`--success`/`--warning`
 * خودش را متناسب با زمینه‌اش تعریف می‌کند.  رنگی که مستقیم در
 * `style={{...}}` نوشته شود از این نظام بیرون می‌ماند و در پوستهٔ
 * ناهم‌خوان ناخوانا می‌شود.
 *
 * اندازه‌گیری‌شده، پیش از اصلاح:
 *
 *     پوسته       نقش      خام    توکن
 *     ─────────────────────────────────
 *     پیش‌فرض     خطا      ۲٫۸۹   ۶٫۷۷
 *     شب          خطا      ۲٫۸۸   ۶٫۷۴
 *     شب          موفقیت   ۳٫۴۰   ۱۰٫۳۰
 *
 * یعنی کاربرِ پوستهٔ تیره پیامِ خطا را کم‌رنگ‌ترین متنِ صفحه می‌دید.
 *
 * ⚠️ هر «#رنگ» استایل نیست.
 *
 *    `PALETTE` و `PRESETS` رنگ‌هایی‌اند که کاربر انتخاب می‌کند و در
 *    پایگاه داده ذخیره می‌شوند — داده‌اند نه ظاهر.  `var(--success)`
 *    در ستون پایگاه داده هیچ معنایی ندارد، پس استثنا می‌شوند.
 *
 * اجرا: node web/scripts/verify-theme-colors.mjs
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const APP = join(here, '..', 'app');

/** رنگ‌هایی که توکنِ معنایی دارند و نباید خام بیایند. */
const BANNED = {
  '#b91c1c': 'var(--danger)',
  '#047857': 'var(--success)',
  '#b45309': 'var(--warning)',
};

/** خطی که رنگ را به‌عنوان داده نگه می‌دارد، نه ظاهر. */
const isData = (line) => line.includes('hex:') || line.includes('PRESETS');

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (name.endsWith('.tsx')) out.push(full);
  }
  return out;
}

const offences = [];
for (const file of walk(APP)) {
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    if (isData(line)) return;
    for (const [raw, token] of Object.entries(BANNED)) {
      if (line.toLowerCase().includes(raw)) {
        offences.push(
          `${relative(APP, file)}:${i + 1}  ${raw} -> ${token}`,
        );
      }
    }
  });
}

if (offences.length === 0) {
  console.log('  OK   رنگ خام معنایی در استایل نیست');
  console.log('\n   PASS: 1   FAIL: 0');
  process.exit(0);
}

console.log(`  FAIL ${offences.length} رنگ خام در استایل مانده:`);
for (const o of offences) console.log(`       ${o}`);
console.log('\n   PASS: 0   FAIL: 1');
process.exit(1);

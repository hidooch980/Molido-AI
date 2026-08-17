/**
 * هر برچسب به ورودیِ خودش وصل باشد.
 *
 * `<label>سلام</label><input />` برچسبِ **دیداری** است، نه برنامه‌ای.
 * چشم ارتباط را می‌بیند؛ صفحه‌خوان ورودیِ بی‌نام می‌خواند.
 *
 * دو راهِ درست هست و هر دو مجازند:
 *
 *     صریح:  <label htmlFor="x">نام</label>  <input id="x" />
 *     ضمنی:  <label>نام <input /></label>
 *
 * ⚠️ گرپِ ساده اینجا جواب نمی‌دهد.
 *
 *    شمارشِ خامِ «label بدون htmlFor» عدد ۷۲ داد، و «label که ورودی
 *    را در بر می‌گیرد» عدد ۷۴ — با همپوشانی.  یعنی هیچ‌کدام تعداد
 *    واقعیِ خرابی نبود.
 *
 *    این ابزار هر برچسب را تا `</label>` می‌خواند و می‌پرسد کدام یک
 *    از دو راه را رفته.
 *
 * اجرا:  node web/scripts/verify-labels.mjs
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ROOTS = [join(here, '..', 'app'), join(here, '..', 'components')];

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (full.endsWith('.tsx')) out.push(full);
  }
  return out;
}

/** شمارهٔ خط برای یک جایگاه در متن. */
const lineAt = (text, index) => text.slice(0, index).split('\n').length;

const broken = [];
let ok = 0;

for (const root of ROOTS) {
  for (const file of walk(root)) {
    const text = readFileSync(file, 'utf8');

    // هر <label ...> را پیدا کن
    const openTag = /<label\b([^>]*)>/g;
    let m;
    while ((m = openTag.exec(text)) !== null) {
      const attrs = m[1];

      // راهِ صریح
      if (/\bhtmlFor\s*=/.test(attrs)) {
        ok += 1;
        continue;
      }

      // راهِ ضمنی: تا بسته شدن همین برچسب، ورودی هست؟
      const close = text.indexOf('</label>', m.index);
      const inner = close === -1 ? '' : text.slice(m.index, close);
      if (/<(input|select|textarea)\b/.test(inner)) {
        ok += 1;
        continue;
      }

      // ⚠️ کامپوننتِ پوششی — `{children}` هم ارتباطِ ضمنی است.
      //
      //    نسخهٔ اول این ابزار پنج مورد را خرابی شمرد که همه یک
      //    `Field` مشترک بودند:
      //
      //        <label><span>{label}</span>{children}</label>
      //
      //    ورودی از فراخواننده می‌آید و در زمان اجرا **درون** برچسب
      //    می‌نشیند، پس ارتباط برقرار است.  ابزار آن را نمی‌دید و
      //    اگر باورش می‌کردم، پنج جای سالم را «درست» می‌کردم.
      if (/\{\s*(props\.)?children\s*\}/.test(inner)) {
        ok += 1;
        continue;
      }

      // برچسبی که فقط نقشِ عنوان دارد و ورودی‌ای در کار نیست، خرابی
      // نیست — ولی از بیرون نمی‌شود فهمید.  پس گزارش می‌شود تا آدم
      // نگاه کند.
      broken.push({
        file: relative(join(here, '..'), file),
        line: lineAt(text, m.index),
        text: (inner.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() || '?')
          .slice(0, 32),
      });
    }
  }
}

console.log(`  برچسبِ وصل‌شده: ${ok}   ·   بی‌ارتباط: ${broken.length}`);

if (broken.length === 0) {
  console.log('  OK   هر برچسب به ورودی‌اش وصل است');
  console.log(`\n   PASS: 1   FAIL: 0`);
  process.exit(0);
}

console.log('  FAIL برچسب‌های بی‌ارتباط:');
const byFile = {};
for (const b of broken) (byFile[b.file] ??= []).push(b);
for (const [file, items] of Object.entries(byFile).sort(
  (a, b) => b[1].length - a[1].length,
)) {
  console.log(`       ${file}  (${items.length})`);
  for (const i of items.slice(0, 4)) {
    console.log(`         :${i.line}  «${i.text}»`);
  }
  if (items.length > 4) console.log(`         … و ${items.length - 4} تای دیگر`);
}
console.log(`\n   PASS: 0   FAIL: 1`);
process.exit(1);

/**
 * کنتراست هر توکنِ متنی، در هر پوسته، روی زمینهٔ خودِ همان پوسته.
 *
 * امروز سه توکن دستی سنجیده شد و شش شکست پیدا شد.  این ابزار همان
 * محاسبه را روی **همهٔ** توکن‌ها و **همهٔ** پوسته‌ها می‌برد — چون
 * سنجیدنِ آن‌هایی که به آن‌ها دست زده‌ام، فقط اشتباهات امروز را پیدا
 * می‌کند، نه اشتباهات دیروز را.
 *
 * مقدارها از خودِ `globals.css` خوانده می‌شوند، نه از فهرستِ دستی:
 * فهرست دستی با اولین تغییرِ رنگ کهنه می‌شود و بی‌صدا دروغ می‌گوید.
 *
 * ⚠️ حدها:
 *
 *    متن معمولی      ۴٫۵    (WCAG AA)
 *    متن بزرگ/پررنگ  ۳٫۰
 *    عنصر غیرمتنی    ۳٫۰    (مرز، آیکون، نوار)
 *
 *    توکن‌های `--border` و `--ring` با حد ۳ سنجیده می‌شوند چون متن
 *    رویشان نمی‌نشیند.  بقیه با ۴٫۵، چون ممکن است هر جایی متن شوند.
 *
 * اجرا:  node web/scripts/audit-contrast.mjs
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const CSS = readFileSync(join(here, '..', 'app', 'globals.css'), 'utf8');

// ---------------------------------------------------------------- رنگ

function parseHex(h) {
  const s = h.replace('#', '').trim();
  const full =
    s.length === 3
      ? s
          .split('')
          .map((c) => c + c)
          .join('')
      : s.slice(0, 6);
  if (!/^[0-9a-f]{6}$/i.test(full)) return null;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255);
}

function luminance(hex) {
  const p = parseHex(hex);
  if (!p) return null;
  const c = p.map((x) =>
    x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

function ratio(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  if (la === null || lb === null) return null;
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// -------------------------------------------------------------- خواندن

/** بلوکِ یک انتخابگر را برمی‌دارد و توکن‌های hex اش را درمی‌آورد. */
function readBlock(selector) {
  const start = CSS.indexOf(selector + ' {');
  if (start === -1) return null;
  const end = CSS.indexOf('\n}', start);
  const body = CSS.slice(start, end);
  const out = {};
  for (const m of body.matchAll(/(--[a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\s*;/g)) {
    out[m[1]] = m[2];
  }
  return out;
}

const base = readBlock(':root');
if (!base) {
  console.log('  FAIL بلوک :root در globals.css پیدا نشد');
  process.exit(1);
}

const THEMES = ['minimal', 'night', 'turquoise', 'paper'];
const themes = { 'پیش‌فرض': base };
for (const name of THEMES) {
  const block = readBlock(`[data-theme='${name}']`);
  // پوسته فقط چیزهایی را که عوض می‌کند تعریف می‌کند؛ بقیه از :root
  // ارث می‌رسد.  بدون این ادغام، توکنِ ارث‌رسیده اصلاً سنجیده نمی‌شد.
  if (block) themes[name] = { ...base, ...block };
}

/**
 * چه چیزی با چه چیزی سنجیده شود.
 *
 * ⚠️ نسخهٔ اول این ابزار همه‌چیز را با `--bg` می‌سنجید و یازده شکست
 *    داد که چهارتایش بی‌معنی بود:
 *
 *      `--on-primary` سفید است و با زمینهٔ سفید ۱٫۰۰ می‌دهد — ولی
 *      هیچ‌وقت روی زمینه نمی‌نشیند؛ روی `--primary` می‌نشیند.
 *
 *    ابزاری که شکستِ ساختگی بسازد بدتر از نداشتنش است: یا وقت صرفِ
 *    رفعِ چیزِ سالم می‌شود، یا کسی یاد می‌گیرد خروجی‌اش را نادیده
 *    بگیرد.  پس هر توکن با **جفتِ درستِ خودش** سنجیده می‌شود.
 */
const PAIRS = [
  // متن روی زمینهٔ رنگی — جفتشان معنی دارد، نه زمینهٔ صفحه
  ['--on-primary', '--primary', 4.5],
  ['--on-accent', '--accent', 4.5],
  ['--on-danger', '--danger', 4.5],
];

/**
 * رنگ‌ها روی زمینهٔ صفحه — با حدی که **کاربردشان** تعیین می‌کند.
 *
 * ⚠️ حد از روی شمارشِ واقعیِ استفاده در `globals.css` آمده، نه از
 *    حدس:
 *
 *      --primary    زمینه ۹ بار، مرز ۴ بار، متن **صفر** بار
 *      --primary-2  زمینه ۴ بار، متن **صفر** بار
 *      --accent     زمینه ۶ بار، متن ۱ بار
 *
 *    چیزی که هیچ‌وقت متن نمی‌شود، لازم نیست ۴٫۵ بدهد؛ برای عنصرِ
 *    غیرمتنی حد ۳ است (WCAG 1.4.11).  آنچه باید ۴٫۵ بدهد، متنی است
 *    که **رویش** می‌نشیند — و آن با `PAIRS` سنجیده می‌شود.
 *
 *    اگر روزی `--primary` رنگِ متن شد، این حد باید ۴٫۵ شود.  همین
 *    توضیح جای آن یادآوری است.
 */
const ON_BG = [
  ['--text', 4.5],
  ['--text-dim', 4.5],
  ['--success', 4.5],
  ['--danger', 4.5],
  ['--warning', 4.5],
  ['--accent', 4.5], // یک بار به‌عنوان `color:` استفاده می‌شود
  ['--primary', 3], // فقط زمینه و مرز
  ['--primary-2', 3], // فقط زمینه
];

// ⚠️ `--border` و `--ring` عمداً سنجیده نمی‌شوند.
//
//    جداکنندهٔ میان دو سطح، «عنصر رابط» به معنای WCAG نیست — چیزی را
//    منتقل نمی‌کند که بدونش اطلاعاتی گم شود.  رساندنش به ۳ یعنی هر
//    پنل قاب تیره بگیرد، که هم زشت است هم بی‌فایده.

let pass = 0;
const fails = [];

for (const [theme, tokens] of Object.entries(themes)) {
  const bg = tokens['--bg'];
  if (!bg) continue;

  for (const [name, limit] of ON_BG) {
    const value = tokens[name];
    if (!value || !parseHex(value)) continue;
    const r = ratio(value, bg);
    if (r === null) continue;
    if (r >= limit) pass += 1;
    else fails.push({ theme, name, value, against: '--bg', r, limit });
  }

  for (const [fg, against, limit] of PAIRS) {
    const value = tokens[fg];
    const base2 = tokens[against];
    if (!value || !base2 || !parseHex(value) || !parseHex(base2)) continue;
    const r = ratio(value, base2);
    if (r === null) continue;
    if (r >= limit) pass += 1;
    else fails.push({ theme, name: fg, value, against, r, limit });
  }
}

console.log(`  پوسته: ${Object.keys(themes).length}  ·  سنجش: ${pass + fails.length}`);
console.log();

if (fails.length === 0) {
  console.log('  OK   همهٔ توکن‌ها در همهٔ پوسته‌ها بالای حدند');
  console.log(`\n   PASS: ${pass}   FAIL: 0`);
  process.exit(0);
}

console.log('  FAIL توکن‌های زیر حد:');
for (const f of fails.sort((a, b) => a.r - b.r)) {
  console.log(
    `       ${f.theme.padEnd(11)} ${f.name.padEnd(15)} ${f.value} ` +
      `روی ${f.against.padEnd(11)} ${f.r.toFixed(2)}  (حد ${f.limit})`,
  );
}
console.log(`\n   PASS: ${pass}   FAIL: ${fails.length}`);
process.exit(1);

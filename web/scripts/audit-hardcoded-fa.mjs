/**
 * متنِ فارسیِ سفت‌شده در رابط — که برای کاربر عربی و انگلیسی نمی‌چرخد.
 *
 * ⚠️ این ابزار **گزارش** می‌دهد، نه شکست.
 *
 *    `verify-i18n` می‌سنجد که هر کلیدِ داخلِ واژه‌نامه هر سه زبان را
 *    داشته باشد — و همه دارند.  ولی متنی که اصلاً وارد واژه‌نامه نشده
 *    از چشمش پنهان است.  همان دامی که برچسب‌های بی‌ارتباط داشتند:
 *    نگهبانی که فقط چیزهای ثبت‌شده را می‌پاید، نبودن را نمی‌بیند.
 *
 *    اینجا بی‌سقف فقط گزارش می‌دهد، چون رفعِ همهٔ ۲۸۹ رشته تصمیمِ
 *    محصول است نه اشکالِ روشن: اگر کاربرانِ یک نصب همه فارسی‌زبان
 *    باشند، هیچ آسیبی نمی‌زند.
 *
 *    ولی با `--max` تبدیل به سنجه می‌شود، و در فهرست اجرا با سقفِ
 *    امروز ثبت شده.  یعنی **بدتر نمی‌شود**: هر رشتهٔ سفت‌شدهٔ تازه‌ای
 *    که کسی بنویسد، همان‌جا گرفته می‌شود.  عددِ سقف با هر رفعی باید
 *    پایین بیاید، نه بالا.
 *
 * برای شکست دادن روی سقف:  node ... --max 289
 *
 * اجرا:  node web/scripts/audit-hardcoded-fa.mjs
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ROOTS = [join(here, '..', 'app'), join(here, '..', 'components')];

const maxFlag = process.argv.indexOf('--max');
const MAX = maxFlag !== -1 ? Number(process.argv[maxFlag + 1]) : null;

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (full.endsWith('.tsx')) out.push(full);
  }
  return out;
}

/**
 * چیزهایی که فارسی‌اند ولی ترجمه نمی‌خواهند.
 *
 * واحد پول و نشانه‌های عددی در هر سه زبانِ این سامانه یکی می‌مانند:
 * فاکتورِ عربیِ یک فروشگاه ایرانی هم مبلغ را به ریال می‌نویسد.
 */
const SKIP = /^[\s·—–\-|/،,.:؛()«»۰-۹0-9٪%]*$/;

/**
 * ⚠️ توضیحِ فارسی داخل JSX، رشتهٔ رابط نیست.
 *
 *    این پروژه توضیحاتِ فارسیِ مفصل دارد، و بعضی‌شان بین `{` و `}`
 *    داخل JSX می‌نشینند.  الگو آن‌ها را «متنِ ترجمه‌نشده» می‌شمرد.
 *
 *    چهار موردِ آخرِ گزارش همه از این دست بودند — یعنی عدد می‌گفت
 *    «چهار تا مانده» در حالی که صفر مانده بود.  ابزاری که کارِ
 *    تمام‌شده را ناتمام نشان دهد، همان‌قدر بد است که ناتمام را
 *    تمام‌شده نشان دهد.
 */
const IS_COMMENT = /(^|\s)\/\/|\/\*|\*\//;

const perFile = {};
let total = 0;

for (const root of ROOTS) {
  for (const file of walk(root)) {
    const text = readFileSync(file, 'utf8');
    const hits = [];

    // ⚠️ کلاسِ نویسه‌ها `;` و `=` را هم بیرون می‌گذارد.
    //
    //    نسخهٔ اول فقط `[^<>{}]*` داشت.  آن الگو از خطِ جدید رد
    //    می‌شد — که برای متنِ پاراگرافیِ چندخطیِ JSX **لازم** است —
    //    ولی همان‌جا از یک `>` در کد (مثلاً `useState<T>`) تا یک `<`
    //    ده خط پایین‌تر هم می‌رفت و کلِ بلوکِ کد را یک «رشتهٔ رابط»
    //    می‌شمرد.
    //
    //    نتیجه‌اش شمارشِ ۲٫۴ برابر بود: ۲۵۱ به‌جای ۱۰۶.
    //
    //    `;` و `=` در متنِ فارسیِ رابط نمی‌آیند ولی در کد همیشه
    //    هستند.  بیرون گذاشتنشان بلوکِ کد را رد می‌کند و پاراگرافِ
    //    چندخطی را نگه می‌دارد.
    //
    //    ابزارِ شمارش که خودش اشتباه بشمارد، بقیهٔ عددهایش هم
    //    مشکوک می‌شوند — و کسی که بر مبنایش تصمیم می‌گیرد، بر
    //    چیزی تصمیم گرفته که نمی‌داند چقدر دقیق است.
    for (const m of text.matchAll(/>([^<>{}=;]*[؀-ۿ][^<>{}=;]*)</g)) {
      const s = m[1].replace(/\s+/g, ' ').trim();
      if (!s || SKIP.test(s)) continue;
      if (IS_COMMENT.test(s)) continue;
      hits.push(s.slice(0, 40));
    }

    // ⚠️ متن در **صفت** هم هست — و این ابزار مدت‌ها ندیدش.
    //
    //    وقتی شمارشِ متنِ بین تگ‌ها به صفر رسید، گزارش دادم «پنل
    //    کاملاً سه‌زبانه شد».  غلط بود: ۱۸۰ رشته در صفت‌ها مانده
    //    بود — `label`، `placeholder`، `aria-label`، `title`.
    //
    //    و این‌ها کم‌اهمیت نیستند: `label` برچسبِ فرم است که کاربر
    //    مستقیم می‌خواند، و `aria-label` تنها چیزی است که صفحه‌خوان
    //    می‌گوید.  یعنی نابینای عرب‌زبان، رابطی که همه‌جایش عربی است
    //    را با دکمه‌هایی می‌شنید که فارسی معرفی می‌شوند.
    //
    //    ابزاری که یک دستهٔ کامل را نبیند، «صفر» اش هیچ معنایی
    //    ندارد — و بدتر: کارِ ناتمام را تمام‌شده اعلام می‌کند.
    for (const m of text.matchAll(/\b([a-zA-Z-]+)=(["'])([^"']*[؀-ۿ][^"']*)\2/g)) {
      const value = m[3].replace(/\s+/g, ' ').trim();
      if (!value || SKIP.test(value)) continue;
      hits.push(`${m[1]}="${value.slice(0, 34)}"`);
    }

    if (hits.length) {
      perFile[relative(join(here, '..'), file)] = hits;
      total += hits.length;
    }
  }
}

const files = Object.entries(perFile).sort((a, b) => b[1].length - a[1].length);

/**
 * ⚠️ فروشگاه از پنل جدا شمرده می‌شود.
 *
 *    فروشگاه **صفر** فراخوانی `t()` دارد و i18n را اصلاً import
 *    نمی‌کند: ویترینِ تک‌بازاری است و فارسی بودنش تصمیم است، نه
 *    فراموشی.
 *
 *    پنل ۱۱۴۱ فراخوانی `t()` دارد — یعنی آنجا ترجمه **خواسته شده**
 *    و رشتهٔ سفت‌شده شکاف است.
 *
 *    قاطی کردنِ این دو، عددی می‌سازد که نه بیانگرِ اشکال است نه
 *    بیانگرِ سلامت.  ابزاری که دو چیزِ متفاوت را یک عدد کند، کسی را
 *    به کارِ درست راهنمایی نمی‌کند.
 */
const isShop = (f) => /[\\/]shop[\\/]/.test(f);
const panel = files.filter(([f]) => !isShop(f));
const shop = files.filter(([f]) => isShop(f));
const sum = (list) => list.reduce((n, [, h]) => n + h.length, 0);

console.log(`  پنل (سه‌زبانه):     ${sum(panel)} رشته در ${panel.length} فایل  <- شکاف`);
console.log(`  فروشگاه (تک‌زبانه): ${sum(shop)} رشته در ${shop.length} فایل  <- عمدی`);
console.log();
console.log('  بیشترین در پنل:');
for (const [file, hits] of panel.slice(0, 10)) {
  console.log(`  ${String(hits.length).padStart(4)}  ${file}`);
}
if (panel.length > 10) console.log(`        … و ${panel.length - 10} فایل دیگر`);

if (MAX === null) {
  console.log('\n  (گزارشی است، نه سنجه — با --max <عدد> سقف بگذارید)');
  console.log(`\n   PASS: 1   FAIL: 0`);
  process.exit(0);
}

console.log();
const measured = sum(panel);
if (measured <= MAX) {
  console.log(`  OK   پنل ${measured} <= سقف ${MAX}`);
  console.log(`\n   PASS: 1   FAIL: 0`);
  process.exit(0);
}
console.log(`  FAIL پنل ${measured} > سقف ${MAX} — رشتهٔ سفت‌شدهٔ تازه اضافه شده`);
console.log(`\n   PASS: 0   FAIL: 1`);
process.exit(1);

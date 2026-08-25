/**
 * نگهبانِ همگامیِ قابلیت‌ها بین وب و بک‌اند.
 *
 * ⚠️ چرا لازم شد؟
 *
 *    `web/lib/product.ts` در کامنتِ خودش نوشته بود «فهرست قابلیت‌ها
 *    باید با `backend/src/product.ts` یکی بماند» — و نبود.
 *
 *    وب `municipality` داشت و بک‌اند `municipal`.  سه قابلیتِ
 *    `verticals`، `operations` و `shop` هم اصلاً در وب نبودند.
 *
 * ⚠️ خرابی **بی‌صدا** بود، و این بدترین نوعش است.
 *
 *    نامِ ناهماهنگ خطا نمی‌دهد؛ فقط باعث می‌شود کسی از آن کلید استفاده
 *    نکند.  نتیجه‌اش یازده صفحهٔ شهرداریِ بی‌گیت بود: کاربرِ فروشگاه
 *    «پارکینگ» را در منو می‌دید، کلیک می‌کرد، و ۴۰۴ می‌گرفت — چون
 *    ماژولش در آن محصول اصلاً بار نمی‌شود.
 *
 *    کامنتی که می‌گوید «باید یکی بماند» تضمین نیست.  این فایل هست.
 *
 * ⚠️ این نگهبان **CI را می‌شکند**، برخلافِ `verify-api-reachable`.
 *
 *    آنجا مثبتِ کاذب ممکن بود (نقطهٔ عمداً بی‌رابط).  اینجا نه: دو
 *    فهرست یا یکی‌اند یا نیستند.  ناهماهنگی همیشه بدهی است.
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');

/** نام‌های قابلیت از دلِ `export type FeatureKey = ...` */
function featureKeys(file) {
  const src = readFileSync(file, 'utf8');
  const m = src.match(/export type FeatureKey =([\s\S]*?);/);
  if (!m) throw new Error(`FeatureKey در ${file} پیدا نشد`);
  return [...m[1].matchAll(/'([a-z]+)'/g)].map((x) => x[1]);
}

/**
 * قابلیت‌های هر محصول.
 *
 * ⚠️ دو فایل دو شکل دارند: بک‌اند `features: [...]` داخلِ هر محصول، وب
 *    یک نگاشتِ `FEATURES`.  پس هرکدام الگوی خودش را دارد و مقایسه روی
 *    **نتیجه** انجام می‌شود، نه روی متن.
 */
function backendProducts(file) {
  const src = readFileSync(file, 'utf8');
  const out = {};
  for (const m of src.matchAll(
    /(store|resto|suite):\s*\{[\s\S]*?features:\s*\[([\s\S]*?)\]/g,
  )) {
    out[m[1]] = [...m[2].matchAll(/'([a-z]+)'/g)].map((x) => x[1]).sort();
  }
  return out;
}

function webProducts(file) {
  const src = readFileSync(file, 'utf8');
  const m = src.match(/const FEATURES[^=]*=\s*\{([\s\S]*?)\n\};/);
  if (!m) throw new Error(`FEATURES در ${file} پیدا نشد`);
  const out = {};
  for (const p of m[1].matchAll(/(store|resto|suite):\s*\[([\s\S]*?)\]/g)) {
    out[p[1]] = [...p[2].matchAll(/'([a-z]+)'/g)].map((x) => x[1]).sort();
  }
  return out;
}

const beFile = join(root, 'backend', 'src', 'product.ts');
const weFile = join(root, 'web', 'lib', 'product.ts');

const problems = [];

const beKeys = featureKeys(beFile).sort();
const weKeys = featureKeys(weFile).sort();

for (const k of beKeys) {
  if (!weKeys.includes(k)) problems.push(`قابلیتِ «${k}» در بک‌اند هست ولی در وب نیست`);
}
for (const k of weKeys) {
  if (!beKeys.includes(k)) problems.push(`قابلیتِ «${k}» در وب هست ولی در بک‌اند نیست`);
}

const be = backendProducts(beFile);
const we = webProducts(weFile);

for (const product of ['store', 'resto', 'suite']) {
  const a = be[product];
  const b = we[product];
  if (!a) { problems.push(`محصولِ «${product}» در بک‌اند پیدا نشد`); continue; }
  if (!b) { problems.push(`محصولِ «${product}» در وب پیدا نشد`); continue; }
  const missing = a.filter((f) => !b.includes(f));
  const extra = b.filter((f) => !a.includes(f));
  if (missing.length) problems.push(`«${product}»: در وب کم است → ${missing.join('، ')}`);
  if (extra.length) problems.push(`«${product}»: در وب اضافه است → ${extra.join('، ')}`);
}

console.log('--- همگامیِ قابلیت‌های محصول (وب ↔ بک‌اند) ---');
console.log();

if (problems.length === 0) {
  console.log(`  OK   ${beKeys.length} قابلیت و ۳ محصول، هر دو سو یکسان`);
  console.log();
  process.exit(0);
}

for (const p of problems) console.log(`  FAIL ${p}`);
console.log();
console.log(`  ⚠️ ${problems.length} ناهماهنگی.  منو صفحه‌هایی را نشان می‌دهد که`);
console.log('     اندپوینتشان در این محصول بار نشده — یعنی ۴۰۴ برای کاربر.');
console.log();
process.exit(1);

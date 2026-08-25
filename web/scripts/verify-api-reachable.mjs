/**
 * نگهبانِ «نقطهٔ API بی‌رابط».
 *
 * ⚠️ چرا لازم شد؟
 *
 *    در یک روز **پنج بار** به همین برخوردم: نقطهٔ API ساخته شده،
 *    آزمون دارد، کار می‌کند — و هیچ صفحه‌ای صدایش نمی‌زند.  کالابرگ،
 *    نظرات، تعاملاتِ CRM، بودجه، و ردیف‌های بودجه.
 *
 *    هر بار تصادفی پیدایش کردم، نه با ابزار.  کاری که فقط با دقتِ
 *    آدم پیدا می‌شود، دیر یا زود از قلم می‌افتد.
 *
 * ⚠️ نتیجه **بر پایهٔ محصول** خوانده می‌شود، نه کلِ مخزن.
 *
 *    نخستین نسخهٔ این نگهبان ۲۲۴ مسیرِ «بی‌رابط» گزارش داد و بخشِ
 *    بزرگی‌اش **مثبتِ کاذب** بود: ماژول‌های شهرداری در `app.module`
 *    پشتِ `FEATURE_MODULES` قرار دارند و در محصولِ `store` اصلاً
 *    بارگذاری نمی‌شوند — پس نبودِ صفحه برایشان بدهی نیست.
 *
 *    خودِ همین اشتباه نشان داد چرا این ابزار نباید CI را بشکند.
 *
 * ⚠️ این نگهبان **هشدار** می‌دهد، نه شکست.
 *
 *    بعضی نقطه‌ها عمداً بی‌رابط‌اند: وب‌هوک، مسیرِ داخلیِ سرویس‌ها،
 *    نقطه‌ای که فقط اپِ موبایل صدا می‌زند.  شکست دادنِ CI روی این‌ها
 *    یعنی توسعه‌دهنده یاد می‌گیرد نادیده‌اش بگیرد — و آن‌وقت هشدارِ
 *    واقعی هم گم می‌شود.
 *
 *    پس خروجی صفر است و فقط فهرست را نشان می‌دهد.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');

/** مسیرهایی که عمداً رابط ندارند و هشدارشان نویز است. */
const EXEMPT = [
  /^auth\//, // مسیرِ احراز هویت را `lib/api` می‌زند، نه صفحه
  /^health/,
  /^metrics/,
  /^webhook/,
  /^n8n\//,
  /^tax\/queue/, // صفِ ارسالِ مالیاتی، کارِ پس‌زمینه
  /^telephony\//, // از دلِ صفحهٔ منشیِ خرید صدا زده می‌شود
];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

// ---------- ۱) نقطه‌های بک‌اند، از خودِ کنترلرها ----------

const controllers = walk(join(root, 'backend', 'src')).filter((f) =>
  f.endsWith('.controller.ts'),
);

const endpoints = [];
for (const file of controllers) {
  const src = readFileSync(file, 'utf8');
  const prefix = src.match(/@Controller\(\s*'([^']*)'/)?.[1] ?? '';

  // ⚠️ فقط قطعهٔ **پیش از** هر متد خوانده می‌شود، نه کلِ فایل: یک
  //    فایل می‌تواند دو کنترلر با دو پیشوند داشته باشد.
  const re = /@Controller\(\s*'([^']*)'\s*\)([\s\S]*?)(?=@Controller\(|$)/g;
  let block;
  let found = false;
  while ((block = re.exec(src))) {
    found = true;
    const [, pfx, body] = block;
    for (const m of body.matchAll(
      /@(Get|Post|Patch|Put|Delete)\(\s*(?:'([^']*)')?\s*\)/g,
    )) {
      const path = [pfx, m[2] ?? ''].filter(Boolean).join('/');
      endpoints.push(path);
    }
  }
  if (!found && prefix) endpoints.push(prefix);
}

// ---------- ۲) چیزی که وب واقعاً صدا می‌زند ----------

const webFiles = walk(join(root, 'web', 'app')).concat(
  walk(join(root, 'web', 'lib')),
  walk(join(root, 'web', 'components')),
);
const webSource = webFiles.map((f) => readFileSync(f, 'utf8')).join('\n');

/**
 * ریشهٔ مسیر — تا نخستین پارامتر.
 *
 * ⚠️ مقایسهٔ کاملِ مسیر کار نمی‌کند: بک‌اند `orders/:id/confirm` دارد و
 *    وب `` `/orders/${id}/confirm` `` می‌نویسد.  ریشه‌گیری هر دو را به
 *    `orders` می‌رساند و مقایسه معنا پیدا می‌کند.
 */
const rootOf = (p) => p.split('/').filter((s) => s && !s.startsWith(':'))[0] ?? '';

const called = new Set();
for (const m of webSource.matchAll(/['"`]\/([a-z][a-z0-9-]*)(?:[/'"`?])/gi)) {
  called.add(m[1]);
}

// ---------- ۳) گزارش ----------

const groups = new Map();
for (const ep of endpoints) {
  if (EXEMPT.some((r) => r.test(ep))) continue;
  const key = rootOf(ep);
  if (!key) continue;
  if (!groups.has(key)) groups.set(key, 0);
  groups.set(key, groups.get(key) + 1);
}

const orphan = [...groups.entries()]
  .filter(([key]) => !called.has(key))
  .sort((a, b) => b[1] - a[1]);

const total = [...groups.values()].reduce((s, n) => s + n, 0);
const orphanRoutes = orphan.reduce((s, [, n]) => s + n, 0);

console.log('--- نقطه‌های API بدون مصرف‌کنندهٔ وب ---');
console.log();

if (orphan.length === 0) {
  console.log('  OK   هر گروهِ API دست‌کم یک مصرف‌کننده در وب دارد');
} else {
  for (const [key, count] of orphan) {
    console.log(`  •    ${key.padEnd(22)} ${count} مسیر`);
  }
  console.log();
  console.log(
    `  ⚠️ ${orphanRoutes} مسیر از ${total} مسیر هیچ صفحه‌ای صدایشان نمی‌زند.`,
  );
  console.log('     بعضی عمدی‌اند (اپ موبایل، سرویس داخلی)؛ بقیه بدهی‌اند.');
}

console.log();
console.log(`   گروه: ${groups.size}    بی‌رابط: ${orphan.length}`);

// ⚠️ همیشه صفر — این گزارش است نه دروازه.  توضیحش بالای فایل.
process.exit(0);

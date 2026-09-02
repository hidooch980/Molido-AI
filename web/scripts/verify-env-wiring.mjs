/**
 * نگهبانِ رسیدنِ متغیرها به کانتینر.
 *
 * ⚠️ چرا لازم شد؟  چون **چهار بار** تکرار شد.
 *
 *    ۱. `ADMIN_PASSWORD` — نصبِ سرور با رمزِ پیش‌فرض بالا آمد در حالی
 *       که اسکریپت رمزِ قوی ساخته بود.
 *    ۲. `ZARINPAL_MERCHANT_ID` — درگاه همیشه «پیکربندی نشده» می‌گفت.
 *    ۳. `SITE_URL` — نقشهٔ سایت با نشانیِ localhost منتشر می‌شد.
 *    ۴. `API_PUBLIC_URL` — بازگشتِ درگاه به `localhost:3000` می‌رفت،
 *       یعنی پول کسر می‌شد و سفارش `PENDING` می‌ماند.
 *
 * ⚠️ خرابی همیشه **بی‌صدا**ست و همیشه دیر دیده می‌شود.
 *
 *    `.env` فقط برای جای‌گذاری در خودِ `docker-compose.yml` خوانده
 *    می‌شود، نه برای محیطِ داخلِ کانتینر.  متغیری که در فایلِ نمونه
 *    مستند شده ولی در compose پاس نشده، در توسعه کار می‌کند (چون
 *    برنامه بیرونِ داکر اجرا می‌شود) و در تولید ساکت می‌ماند.
 *
 *    یعنی بدترین شکلِ ممکن: مستند شده، به نظر تنظیم‌شده، و بی‌اثر.
 *
 * ⚠️ این نگهبان CI را می‌شکند.
 *
 *    مثبتِ کاذب ممکن است — متغیری که فقط ابزارِ توسعه می‌خواندش.
 *    برای همان `IGNORE` هست: استثنای **نام‌دار** با دلیل، نه سکوت.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');

/**
 * متغیرهایی که عمداً به کانتینر نمی‌روند.
 *
 * هر ورودی باید دلیل داشته باشد — وگرنه همان سکوتی می‌شود که این
 * ابزار برای شکستنش نوشته شده.
 */
/**
 * متغیرهایی که عمداً به کانتینرِ بک‌اند نمی‌روند.
 *
 * ⚠️ فهرست **خالی** است و همین درست است.
 *
 *    نسخهٔ اول بیست استثنا داشت.  با تشخیصِ دقیق‌ترِ نامِ نگاشت‌شده
 *    (`${NAME}` در هر مقدار، نه فقط کلید) همه‌شان بی‌مصرف شدند —
 *    یعنی هر متغیری که مستند شده، جایی در compose مصرف می‌شود.
 *
 *    استثنای غیرلازم یعنی نگهبانی که کمتر می‌بیند.  اگر روزی متغیری
 *    واقعاً استثنا خواست، اینجا با **دلیل** اضافه شود نه با سکوت.
 */
const IGNORE = new Map([
  [
    'WATCHDOG_SMS_TO',
    // دیده‌بان روی **میزبان** اجرا می‌شود (cron)، نه داخل کانتینر —
    // کلِ کارش این است که وقتی کانتینر پایین است هم زنده بماند.
    // پس `.env` را خودش می‌خواند و پاس‌شدن به compose بی‌معناست.
    'ops/watchdog.sh روی میزبان اجرا می‌شود و .env را مستقیم می‌خواند',
  ],
]);

const example = readFileSync(join(root, '.env.example'), 'utf8');
/**
 * ⚠️ **همهٔ** فایل‌های compose خوانده می‌شوند، نه فقط پایه.
 *
 *    نسخهٔ اول فقط `docker-compose.yml` را می‌دید.  متغیری که در یک
 *    overlay پاس می‌شود — مثل نصبِ دوم — «نمی‌رسد» گزارش می‌شد:
 *    مثبتِ کاذب.
 *
 *    وسوسه این بود که استثنا اضافه شود.  ولی آن‌وقت هر متغیرِ
 *    overlay از دیدِ نگهبان پنهان می‌ماند و همان خرابیِ بی‌صدایی که
 *    این ابزار برای گرفتنش نوشته شده، در overlayها آزاد می‌شد.
 *
 *    خواندنِ همهٔ فایل‌ها پوشش را **بیشتر** می‌کند، نه کمتر.
 */
const compose = readdirSync(root)
  .filter((name) => /^docker-compose[\w.-]*\.ya?ml$/.test(name))
  .map((name) => readFileSync(join(root, name), 'utf8'))
  .join('\n');

/** نامِ متغیرها از فایلِ نمونه — کامنت و خطِ خالی کنار می‌روند. */
const documented = [
  ...new Set(
    example
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'))
      .map((l) => l.split('=')[0].trim())
      .filter((n) => /^[A-Z][A-Z0-9_]*$/.test(n)),
  ),
];

/**
 * ⚠️ فقط شکلِ `NAME: ${NAME...}` شمرده می‌شود.
 *
 *    جست‌وجوی سادهٔ نام، هر اشاره‌ای در کامنت را هم می‌گرفت — و آن
 *    دقیقاً همان چیزی است که در `ZARINPAL_MERCHANT_ID` گمراهم کرد:
 *    نامش در کامنت بود، پس «موجود» به نظر می‌رسید.
 */
const wired = new Set(
  [...compose.matchAll(/^\s{4,}([A-Z][A-Z0-9_]*):\s*\$\{/gm)].map((m) => m[1]),
);

/**
 * ⚠️ نامِ کانتینر همیشه با نامِ `.env` یکی نیست.
 *
 *    `N8N_USER` به‌صورت `N8N_BASIC_AUTH_USER: ${N8N_USER}` پاس می‌شود
 *    و `POSTGRES_USER` به‌صورت `PGADMIN_USER`.  نسخهٔ اول این نگهبان
 *    هر دو را «نرسیده» شمرد — مثبتِ کاذب.
 *
 *    پس مقدارِ **داخلِ** `${...}` هم شمرده می‌شود، نه فقط نامِ کلید.
 *    این‌طور استثناهای POSTGRES_* هم دیگر لازم نیستند.
 */
for (const m of compose.matchAll(/\$\{([A-Z][A-Z0-9_]*)[:}]/g)) {
  wired.add(m[1]);
}

const missing = documented.filter((n) => !wired.has(n) && !IGNORE.has(n));

// استثنایی که دیگر لازم نیست، خودش بدهی است.
const staleIgnores = [...IGNORE.keys()].filter(
  (n) => wired.has(n) || !documented.includes(n),
);

console.log('--- رسیدنِ متغیرها به کانتینر ---');
console.log();
console.log(`  مستند در .env.example: ${documented.length}`);
console.log(`  پاس‌شده در compose:     ${wired.size}`);
console.log(`  استثنای نام‌دار:        ${IGNORE.size}`);
console.log();

let bad = false;

if (missing.length) {
  bad = true;
  console.log('  FAIL مستند شده ولی به کانتینر نمی‌رسد:');
  for (const n of missing) console.log(`       ${n}`);
  console.log();
  console.log('     یا در docker-compose.yml پاسش کنید، یا با دلیل به IGNORE اضافه.');
  console.log();
}

if (staleIgnores.length) {
  console.log('  ⚠️ استثنای کهنه (دیگر لازم نیست):');
  for (const n of staleIgnores) console.log(`       ${n}`);
  console.log();
}

if (!bad) console.log('  OK   هر متغیرِ مستند یا پاس می‌شود یا استثنای نام‌دار دارد');
console.log();
console.log(`   PASS: ${bad ? 0 : 1}   FAIL: ${bad ? 1 : 0}`);

process.exit(bad ? 1 : 0);

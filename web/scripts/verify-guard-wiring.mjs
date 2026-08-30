/**
 * دکوراتورِ مجوز بدون نگهبانی که بخواندش.
 *
 * ⚠️ این حفره در آزمون زنده تأیید شد.
 *
 *    `reports.controller.ts` روی مسیرِ گزارش فروش
 *    `@Permission('sales:report')` داشت، فهرست اختیارات نشانش می‌داد،
 *    و مدیر در جدول می‌دید «کارمند: ممنوع».
 *
 *    ولی کنترلر فقط `@UseGuards(JwtAuthGuard)` داشت — `RolesGuard`
 *    نداشت.  یعنی هیچ‌کس آن دکوراتور را نمی‌خواند.
 *
 *    کاربرِ نقشِ EMPLOYEE گزارش فروش را گرفت: ۲۰۰.
 *
 * ⚠️ دکوراتورِ بی‌نگهبان از نبودنش بدتر است.
 *
 *    نبودنش یعنی «اینجا محافظتی نیست» — روشن و قابل بررسی.
 *    بودنش بدون نگهبان یعنی «اینجا محافظت هست» — و دروغ است.
 *    کسی که کد را می‌خواند، آن را امن فرض می‌کند و جلو می‌رود.
 *
 * اجرا:  node web/scripts/verify-guard-wiring.mjs
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// ⚠️ مسیر **نسبی**، نه مطلق.
//
//    نسخهٔ قبلی مسیرِ کاملِ ویندوز را سخت‌کد كرده بود.  یعنی روی
//    سرور، CI، یا ماشینِ هر همکارِ دیگری، `readdirSync` خطا می‌داد و
//    نگهبان اصلاً اجرا نمی‌شد.
//
//    نگهبانی که فقط روی یک ماشین اجرا می‌شود، روی بقیه محافظتی
//    نیست — و بدتر، باورِ محافظت می‌سازد.
const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, '..', '..', 'backend', 'src');

function walk(d) {
  const out = [];
  for (const n of readdirSync(d)) {
    const f = join(d, n);
    if (statSync(f).isDirectory()) out.push(...walk(f));
    else if (f.endsWith('.controller.ts')) out.push(f);
  }
  return out;
}

const bad = [];
let checked = 0;
const unguarded = [];

/**
 * مسیرهایی که عمداً بی‌احراز هویت‌اند — با دلیلشان.
 *
 * `app.controller.ts`     ریشه: فقط نام و نسخه، برای سنجشِ زنده بودن
 * `health/liveness`       healthz/readyz — بالانسر باید بی‌توکن بپرسد
 * `n8n/n8n.controller`    با `x-molido-secret` و مقایسهٔ زمان‌ثابت
 *                         محافظت می‌شود، نه با JWT: n8n کاربر نیست
 * `shop/shop.controller`  فروشگاه اینترنتی: مشتری توکنِ کارمند ندارد و
 *                         نگهبانِ خودش (`CustomerAuthGuard`) را دارد
 */
const PUBLIC_OK = new Set([
  'app.controller.ts',
  'health/liveness.controller.ts',
  'n8n/n8n.controller.ts',
  'shop/shop.controller.ts',
  // ⚠️ ورودِ دولتی **باید** عمومی باشد.
  //
  //    کسی که هنوز وارد نشده توکن ندارد؛ نگهبانِ ورود روی این مسیرها
  //    یعنی هیچ‌کس هرگز نمی‌تواند وارد شود.
  //
  //    محافظتش جای دیگری است و ضعیف‌تر نیست: `state` یک‌بارمصرف و
  //    مهلت‌دار در پایگاه‌داده، PKCE، بررسیِ `nonce`، و از همه مهم‌تر
  //    اینکه کاربرِ پنل هرگز خودکار ساخته نمی‌شود.  `backend/test/gov-sso.sh`
  //    هر چهار مورد را می‌سنجد.
  'gov-sso/gov-sso.controller.ts',
  // ⚠️ سایتِ معرفی هم **باید** عمومی باشد.
  //
  //    خریدارِ ماژول حساب ندارد و قرار هم نیست بسازد؛ نگهبانِ ورود
  //    اینجا یعنی هیچ‌کس نتواند خرید کند.
  //
  //    محافظت جای دیگری است: قیمت از پایگاه‌داده خوانده می‌شود نه از
  //    درخواست، تأییدِ پرداخت از کانالِ پشتیِ درگاه می‌آید، و کدِ
  //    رهگیریِ حدس‌ناپذیر تنها یک سطر را با سیاستِ SELECT-only باز
  //    می‌کند.  `backend/test/site-sales.sh` همین‌ها را می‌سنجد.
  'site/site.controller.ts',
  // ⚠️ منوی دیجیتال هم **باید** عمومی باشد.
  //
  //    مشتری‌ای که QR روی میز را اسکن می‌کند حساب ندارد و قرار هم
  //    نیست بسازد؛ نگهبانِ ورود اینجا یعنی منو اصلاً کار نکند.
  //
  //    محافظت جای دیگری است: توکنِ میزِ حدس‌ناپذیر با سیاستِ
  //    SELECT-only، قیمت از پایگاه‌داده نه از درخواست، ثبتِ سفارشِ
  //    پیش‌فرض خاموش، تأییدِ گارسون، و سقفِ مبلغ.
  //    `backend/test/self-order.sh` همه‌شان را می‌سنجد.
  'self-order/self-order.controller.ts',
]);

for (const file of walk(SRC)) {
  const text = readFileSync(file, 'utf8');
  const rel = file.slice(SRC.length + 1);

  // ─── سنجهٔ دوم: کنترلری که اصلاً محافظت ندارد ───
  //
  // ⚠️ این از ممیزی آمد، نه از اشکالی که رخ داده باشد.
  //
  //    امروز هر ۹۳ کنترلر پوشیده‌اند.  ریسک **فردا**ست: کنترلرِ تازه‌ای
  //    که کسی `@UseGuards` یادش برود.  چون هیچ نگهبانِ سراسری‌ای نیست،
  //    آن مسیر **باز** بالا می‌آید و هیچ‌چیز اعتراض نمی‌کند.
  //
  //    فهرست سفید صریح است: هر مسیرِ عمومی باید آنجا نوشته شود، با
  //    دلیلش.  افزودنِ نام به آن فهرست کارِ آگاهانه‌ای است که در
  //    بازبینیِ کد دیده می‌شود — برخلاف فراموش کردنِ نگهبان.
  if (!/@UseGuards\(/.test(text)) {
    if (!PUBLIC_OK.has(rel.split(sep).join('/'))) unguarded.push(rel);
    continue;
  }

  const usesRoles = /@Roles\(/.test(text);
  const usesPermission = /@Permission\(/.test(text);
  if (!usesRoles && !usesPermission) continue;

  checked += 1;

  // ⚠️ دنبالِ `RolesGuard` **درون `@UseGuards`** می‌گردیم، نه هر جای فایل.
  //
  //    نسخهٔ اول `/RolesGuard/.test(text)` بود و در سنجشِ عمدی
  //    **نگرفت**: نگهبان را از `@UseGuards` برداشتم ولی نامش در
  //    توضیحِ بالای همان کنترلر مانده بود، و ابزار آن را «وصل» شمرد.
  //
  //    نگهبانی که با یک توضیح گول بخورد، نگهبان نیست.
  const wired = [...text.matchAll(/@UseGuards\(([^)]*)\)/g)].some((m) =>
    /\bRolesGuard\b/.test(m[1]),
  );

  if (!wired) {
    const which = [
      usesRoles ? `@Roles ×${(text.match(/@Roles\(/g) || []).length}` : null,
      usesPermission ? `@Permission ×${(text.match(/@Permission\(/g) || []).length}` : null,
    ].filter(Boolean).join(' + ');
    bad.push({ rel, which });
  }
}

console.log(`  کنترلرِ دارای دکوراتورِ مجوز: ${checked}`);
console.log();

if (unguarded.length > 0) {
  console.log(`  FAIL ${unguarded.length} کنترلرِ بدون هیچ نگهبانی:`);
  for (const u of unguarded) console.log(`       ${u}`);
  console.log();
  console.log('  اگر عمدی است، نامش را با دلیل به PUBLIC_OK اضافه کنید.');
  console.log();
  console.log('   PASS: 0   FAIL: 1');
  process.exit(1);
}


if (bad.length === 0) {
  console.log('  OK   هر دکوراتورِ مجوز، نگهبانی دارد که بخواندش');
  console.log();
  console.log('   PASS: 1   FAIL: 0');
  process.exit(0);
}

console.log(`  FAIL ${bad.length} کنترلر با دکوراتورِ بی‌نگهبان:`);
for (const b of bad) {
  console.log(`       ${b.rel}`);
  console.log(`         ${b.which}  ولی RolesGuard ندارد`);
}
console.log();
console.log('  رفع:  @UseGuards(JwtAuthGuard, RolesGuard)');
console.log();
console.log('   PASS: 0   FAIL: 1');
process.exit(1);

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
import { join } from 'node:path';

const SRC = 'D:\\aziz\\molido-ai\\Molido-AI-main\\backend\\src';

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

for (const file of walk(SRC)) {
  const text = readFileSync(file, 'utf8');
  const rel = file.slice(SRC.length + 1);

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

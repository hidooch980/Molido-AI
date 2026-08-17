/**
 * هر مسیرِ احراز هویت سقفِ نرخِ سختِ خودش را داشته باشد.
 *
 * پیدا شده در بازرسی: ورودِ **پنل** سقفِ ۱۰ در دقیقه داشت، ولی ورودِ
 * **مشتریِ فروشگاه** نداشت — فقط سقفِ سراسریِ ۱۲۰۰ در دقیقه.
 *
 * یعنی حسابِ کارمند محافظت می‌شد و حسابِ مشتری نه، در حالی که نشانی و
 * سابقهٔ خرید و شمارهٔ تلفنِ مشتری هم آنجاست.
 *
 * نویسندهٔ ورودِ پنل استدلالش را نوشته بود:
 *
 *     «سقف عمومی برای کار روزمرهٔ صندوق بالا برده شده، ولی همان سقف
 *      روی ورود یعنی هزار حدس رمز در دقیقه»
 *
 * استدلال درست بود؛ فقط نیمی از درها را گرفته بود.
 *
 * ⚠️ چرا ثبت‌نام هم؟
 *
 *    ثبت‌نامِ بی‌سقف می‌گوید کدام شمارهٔ تلفن از قبل حساب دارد — و آن،
 *    خودش افشای اطلاعات است، حتی اگر هیچ رمزی لو نرود.
 *
 * اجرا:  node web/scripts/verify-auth-throttle.mjs
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, '..', '..', 'backend', 'src');

/** مسیری که رمز یا کد یک‌بارمصرف می‌گیرد. */
const AUTH_ROUTE = /^(login|register|forgot|reset|verify|otp|change-password|refresh)$/;

/** سقف قابل قبول: در دقیقه چند تلاش. بالاتر از این، حدسِ رمز عملی است. */
const MAX_PER_MINUTE = 30;

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (full.endsWith('.controller.ts')) out.push(full);
  }
  return out;
}

let pass = 0;
const fails = [];

for (const file of walk(SRC)) {
  const text = readFileSync(file, 'utf8');
  const lines = text.split('\n');

  lines.forEach((line, i) => {
    const m = line.match(/@Post\(\s*'([^']+)'\s*\)/);
    if (!m) return;

    // آخرین بخشِ مسیر — `shop/login` و `login` هر دو باید بگیرند
    const last = m[1].split('/').pop();
    if (!AUTH_ROUTE.test(last)) return;

    // ۴ خط بعد را بگرد: دکوراتورها پیش از امضای تابع می‌آیند
    const window = lines.slice(i, i + 5).join('\n');
    const th = window.match(/@Throttle\(\{[^}]*limit:\s*(\d+)/);

    const where = `${relative(SRC, file)}:${i + 1}  @Post('${m[1]}')`;
    if (!th) {
      fails.push(`${where}  =>  هیچ @Throttle ای ندارد`);
      return;
    }
    const limit = Number(th[1]);
    if (limit > MAX_PER_MINUTE) {
      fails.push(`${where}  =>  سقف ${limit} در دقیقه، بیش از ${MAX_PER_MINUTE}`);
      return;
    }
    pass += 1;
  });
}

console.log(`  مسیرِ احراز هویت: ${pass + fails.length}`);

if (fails.length === 0) {
  console.log('  OK   همه سقفِ سخت دارند');
  console.log(`\n   PASS: ${pass}   FAIL: 0`);
  process.exit(0);
}

console.log('  FAIL مسیرهای بی‌سقف:');
for (const f of fails) console.log(`       ${f}`);
console.log(`\n   PASS: ${pass}   FAIL: ${fails.length}`);
process.exit(1);

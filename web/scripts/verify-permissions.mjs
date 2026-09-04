/**
 * فهرست اختیارات با کد هم‌گام است؟
 *
 * دو خرابیِ متقارن که هیچ‌کدام خطا نمی‌دهند:
 *
 *   **کلیدی که مسیر ندارد** — مدیر تنظیمش را عوض می‌کند، هیچ اتفاقی
 *   نمی‌افتد، و هیچ خطایی هم نمی‌بیند.  فکر می‌کند سامانه خراب است.
 *
 *   **مسیری که در فهرست نیست** — قابلِ ویرایش نیست و کسی نمی‌فهمد چرا.
 *
 * من در توضیحِ `permission-catalog.ts` نوشتم «هر ردیف باید
 * `@Permission` متناظرش را داشته باشد» و بعد خودم چهار ردیفِ بی‌مسیر
 * گذاشتم.  هشدار نوشتن جای بررسی کردن را نمی‌گیرد — این آزمون همان
 * بررسی است.
 *
 * اجرا: node --experimental-strip-types web/scripts/verify-permissions.mjs
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PERMISSION_CATALOG, ROLE_LABELS } from '../../backend/src/roles/permission-catalog.ts';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, '..', '..', 'backend', 'src');

let pass = 0;
let fail = 0;

function chk(label, got, want) {
  const a = JSON.stringify(got);
  const e = JSON.stringify(want);
  if (a === e) {
    pass += 1;
    console.log(`  OK   ${label}`);
  } else {
    fail += 1;
    console.log(`  FAIL ${label}\n       got=${a}\n       want=${e}`);
  }
}

/** همهٔ فایل‌های ts زیر یک شاخه. */
function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (name.endsWith('.ts')) out.push(full);
  }
  return out;
}

const wired = new Set();
for (const file of walk(SRC)) {
  const text = readFileSync(file, 'utf8');
  for (const m of text.matchAll(/@Permission\('([^']+)'\)/g)) wired.add(m[1]);
}

const keys = new Set(PERMISSION_CATALOG.flatMap((g) => g.items.map((i) => i.key)));

console.log(`  فهرست: ${keys.size}  ·  وصل‌شده: ${wired.size}`);

console.log('--- هر کلیدِ فهرست باید مسیر داشته باشد ---');
chk('کلیدِ بی‌مسیر نیست', [...keys].filter((k) => !wired.has(k)), []);

console.log('--- هر مسیرِ نشان‌دار باید در فهرست باشد ---');
chk('مسیرِ خارج از فهرست نیست', [...wired].filter((k) => !keys.has(k)), []);

console.log('--- شکل کلیدها ---');
// «حوزه:کار» — «فروش» به‌تنهایی معنی ندارد: دیدنِ فهرست با لغو کردن
// یکی نیست.
chk(
  'همه به شکل حوزه:کار',
  [...keys].filter((k) => !/^[a-z]+:[a-z-]+$/.test(k)),
  [],
);

console.log('--- پیش‌فرض‌ها معتبرند ---');
const roleCodes = new Set(ROLE_LABELS.map((r) => r.code));
const badDefaults = PERMISSION_CATALOG.flatMap((g) =>
  g.items.flatMap((i) => i.defaultRoles.filter((r) => !roleCodes.has(r))),
);
chk('نقشِ ناشناس در پیش‌فرض نیست', badDefaults, []);

// مدیر ارشد باید در پیش‌فرضِ همه باشد، وگرنه با جدولِ خالی از کاری
// بیرون می‌ماند — و او کسی است که باید بتواند همه‌چیز را درست کند.
const missingSuper = PERMISSION_CATALOG.flatMap((g) =>
  g.items.filter((i) => !i.defaultRoles.includes('SUPER_ADMIN')).map((i) => i.key),
);
chk('مدیر ارشد در پیش‌فرضِ همه هست', missingSuper, []);

console.log('--- برچسب‌ها ---');
const unlabelled = PERMISSION_CATALOG.flatMap((g) =>
  g.items.filter((i) => !i.label || i.label.trim().length < 3).map((i) => i.key),
);
chk('همه برچسب فارسی دارند', unlabelled, []);

console.log();
console.log(`   PASS: ${pass}   FAIL: ${fail}`);
process.exit(fail === 0 ? 0 : 1);

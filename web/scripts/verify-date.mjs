/**
 * خواندنِ تاریخِ کاربر — بی‌نیاز به سرور.
 *
 * پیدا شده در بازرسی: هر تاریخِ نامعتبر **۵۰۰** می‌داد نه ۴۰۰.
 *
 *     /accounting/summary?from=garbage      =>  ۵۰۰
 *     /accounting/summary?from=۱۴۰۴         =>  ۵۰۰
 *     /accounting/summary?from=9999-99-99   =>  ۵۰۰
 *
 * علتش این بود که `new Date(x)` روی ورودیِ خراب خطا نمی‌دهد؛
 * `Invalid Date` می‌دهد.  خطا وقتی درمی‌آید که درایور پایگاه داده
 * `toISOString()` را رویش صدا بزند — یعنی چند لایه دورتر، و به شکلِ
 * «خطای سرور».
 *
 * ⚠️ ردیفِ رقم فارسی از همه مهم‌تر است.
 *
 *    کاربر ایرانی «۱۴۰۴/۰۱/۰۱» تایپ می‌کند.  «خطای سرور» به او
 *    می‌گوید سامانه خراب است، نه اینکه ورودی‌اش را عوض کند — و او
 *    درست می‌فهمد: سامانه‌ای که رقم فارسی را نمی‌خواند، خراب است.
 *
 * اجرا: node --experimental-strip-types web/scripts/verify-date.mjs
 */

import {
  normalizeDigits,
  parseDate,
  parseDateOptional,
} from '../../backend/src/common/date.ts';

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

/** آیا پرتاب می‌کند؟ و پیامش چه می‌گوید؟ */
function thrown(fn) {
  try {
    fn();
    return null;
  } catch (e) {
    return e?.message ?? String(e);
  }
}

console.log('--- ۱) رقم فارسی و عربی ---');
chk('رقم فارسی', normalizeDigits('۱۴۰۴-۰۱-۰۱'), '1404-01-01');
chk('رقم عربی', normalizeDigits('٢٠٢٦-٠١-٠١'), '2026-01-01');
chk('لاتین دست‌نخورده', normalizeDigits('2026-01-01'), '2026-01-01');
chk('مخلوط', normalizeDigits('۲۰۲۶-01-۰۱'), '2026-01-01');

console.log('--- ۲) تاریخ درست ---');
chk(
  'ISO خوانده می‌شود',
  parseDate('2026-01-15').toISOString().slice(0, 10),
  '2026-01-15',
);
// همان تاریخ با رقم فارسی — همین ردیف بود که ۵۰۰ می‌داد
chk(
  'رقم فارسی خوانده می‌شود',
  parseDate('۲۰۲۶-۰۱-۱۵').toISOString().slice(0, 10),
  '2026-01-15',
);
chk('فاصلهٔ اضافه مهم نیست', parseDate('  2026-01-15  ').getUTCDate(), 15);

console.log('--- ۳) تاریخ خراب => خطای روشن، نه ۵۰۰ ---');
chk('متن بی‌معنی پرتاب می‌کند', thrown(() => parseDate('garbage')) !== null, true);
chk('ماه ۹۹ پرتاب می‌کند', thrown(() => parseDate('9999-99-99')) !== null, true);
chk('گیومه پرتاب می‌کند', thrown(() => parseDate("'")) !== null, true);
chk('null متنی پرتاب می‌کند', thrown(() => parseDate('null')) !== null, true);
chk('خالی پرتاب می‌کند', thrown(() => parseDate('')) !== null, true);

console.log('--- ۴) پیام باید بگوید کدام میدان ---');
// با سه کادر تاریخ در یک فرم، «تاریخ نامعتبر» به‌تنهایی کمکی نمی‌کند.
const msg = thrown(() => parseDate('garbage', 'از تاریخ'));
chk('نام میدان در پیام است', msg.includes('از تاریخ'), true);
chk('خودِ مقدار در پیام است', msg.includes('garbage'), true);

// ورودیِ بلندِ مهاجم نباید کامل در پاسخ و لاگ تکرار شود
const long = thrown(() => parseDate('x'.repeat(500), 'تاریخ'));
chk('مقدارِ بلند بریده می‌شود', long.length < 120, true);

console.log('--- ۵) اختیاری: نبودن با خرابی یکی نیست ---');
// `?from=&to=` یعنی «بی‌محدودیت»، نه «تاریخِ خراب»
chk('undefined => undefined', parseDateOptional(undefined), undefined);
chk('null => undefined', parseDateOptional(null), undefined);
chk('رشتهٔ خالی => undefined', parseDateOptional(''), undefined);
chk('فقط فاصله => undefined', parseDateOptional('   '), undefined);
chk(
  'مقدارِ درست خوانده می‌شود',
  parseDateOptional('2026-03-01')?.toISOString().slice(0, 10),
  '2026-03-01',
);
chk('مقدارِ خراب پرتاب می‌کند', thrown(() => parseDateOptional('nope')) !== null, true);

console.log();
console.log(`   PASS: ${pass}   FAIL: ${fail}`);
process.exit(fail === 0 ? 0 : 1);

/**
 * بررسی عادی‌سازی شمارهٔ تلفن ایرانی.
 *
 * شماره‌ای که غلط عادی شود، یعنی تماس به جای دیگری می‌رود یا اصلاً
 * برقرار نمی‌شود — و مرکز تلفن خطای مبهم می‌دهد که ربطش به شماره
 * معلوم نیست.
 *
 * اجرا: node --experimental-strip-types web/scripts/verify-phone.mjs
 */

import { normalizePhone } from '../../backend/src/telephony/phone.ts';

let pass = 0;
let fail = 0;

function chk(label, got, want) {
  if (got === want) {
    pass += 1;
    console.log(`  OK   ${label}`);
  } else {
    fail += 1;
    console.log(`  FAIL ${label} (got=${got} want=${want})`);
  }
}

console.log('--- شکل‌های رایج ---');
chk('ثابت تهران', normalizePhone('021-3333 4444'), '02133334444');
chk('همراه', normalizePhone('0912 123 4567'), '09121234567');
chk('پرانتز', normalizePhone('(021) 88776655'), '02188776655');

console.log('--- پیش‌شمارهٔ بین‌المللی ---');
// مرکزهای داخلی با صفرِ ملی کار می‌کنند، نه با +98.
chk('+98 به صفر', normalizePhone('+989121234567'), '09121234567');
chk('0098 به صفر', normalizePhone('00989121234567'), '09121234567');
chk('98 بدون صفر', normalizePhone('989121234567'), '09121234567');

console.log('--- رقم فارسی ---');
chk('رقم فارسی', normalizePhone('۰۹۱۲۱۲۳۴۵۶۷'), '09121234567');

console.log('--- ورودی نامعتبر ---');
// `null` بهتر از رشتهٔ خالی است: رشتهٔ خالی به مرکز می‌رود و خطای
// مبهم می‌گیرد که ربطش به شماره معلوم نیست.
chk('خالی', normalizePhone(''), null);
chk('فقط حروف', normalizePhone('بدون شماره'), null);
chk('خیلی کوتاه', normalizePhone('12'), null);
chk('undefined', normalizePhone(undefined), null);

console.log();
console.log(`   PASS: ${pass}   FAIL: ${fail}`);
process.exit(fail === 0 ? 0 : 1);

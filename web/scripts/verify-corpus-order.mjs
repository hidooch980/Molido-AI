/**
 * ترتیب عبارت‌ها در صفحهٔ ضبط پیکره.
 *
 * چرا این آزمون هست: عبارتی که متن بلوچی ندارد ضبط‌شدنی نیست — دکمه‌اش
 * درست غیرفعال است — ولی در ترتیب پیش‌فرضِ سرور **اولِ فهرست** می‌نشست.
 * گوینده‌ای که پانزده دقیقه وقت گذاشته، اول از روی هفت ردیفِ مرده رد
 * می‌شد و تازه بعد به کار می‌رسید.
 *
 * دو قاعده سنجیده می‌شود:
 *
 *   ۱. عبارت‌های دارای متن، پیش از عبارت‌های بی‌متن.
 *   ۲. میان عبارت‌های آماده، آنکه ضبط کمتری دارد جلوتر — تا جلسه
 *      شکاف‌ها را ببندد نه اینکه پرترین را پرتر کند.
 *
 * اجرا: node --experimental-strip-types web/scripts/verify-corpus-order.mjs
 */

let pass = 0;
let fail = 0;

function chk(label, got, want) {
  if (String(got) === String(want)) {
    pass += 1;
    console.log(`  OK   ${label}`);
  } else {
    fail += 1;
    console.log(`  FAIL ${label} (got=${got} want=${want})`);
  }
}

/**
 * همان ترتیبی که `web/app/voice/page.tsx` به کار می‌برد.
 *
 * عمداً اینجا تکرار شده: صفحه یک کامپوننت React است و برای آزمونِ
 * منطق نباید کل درخت را رِندر کرد.  اگر این دو از هم دور بیفتند،
 * آزمونِ سبز معنایی ندارد — پس هر تغییری در صفحه باید اینجا هم بیاید.
 */
const num = (value) => Number(value ?? 0);

function order(rows) {
  return [...rows].sort((a, b) => {
    const aReady = a.textTarget ? 0 : 1;
    const bReady = b.textTarget ? 0 : 1;
    if (aReady !== bReady) return aReady - bReady;
    return num(a.approved) - num(b.approved);
  });
}

// وضعیت واقعی پیکره در زمان نوشتن: هفت عبارت بدون متن بلوچی، که در
// پاسخ سرور اول می‌آمدند.
const SAMPLE = [
  { textFa: 'اضافه کن', textTarget: null, approved: '0' },
  { textFa: 'حذف کن', textTarget: null, approved: '0' },
  { textFa: 'پاک کن', textTarget: 'ساپ کنوک', approved: '0' },
  { textFa: 'جمع', textTarget: 'باز', approved: '3' },
  { textFa: 'نقدی', textTarget: null, approved: '0' },
  { textFa: 'پرداخت', textTarget: 'ماجب', approved: '1' },
  { textFa: 'پانصد', textTarget: null, approved: '0' },
];

const sorted = order(SAMPLE);
const withText = sorted.filter((p) => p.textTarget);
const without = sorted.filter((p) => !p.textTarget);

console.log('--- ۱) عبارت‌های آمادهٔ ضبط اول می‌آیند ---');
chk('هیچ عبارت بی‌متنی پیش از عبارت دارای متن نیست', sorted.findIndex((p) => !p.textTarget) >= withText.length, true);
chk('شمار آماده', withText.length, 3);
chk('شمار بی‌متن', without.length, 4);
chk('اولین عبارت متن دارد', Boolean(sorted[0].textTarget), true);
chk('آخرین عبارت متن ندارد', Boolean(sorted[sorted.length - 1].textTarget), false);

console.log('--- ۲) میان آماده‌ها، کم‌ضبط‌تر جلوتر ---');
chk('ترتیب ضبط‌ها صعودی است', withText.map((p) => num(p.approved)).join(','), '0,1,3');
chk('اولین آماده «پاک کن» است', sorted[0].textFa, 'پاک کن');

console.log('--- ۳) ترتیب پایدار است ---');
// `approved` از پستگرس رشته می‌آید؛ مقایسهٔ رشته‌ای «10» را پیش از «3»
// می‌گذارد و ترتیب را وارونه می‌کند.
const NUMERIC = [
  { textFa: 'الف', textTarget: 'x', approved: '10' },
  { textFa: 'ب', textTarget: 'x', approved: '3' },
  { textFa: 'ج', textTarget: 'x', approved: '9' },
];
chk('رشتهٔ عددی مثل عدد مرتب می‌شود', order(NUMERIC).map((p) => p.textFa).join(''), 'بجالف');

console.log();
console.log(`   PASS: ${pass}   FAIL: ${fail}`);
process.exit(fail === 0 ? 0 : 1);

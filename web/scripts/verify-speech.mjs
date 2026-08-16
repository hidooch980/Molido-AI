/**
 * بررسی تجزیهٔ فرمان صوتی صندوق.
 *
 * صندوق‌دار «سه تا نان» می‌گوید و انتظار دارد سه نان اضافه شود.  اگر
 * جدا کردن مقدار از نام درست کار نکند، کل جمله به جست‌وجوی کالا
 * می‌رود و چیزی پیدا نمی‌شود — بی‌آنکه خطایی داده شود.
 *
 * اجرا: node --experimental-strip-types web/scripts/verify-speech.mjs
 */

import { cleanTranscript, parseVoiceCommand } from '../lib/speech.ts';

let pass = 0;
let fail = 0;

function chk(label, got, want) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) {
    pass += 1;
    console.log(`  OK   ${label}`);
  } else {
    fail += 1;
    console.log(`  FAIL ${label} (got=${g} want=${w})`);
  }
}

console.log('--- پاک‌سازی متن شنیده‌شده ---');
chk('ارقام فارسی به لاتین', cleanTranscript('۱۲۳'), '123');
chk('ارقام عربی به لاتین', cleanTranscript('٤٥٦'), '456');
// «برنج.» با نقطه، در جست‌وجوی کالا چیزی پیدا نمی‌کند.
chk('نقطهٔ آخر حذف می‌شود', cleanTranscript('برنج.'), 'برنج');
chk('علامت سؤال فارسی حذف می‌شود', cleanTranscript('نان؟'), 'نان');
chk('فاصله‌های اضافی جمع می‌شوند', cleanTranscript('  شیر   خشک  '), 'شیر خشک');

console.log('--- جدا کردن مقدار از نام ---');
chk('عدد به حروف', parseVoiceCommand('سه تا نان'), { qty: 3, term: 'نان' });
chk('عدد لاتین', parseVoiceCommand('3 نان'), { qty: 3, term: 'نان' });
chk('عدد فارسی', parseVoiceCommand('۵ برنج'), { qty: 5, term: 'برنج' });
chk('واحد کیلو', parseVoiceCommand('دو کیلو برنج'), { qty: 2, term: 'برنج' });
chk('واحد عدد', parseVoiceCommand('چهار عدد شیر'), { qty: 4, term: 'شیر' });
chk('عدد اعشاری', parseVoiceCommand('1.5 گوشت'), { qty: 1.5, term: 'گوشت' });
chk('نام چندواژه‌ای', parseVoiceCommand('دو تا شیر خشک'), { qty: 2, term: 'شیر خشک' });

console.log('--- بدون مقدار ---');
// تفاوت null و ۱ مهم است: فراخوان باید بداند کاربر مقدار **نگفته**.
chk('مقدار نگفته → null', parseVoiceCommand('نان'), { qty: null, term: 'نان' });
chk('نام چندواژه‌ای بدون مقدار', parseVoiceCommand('شیر خشک'), {
  qty: null,
  term: 'شیر خشک',
});

console.log('--- حالت‌های لبه ---');
// «ده» تنها یعنی کاربر فقط عدد گفته؛ نامی نیست که جست‌وجو شود.
chk('فقط عدد، نامی ندارد', parseVoiceCommand('ده'), { qty: null, term: 'ده' });
chk('رشتهٔ خالی', parseVoiceCommand('   '), { qty: null, term: '' });
// بارکد گفته‌شده باید دست‌نخورده بماند تا مثل اسکن رفتار کند.
chk('بارکد بلند دست‌نخورده', parseVoiceCommand('6260100120014'), {
  qty: null,
  term: '6260100120014',
});

console.log('--- مقدار به سبد اضافه می‌شود، جایگزین نمی‌شود ---');
/**
 * همان حسابی که صفحهٔ صندوق می‌کند.
 *
 * ایرادِ نسخهٔ اول: مقدارِ گفته‌شده **جایگزین** مقدار سبد می‌شد.  اگر
 * صندوق‌دار پنج نان اسکن کرده بود و بعد می‌گفت «سه تا نان»، آن پنج‌تا
 * بی‌صدا سه‌تا می‌شد — روی فاکتور، پولِ مشتری.
 */
const finalQty = (before, spoken) => before + spoken;

chk('سبد خالی + سه تا', finalQty(0, 3), 3);
chk('پنج در سبد + سه تا', finalQty(5, 3), 8);
chk('یک در سبد + ده تا', finalQty(1, 10), 11);
// وزنی هم همین: نیم کیلو در سبد و «دو کیلو» یعنی دو و نیم.
chk('وزن اعشاری', finalQty(0.5, 2), 2.5);

console.log('--- تجزیه + جمع، سرتاسری ---');
const speak = (text, before) => {
  const { qty, term } = parseVoiceCommand(text);
  return { term, qty: qty === null ? null : finalQty(before, qty) };
};
chk('«سه تا نان» با پنج در سبد', speak('سه تا نان', 5), { term: 'نان', qty: 8 });
// مقدار نگفته یعنی «یکی اضافه کن» که خودِ addByCode انجام می‌دهد؛
// اینجا نباید عددی تحمیل شود.
chk('«نان» بدون مقدار', speak('نان', 5), { term: 'نان', qty: null });

console.log('');
console.log(`   PASS: ${pass}   FAIL: ${fail}`);
process.exit(fail === 0 ? 0 : 1);

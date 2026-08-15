/**
 * بررسی سلامت ترجمه‌ها — به‌ویژه بلوچی.
 *
 * بلوچی برخلاف انگلیسی و عربی، ناقص است و **قرار هم هست ناقص بماند**:
 * کلید ترجمه‌نشده به فارسی می‌افتد.  این آزمون همان سازوکار را نگه
 * می‌دارد، نه کامل بودن را.
 *
 * اجرا: node --experimental-strip-types web/scripts/verify-i18n.mjs
 */

import { LANGS, coverage, t } from '../lib/i18n.ts';

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

console.log('--- بلوچی: ترجمه‌های موجود ---');
chk('ذخیره', t('save', 'bal'), 'ساتیتێن');
chk('جست‌وجو', t('search', 'bal'), 'گشتین');
chk('چاپ', t('print', 'bal'), 'چاپ');

console.log('--- بلوچی: جایگزینی با فارسی ---');
// کلیدی که بلوچی ندارد باید فارسی بدهد، نه انگلیسی و نه خودِ کلید.
// اگر روزی به انگلیسی بیفتد، صندوق‌دارِ بلوچ متنی می‌بیند که هیچ‌کدام
// از دو زبانش نیست.
chk('کلید بی‌ترجمه → فارسی', t('menuVoice', 'bal'), t('menuVoice', 'fa'));
chk('جایگزین انگلیسی نیست', t('menuVoice', 'bal') === t('menuVoice', 'en'), false);

console.log('--- کلید ناشناس ---');
chk('کلید ناشناس، خودش برمی‌گردد', t('noSuchKey', 'bal'), 'noSuchKey');

console.log('--- پوشش ---');
const fa = coverage('fa');
const bal = coverage('bal');
console.log(`  فارسی ${fa}٪ · بلوچی ${bal}٪`);
chk('فارسی کامل است', fa, 100);
chk('بلوچی چیزی دارد', bal > 0, true);
// اگر بلوچی روزی صد شد یعنی کسی همهٔ کلیدها را پر کرده؛ آن‌وقت این
// آزمون باید عوض شود، نه اینکه بی‌صدا رد شود.
chk('بلوچی هنوز ناقص است', bal < 100, true);

console.log('--- بدون نشانه‌گذاری چسبیده ---');
// «ذخیره:» روی دکمه غلط است.  دادهٔ ترجمهٔ ویکی این را زیاد دارد.
const { DICT_KEYS_WITH_TRAILING_PUNCT } = (() => {
  const bad = [];
  for (const key of ['save', 'cancel', 'search', 'print', 'name', 'date']) {
    const value = t(key, 'bal');
    if (/[:،؛.]$/.test(value)) bad.push(key);
  }
  return { DICT_KEYS_WITH_TRAILING_PUNCT: bad };
})();
chk('دکمه‌ها نشانه‌گذاری چسبیده ندارند', DICT_KEYS_WITH_TRAILING_PUNCT.length, 0);

console.log('--- هر زبانِ فهرست، انتخاب‌شدنی است ---');
// دکمه‌ای که در فهرست هست ولی موقع خواندن به فارسی برمی‌گردد، دکمه‌ای
// است که کار نمی‌کند و خطایی هم نمی‌دهد.  دقیقاً همین برای بلوچی
// رخ داده بود.
globalThis.window = { localStorage: new Map() };
window.localStorage.getItem = (k) => window.localStorage.get(k) ?? null;
const { getLang, setLangStorage } = await import('../lib/i18n.ts');
window.localStorage.setItem = (k, v) => window.localStorage.set(k, v);
for (const item of LANGS) {
  setLangStorage(item.code);
  chk(`زبان ${item.label} خوانده می‌شود`, getLang(), item.code);
}
window.localStorage.setItem('molido_lang', 'klingon');
chk('زبان ناشناس → فارسی', getLang(), 'fa');

console.log('');
console.log(`   PASS: ${pass}   FAIL: ${fail}`);
process.exit(fail === 0 ? 0 : 1);

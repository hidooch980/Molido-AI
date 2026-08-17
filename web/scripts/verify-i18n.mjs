/**
 * بررسی سلامت ترجمه‌ها.
 *
 * رابط سه زبان دارد و هر سه **کامل**اند.  بلوچی عمداً زبانِ رابط
 * نیست — زبانِ صداست: صندوق‌دار بلوچ فارسی می‌خواند ولی راحت‌تر
 * بلوچی حرف می‌زند.  پیکرهٔ صوتی (`VoicePhrase.lang = 'bal'`) جدولِ
 * دیگری است و این آزمون به آن کاری ندارد.
 *
 * پیش از این، بلوچی زبانِ رابط بود و «ناقص بودنش» سنجیده می‌شد.  حالا
 * سنجه برعکس است: هیچ زبانی نباید ناقص باشد.
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

console.log('--- سه زبانِ رابط ---');
// بلوچی نباید در فهرست باشد: زبانِ صداست نه زبانِ رابط.
chk('سه زبان', LANGS.length, 3);
chk('بلوچی در فهرست نیست', LANGS.some((l) => l.code === 'bal'), false);

console.log('--- کلید ناشناس ---');
chk('کلید ناشناس، خودش برمی‌گردد', t('noSuchKey', 'fa'), 'noSuchKey');

console.log('--- پوشش ---');
// هر سه زبان کامل‌اند.  ناقص بودن یعنی کاربر متنی می‌بیند که زبانش
// نیست — و چون جایگزینی بی‌صداست، کسی هم گزارش نمی‌کند.
for (const { code, label } of LANGS) {
  const c = coverage(code);
  console.log(`  ${label}: ${c}٪`);
  chk(`${label} کامل است`, c, 100);
}

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

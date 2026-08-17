/**
 * رشته‌ای در واژه‌نامه که گیومه‌اش خودش را بشکند.
 *
 * ⚠️ این دام امروز **دو بار** گرفت — و هر دو بار کلِ فایل را شکست.
 *
 *     en: 'Maryam's suggestion'                   <- آپاستروف
 *     en: "…asks "why didn't I get it", …"        <- هر دو نوع
 *
 *    دومی بدتر بود: رشته هم `'` داشت هم `"`، پس هیچ گیومهٔ سادهٔ
 *    بیرونی جوابگو نبود.
 *
 * ⚠️ چرا نگهبان لازم است وقتی `tsc` می‌گیرد؟
 *
 *    چون `tsc` **جای** خرابی را نشان می‌دهد نه **علت** را: پیامش
 *    `',' expected` است، در یک فایلِ ۱۲۰۰ خطیِ واژه‌نامه، و کسی که
 *    آن را می‌بیند اول دنبال کاما می‌گردد.
 *
 *    این نگهبان می‌گوید کدام کلید و چرا.
 *
 * راهِ درست: گیومهٔ فارسی « » داخل متن، نه `'` یا `"`.
 *
 * اجرا:  node web/scripts/verify-i18n-quotes.mjs
 */

import { readFileSync } from 'node:fs';

const PATH = 'D:\\aziz\\molido-ai\\Molido-AI-main\\web\\lib\\i18n.ts';
const text = readFileSync(PATH, 'utf8');

const bad = [];

text.split('\n').forEach((line, i) => {
  const s = line.trim();
  // فقط خط‌های مقدارِ زبان
  const m = s.match(/^(fa|en|ar):\s*(['"])(.*)$/);
  if (!m) return;

  const [, lang, quote, rest] = m;
  // بدنه تا آخرین گیومهٔ هم‌نوع
  const close = rest.lastIndexOf(quote);
  if (close === -1) {
    bad.push({ line: i + 1, lang, why: 'گیومهٔ پایانی ندارد', text: s.slice(0, 60) });
    return;
  }
  const body = rest.slice(0, close);
  if (body.includes(quote)) {
    bad.push({
      line: i + 1,
      lang,
      why: `گیومهٔ ${quote} داخل متن است`,
      text: s.slice(0, 60),
    });
  }
});

console.log(`  خط‌های مقدار سنجیده شد`);
console.log();

if (bad.length === 0) {
  console.log('  OK   هیچ رشته‌ای گیومه‌اش را نمی‌شکند');
  console.log();
  console.log('   PASS: 1   FAIL: 0');
  process.exit(0);
}

console.log(`  FAIL ${bad.length} رشتهٔ شکسته:`);
for (const b of bad) {
  console.log(`       i18n.ts:${b.line}  (${b.lang})  ${b.why}`);
  console.log(`         ${b.text}`);
}
console.log();
console.log('  راهِ درست: گیومهٔ « » داخل متن، نه \' یا "');
console.log();
console.log('   PASS: 0   FAIL: 1');
process.exit(1);

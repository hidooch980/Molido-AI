/**
 * بررسی استخراج قیمت از گفتار فارسی.
 *
 * این آزمون روی خطاهایی تمرکز دارد که **پول** خرج می‌کنند، نه روی
 * حالت‌های خوش‌بینانه:
 *
 *   تومان و ریال ده برابر فرق دارند.  اگر بنکدار ریال بگوید و ما
 *   تومان بخوانیم، سفارش ده برابر ثبت می‌شود و هیچ خطایی هم نمی‌دهد.
 *
 *   عددی که به کالای اشتباه بخورد، برندهٔ استعلام را عوض می‌کند.
 *
 * اجرا: node --experimental-strip-types web/scripts/verify-price-speech.mjs
 */

import {
  normalizeDigits,
  parseWordNumber,
  extractAmounts,
  suggestQuotes,
} from '../lib/price-speech.ts';

let pass = 0;
let fail = 0;

function chk(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    pass += 1;
    console.log(`  OK   ${name}`);
  } else {
    fail += 1;
    console.log(`  FAIL ${name}\n       got=${a}\n       want=${e}`);
  }
}

console.log('--- ۱) رقم فارسی و جداکننده ---');
chk('رقم فارسی', normalizeDigits('۳۲۰۰۰'), '32000');
chk('جداکنندهٔ هزارگان', normalizeDigits('۳۲,۰۰۰'), '32000');
chk('ویرگول فارسی', normalizeDigits('۱٬۲۵۰٬۰۰۰'), '1250000');

console.log('--- ۲) عدد به حروف ---');
chk('سی و دو هزار', parseWordNumber('سی و دو هزار'.split(' ')), 32000);
chk('دو میلیون و پانصد هزار', parseWordNumber('دو میلیون و پانصد هزار'.split(' ')), 2500000);
// «هزار» تنها یعنی ۱۰۰۰، نه صفر — وگرنه «هزار تومان» صفر می‌شد.
chk('هزار تنها', parseWordNumber(['هزار']), 1000);
chk('صد و بیست', parseWordNumber('صد و بیست'.split(' ')), 120);
chk('واژهٔ نامربوط', parseWordNumber(['برنج']), null);

console.log('--- ۳) تومان و ریال ده برابر فرق دارند ---');
{
  const [a] = extractAmounts('کیلویی سی و دو هزار تومان');
  chk('تومان به ریال', a.rial, 320000);
  chk('واحد تومان', a.unit, 'TOMAN');
  chk('بدون هشدار', a.warnings, []);
}
{
  const [a] = extractAmounts('کیلویی سیصد و بیست هزار ریال');
  chk('ریال دست‌نخورده', a.rial, 320000);
  chk('واحد ریال', a.unit, 'RIAL');
}
{
  // خطرناک‌ترین حالت: واحد گفته نشده.  تومان فرض می‌شود چون گفتار
  // بازار تومان است، ولی اپراتور باید ببیند که فرض بوده.
  const [a] = extractAmounts('کیلویی سی و دو هزار');
  chk('بی‌واحد تومان فرض می‌شود', a.rial, 320000);
  chk('ولی هشدار می‌گیرد', a.warnings.length >= 1, true);
}

console.log('--- ۴) عدد مشکوکِ کوچک ---');
{
  // «سه تومن» ممکن است ۳۰۰۰ باشد یا ۳ میلیون.  ابهام واقعی است و
  // حل‌شدنی نیست، پس حدس نمی‌زنیم — هشدار می‌دهیم.
  const [a] = extractAmounts('سه تومن');
  chk('هشدار عدد کوچک', a.warnings.some((w) => w.includes('کوچک')), true);
}

console.log('--- ۵) چند قیمت در یک جمله ---');
{
  const amounts = extractAmounts('برنج سی و دو هزار تومان، روغن هجده هزار تومان');
  chk('دو مبلغ', amounts.length, 2);
  chk('ترتیب حفظ شد', [amounts[0].spoken, amounts[1].spoken], [32000, 18000]);
}

console.log('--- ۶) نگاشت به کالا ---');
const PRODUCTS = [
  { productId: 'p1', productName: 'برنج ایرانی ۱۰ کیلویی' },
  { productId: 'p2', productName: 'روغن آفتابگردان' },
];
{
  const s = suggestQuotes('برنج سی و دو هزار تومان و روغن هجده هزار تومان', PRODUCTS);
  chk('برنج درست خورد', s[0].rial, 320000);
  chk('روغن درست خورد', s[1].rial, 180000);
  chk('نگاشت با نام، بی‌هشدار', s[0].warnings, []);
}
{
  // بنکدار نام نمی‌گوید، فقط عدد پشت عدد.
  const s = suggestQuotes('سی و دو هزار تومان، هجده هزار تومان', PRODUCTS);
  chk('اولی به اولی', s[0].rial, 320000);
  chk('دومی به دومی', s[1].rial, 180000);
  // ترتیب درست است ولی حدسی — و اپراتور باید بداند.
  chk('حدسِ ترتیبی هشدار دارد', s[0].warnings.some((w) => w.includes('ترتیب')), true);
}
{
  // کالایی که قیمتش گفته نشد باید خالی بماند، نه اینکه عددِ کالای
  // دیگری را بگیرد.
  const three = [...PRODUCTS, { productId: 'p3', productName: 'قند ۵ کیلویی' }];
  const s = suggestQuotes('برنج سی و دو هزار تومان', three);
  chk('کالای بی‌قیمت خالی می‌ماند', s[2].rial, null);
}

console.log('--- ۷) متن بی‌عدد ---');
chk('هیچ مبلغی', extractAmounts('سلام خوبی؟ موجود ندارم').length, 0);
chk('متن خالی', extractAmounts('').length, 0);

console.log();
console.log(`   PASS: ${pass}   FAIL: ${fail}`);
process.exit(fail === 0 ? 0 : 1);

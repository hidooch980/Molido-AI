/**
 * رسم بارکد EAN-13 و CODE-128 به‌صورت SVG — بدون هیچ کتابخانه.
 *
 * چرا دستی: کتابخانه‌های بارکد یا canvas می‌خواهند (که در چاپ کیفیت را از
 * دست می‌دهد) یا چند صد کیلوبایت به باندل اضافه می‌کنند.  خودِ الگو چند ده
 * خط است و SVG در چاپ همیشه تیز است، مستقل از DPI چاپگر.
 *
 * نکتهٔ چاپ: میله‌ها باید عرض صحیح داشته باشند وگرنه بارکدخوان نمی‌خواند.
 * واحد پایه (module) در چاپ حرارتی معمولاً ۰٫۳۳ میلی‌متر است.
 */

// ---------------------------------------------------------------- EAN-13

const EAN_L = [
  '0001101', '0011001', '0010011', '0111101', '0100011',
  '0110001', '0101111', '0111011', '0110111', '0001011',
];

const EAN_G = [
  '0100111', '0110011', '0011011', '0100001', '0011101',
  '0111001', '0000101', '0010001', '0001001', '0010111',
];

const EAN_R = [
  '1110010', '1100110', '1101100', '1000010', '1011100',
  '1001110', '1010000', '1000100', '1001000', '1110100',
];

/** رقم اول عدد نیست، بلکه تعیین می‌کند شش رقم بعدی L باشند یا G. */
const EAN_PARITY = [
  'LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG',
  'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL',
];

export function ean13CheckDigit(first12: string): number {
  let sum = 0;

  for (let index = 0; index < 12; index += 1) {
    sum += Number(first12[index]) * (index % 2 === 0 ? 1 : 3);
  }

  return (10 - (sum % 10)) % 10;
}

/** الگوی صفر و یکِ یک بارکد EAN-13 کامل (۹۵ واحد). */
function ean13Pattern(code: string): string {
  const parity = EAN_PARITY[Number(code[0])];
  let bits = '101'; // نگهبان چپ

  for (let index = 1; index <= 6; index += 1) {
    const digit = Number(code[index]);
    bits += parity[index - 1] === 'L' ? EAN_L[digit] : EAN_G[digit];
  }

  bits += '01010'; // نگهبان میانی

  for (let index = 7; index <= 12; index += 1) {
    bits += EAN_R[Number(code[index])];
  }

  return `${bits}101`; // نگهبان راست
}

// --------------------------------------------------------------- CODE-128

const CODE128_PATTERNS = [
  '11011001100', '11001101100', '11001100110', '10010011000', '10010001100',
  '10001001100', '10011001000', '10011000100', '10001100100', '11001001000',
  '11001000100', '11000100100', '10110011100', '10011011100', '10011001110',
  '10111001100', '10011101100', '10011100110', '11001110010', '11001011100',
  '11001001110', '11011100100', '11001110100', '11101101110', '11101001100',
  '11100101100', '11100100110', '11101100100', '11100110100', '11100110010',
  '11011011000', '11011000110', '11000110110', '10100011000', '10001011000',
  '10001000110', '10110001000', '10001101000', '10001100010', '11010001000',
  '11000101000', '11000100010', '10110111000', '10110001110', '10001101110',
  '10111011000', '10111000110', '10001110110', '11101110110', '11010001110',
  '11000101110', '11011101000', '11011100010', '11011101110', '11101011000',
  '11101000110', '11100010110', '11101101000', '11101100010', '11100011010',
  '11101111010', '11001000010', '11110001010', '10100110000', '10100001100',
  '10010110000', '10010000110', '10000101100', '10000100110', '10110010000',
  '10110000100', '10011010000', '10011000010', '10000110100', '10000110010',
  '11000010010', '11001010000', '11110111010', '11000010100', '10001111010',
  '10100111100', '10010111100', '10010011110', '10111100100', '10011110100',
  '10011110010', '11110100100', '11110010100', '11110010010', '11011011110',
  '11011110110', '11110110110', '10101111000', '10100011110', '10001011110',
  '10111101000', '10111100010', '11110101000', '11110100010', '10111011110',
  '10111101110', '11101011110', '11110101110', '11010000100', '11010010000',
  '11010011100', '11000111010',
];

const CODE128_STOP = '1100011101011';

/**
 * CODE-128 با مجموعهٔ B — حروف و ارقام و نشانه‌های چاپی ASCII.
 * برای کد کالای غیرعددی یا شمارهٔ سری استفاده می‌شود؛ EAN-13 فقط عدد
 * می‌پذیرد و دقیقاً ۱۳ رقم.
 */
function code128Pattern(text: string): string {
  const startB = 104;
  let checksum = startB;
  let bits = CODE128_PATTERNS[startB];

  for (let index = 0; index < text.length; index += 1) {
    const value = text.charCodeAt(index) - 32;
    if (value < 0 || value > 94) continue;

    bits += CODE128_PATTERNS[value];
    checksum += value * (index + 1);
  }

  bits += CODE128_PATTERNS[checksum % 103];
  return bits + CODE128_STOP;
}

// ------------------------------------------------------------------- SVG

export type BarcodeOptions = {
  /** عرض هر واحد بر حسب میلی‌متر؛ ۰٫۳۳ استاندارد چاپ حرارتی است. */
  moduleWidth?: number;
  heightMm?: number;
  showText?: boolean;
};

/**
 * بارکد را به SVG تبدیل می‌کند.  اگر ورودی ۱۳ رقم معتبر باشد EAN-13، وگرنه
 * CODE-128 رسم می‌شود — پس یک تابع برای هر دو حالت کافی است.
 */
export function barcodeSvg(value: string, options: BarcodeOptions = {}): string {
  const moduleWidth = options.moduleWidth ?? 0.33;
  const heightMm = options.heightMm ?? 15;
  const showText = options.showText ?? true;

  const clean = String(value ?? '').trim();
  if (!clean) return '';

  let bits: string;
  let label = clean;

  if (/^\d{12,13}$/.test(clean)) {
    const base = clean.slice(0, 12);
    const full = base + ean13CheckDigit(base);
    bits = ean13Pattern(full);
    label = full;
  } else {
    bits = code128Pattern(clean);
  }

  const width = bits.length * moduleWidth;
  const textHeight = showText ? 3.5 : 0;
  const total = heightMm + textHeight;

  const bars: string[] = [];
  let index = 0;

  while (index < bits.length) {
    if (bits[index] === '1') {
      let run = 1;
      while (bits[index + run] === '1') run += 1;

      bars.push(
        `<rect x="${(index * moduleWidth).toFixed(3)}" y="0" ` +
          `width="${(run * moduleWidth).toFixed(3)}" height="${heightMm}" />`,
      );
      index += run;
    } else {
      index += 1;
    }
  }

  const text = showText
    ? `<text x="${(width / 2).toFixed(2)}" y="${(heightMm + 3).toFixed(2)}" ` +
      `font-size="3" text-anchor="middle" font-family="monospace" ` +
      `letter-spacing="0.3">${label}</text>`
    : '';

  // fill سیاه صریح: برچسب باید در هر تمی سیاه روی سفید چاپ شود، نه با
  // رنگ‌های تم تیرهٔ برنامه.
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" ` +
    `width="${width.toFixed(2)}mm" height="${total.toFixed(2)}mm" ` +
    `viewBox="0 0 ${width.toFixed(2)} ${total.toFixed(2)}">` +
    `<rect width="100%" height="100%" fill="#fff"/>` +
    `<g fill="#000">${bars.join('')}${text}</g>` +
    `</svg>`
  );
}

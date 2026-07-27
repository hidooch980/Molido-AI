/**
 * تولید بارکد EAN-13 به صورت SVG — بدون کتابخانه بیرونی.
 *
 * ساختار EAN-13: رقم اول با الگوی چپ (L/G) کدگذاری می‌شود، ۶ رقم بعدی
 * در نیمه چپ و ۶ رقم آخر در نیمه راست قرار می‌گیرند.
 */

const L: Record<string, string> = {
  '0': '0001101', '1': '0011001', '2': '0010011', '3': '0111101', '4': '0100011',
  '5': '0110001', '6': '0101111', '7': '0111011', '8': '0110111', '9': '0001011',
};

const G: Record<string, string> = {
  '0': '0100111', '1': '0110011', '2': '0011011', '3': '0100001', '4': '0011101',
  '5': '0111001', '6': '0000101', '7': '0010001', '8': '0001001', '9': '0010111',
};

const R: Record<string, string> = {
  '0': '1110010', '1': '1100110', '2': '1101100', '3': '1000010', '4': '1011100',
  '5': '1001110', '6': '1010000', '7': '1000100', '8': '1001000', '9': '1110100',
};

/** الگوی L/G نیمه چپ بر اساس رقم اول. */
const PARITY = [
  'LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG',
  'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL',
];

/** رقم کنترل EAN-13 را محاسبه می‌کند. */
export function ean13CheckDigit(twelve: string): number {
  let sum = 0;

  for (let i = 0; i < 12; i += 1) {
    sum += Number(twelve[i]) * (i % 2 === 0 ? 1 : 3);
  }

  return (10 - (sum % 10)) % 10;
}

export function isValidEan13(code: string): boolean {
  if (!/^\d{13}$/.test(code)) return false;

  return ean13CheckDigit(code.slice(0, 12)) === Number(code[12]);
}

/**
 * SVG بارکد را برمی‌گرداند. اگر کد EAN-13 معتبر نباشد، `null`.
 */
export function ean13Svg(
  code: string,
  options: { width?: number; height?: number } = {},
): string | null {
  if (!isValidEan13(code)) return null;

  const moduleWidth = options.width ?? 2;
  const barHeight = options.height ?? 60;

  const first = Number(code[0]);
  const parity = PARITY[first];

  let bits = '101'; // نگهبان ابتدا

  for (let i = 0; i < 6; i += 1) {
    const digit = code[i + 1];

    bits += parity[i] === 'L' ? L[digit] : G[digit];
  }

  bits += '01010'; // نگهبان میانی

  for (let i = 7; i < 13; i += 1) {
    bits += R[code[i]];
  }

  bits += '101'; // نگهبان انتها

  const totalWidth = bits.length * moduleWidth;
  const textY = barHeight + 14;

  let rects = '';

  for (let i = 0; i < bits.length; i += 1) {
    if (bits[i] === '1') {
      rects += `<rect x="${i * moduleWidth}" y="0" width="${moduleWidth}" height="${barHeight}" fill="#000"/>`;
    }
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="${textY + 4}" ` +
    `viewBox="0 0 ${totalWidth} ${textY + 4}">` +
    `<rect width="100%" height="100%" fill="#fff"/>` +
    rects +
    `<text x="${totalWidth / 2}" y="${textY}" text-anchor="middle" ` +
    `font-family="monospace" font-size="13" fill="#000">${code}</text>` +
    `</svg>`
  );
}

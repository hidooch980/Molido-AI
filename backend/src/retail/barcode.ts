/**
 * بارکد ترازو
 *
 * ترازوهای فروشگاهی برای کالای وزنی یک بارکد EAN-13 چاپ می‌کنند که مقدار را
 * داخل خودش دارد:
 *
 *     2 CCCCC VVVVV K
 *     │   │     │   └─ رقم کنترل
 *     │   │     └───── وزن (گرم) یا مبلغ (ریال) — بسته به تنظیم فروشگاه
 *     │   └─────────── کد کالا روی ترازو
 *     └─────────────── پیشوند (پیش‌فرض ۲؛ در محدودهٔ داخلی استاندارد EAN)
 *
 * این ماژول عمداً بدون وابستگی و خالص است تا هم در بک‌اند و هم در تست واحد
 * بدون دیتابیس قابل استفاده باشد.
 */

export type ScaleBarcodeMode = 'WEIGHT' | 'PRICE';

export type ScaleBarcode = {
  /** کد کالا روی ترازو (۵ رقم) */
  scaleCode: string;
  /** مقدار خوانده‌شده: کیلوگرم در حالت WEIGHT، ریال در حالت PRICE */
  value: number;
  mode: ScaleBarcodeMode;
};

/** گرم به کیلوگرم — ترازو وزن را با دقت گرم کد می‌کند. */
const GRAMS_PER_KG = 1000;

const EAN13_LENGTH = 13;
/** ۱۲ رقم داده + ۱ رقم کنترل */
const BODY_LENGTH = 12;
const SCALE_CODE_LENGTH = 5;

/**
 * عرض فیلد مقدار از باقی‌ماندهٔ بدنه مشتق می‌شود، تا پیشوند یک‌رقمی («۲») و
 * دورقمی («۲۰» تا «۲۹»، رایج در اروپا) هر دو بدون تنظیم جداگانه کار کنند.
 */
function valueWidth(prefix: string): number {
  return BODY_LENGTH - prefix.length - SCALE_CODE_LENGTH;
}

/**
 * رقم کنترل EAN-13 را برای ۱۲ رقم اول محاسبه می‌کند.
 * وزن‌دهی از راست: ۱، ۳، ۱، ۳، ...
 */
export function ean13CheckDigit(first12: string): number {
  let sum = 0;
  for (let index = 0; index < 12; index += 1) {
    const digit = first12.charCodeAt(index) - 48;
    sum += index % 2 === 0 ? digit : digit * 3;
  }
  return (10 - (sum % 10)) % 10;
}

export function isValidEan13(barcode: string): boolean {
  if (!/^\d{13}$/.test(barcode)) return false;
  return ean13CheckDigit(barcode.slice(0, 12)) === barcode.charCodeAt(12) - 48;
}

/**
 * اگر بارکد یک برچسب ترازو باشد آن را تجزیه می‌کند، وگرنه null برمی‌گرداند.
 *
 * رقم کنترل عمداً بررسی می‌شود: یک اسکن خراب نباید به‌عنوان وزن معتبر تفسیر
 * شود، چون مستقیماً روی مبلغ فاکتور اثر می‌گذارد.
 */
export function parseScaleBarcode(
  barcode: string,
  prefix = '2',
  mode: ScaleBarcodeMode = 'WEIGHT',
): ScaleBarcode | null {
  const code = barcode.trim();

  if (code.length !== EAN13_LENGTH) return null;
  if (!prefix || !code.startsWith(prefix)) return null;
  if (valueWidth(prefix) < 1) return null;
  if (!isValidEan13(code)) return null;

  const scaleCode = code.slice(prefix.length, prefix.length + SCALE_CODE_LENGTH);
  const raw = Number(code.slice(prefix.length + SCALE_CODE_LENGTH, BODY_LENGTH));
  if (!Number.isFinite(raw) || raw <= 0) return null;

  return {
    scaleCode,
    value: mode === 'WEIGHT' ? raw / GRAMS_PER_KG : raw,
    mode,
  };
}

/**
 * بارکد ترازو می‌سازد — برای تست، و برای چاپ برچسب از داخل سیستم.
 */
export function buildScaleBarcode(
  scaleCode: string,
  value: number,
  prefix = '2',
  mode: ScaleBarcodeMode = 'WEIGHT',
): string {
  if (!/^\d{5}$/.test(scaleCode)) {
    throw new Error('کد ترازو باید دقیقاً ۵ رقم باشد');
  }

  const width = valueWidth(prefix);
  if (!/^\d+$/.test(prefix) || width < 1) {
    throw new Error('پیشوند بارکد ترازو نامعتبر است');
  }

  const raw = mode === 'WEIGHT' ? Math.round(value * GRAMS_PER_KG) : Math.round(value);
  if (raw <= 0 || raw >= 10 ** width) {
    throw new Error('مقدار خارج از محدودهٔ قابل کدگذاری در بارکد است');
  }

  const body = `${prefix}${scaleCode}${String(raw).padStart(width, '0')}`;
  return `${body}${ean13CheckDigit(body)}`;
}

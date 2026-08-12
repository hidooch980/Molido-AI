/**
 * واحدهای پول پشتیبانی‌شده
 *
 * هر شرکت یک واحد پول دارد و همهٔ مبالغش با همان واحد ذخیره می‌شود؛ تبدیل ارز
 * انجام نمی‌شود.  حسابداری چندارزی به نرخ تبدیل در لحظهٔ هر تراکنش و محاسبهٔ
 * سود/زیان تسعیر نیاز دارد که دامنهٔ جداگانه‌ای است.
 *
 * تومان عمداً یک واحد مستقل است، نه «ریال تقسیم بر ده»: فروشگاه ایرانی قیمت را
 * به تومان وارد و به تومان چاپ می‌کند، و ضرب و تقسیم خودکار سرچشمهٔ خطاهای
 * پرهزینه است.
 */

export const CURRENCIES = ['IRR', 'IRT', 'AED', 'USD', 'EUR', 'TRY'] as const;

export type CurrencyCode = (typeof CURRENCIES)[number];

export type CurrencyInfo = {
  code: CurrencyCode;
  /** نام فارسی برای نمایش */
  name: string;
  nameEn: string;
  /** نماد کوتاه در فاکتور و رسید */
  symbol: string;
  /** رقم اعشار پیش‌فرض نمایش */
  decimals: number;
  /** محلی که برای قالب‌بندی عدد استفاده می‌شود */
  locale: string;
};

export const CURRENCY_INFO: Record<CurrencyCode, CurrencyInfo> = {
  IRR: {
    code: 'IRR',
    name: 'ریال',
    nameEn: 'Iranian Rial',
    symbol: 'ریال',
    decimals: 0,
    locale: 'fa-IR',
  },
  IRT: {
    code: 'IRT',
    name: 'تومان',
    nameEn: 'Iranian Toman',
    symbol: 'تومان',
    decimals: 0,
    locale: 'fa-IR',
  },
  AED: {
    code: 'AED',
    name: 'درهم',
    nameEn: 'UAE Dirham',
    symbol: 'د.إ',
    decimals: 2,
    locale: 'ar-AE',
  },
  USD: {
    code: 'USD',
    name: 'دلار',
    nameEn: 'US Dollar',
    symbol: '$',
    decimals: 2,
    locale: 'en-US',
  },
  EUR: {
    code: 'EUR',
    name: 'یورو',
    nameEn: 'Euro',
    symbol: '€',
    decimals: 2,
    locale: 'de-DE',
  },
  TRY: {
    code: 'TRY',
    name: 'لیر',
    nameEn: 'Turkish Lira',
    symbol: '₺',
    decimals: 2,
    locale: 'tr-TR',
  },
};

export function isCurrencyCode(value: unknown): value is CurrencyCode {
  return typeof value === 'string' && (CURRENCIES as readonly string[]).includes(value);
}

/** اطلاعات واحد پول؛ برای مقدار ناشناخته به ریال برمی‌گردد. */
export function currencyInfo(code: unknown): CurrencyInfo {
  return isCurrencyCode(code) ? CURRENCY_INFO[code] : CURRENCY_INFO.IRR;
}

/**
 * مبلغ را با واحد پول قالب‌بندی می‌کند.
 *
 * `decimals` برای وقتی است که شرکت رقم اعشار دلخواه تنظیم کرده باشد؛ در غیر
 * این صورت پیش‌فرض همان واحد استفاده می‌شود.
 */
export function formatMoney(
  amount: unknown,
  code: unknown,
  decimals?: number | null,
): string {
  const info = currencyInfo(code);
  const digits = decimals === undefined || decimals === null ? info.decimals : decimals;

  const value = Number(amount ?? 0);
  const formatted = (Number.isFinite(value) ? value : 0).toLocaleString(info.locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });

  return `${formatted} ${info.symbol}`;
}

/**
 * قالب‌بندی مبلغ با واحد پول شرکت
 *
 * واحد پول یک‌بار از سرور خوانده و در حافظه نگه داشته می‌شود؛ هر صفحه‌ای که
 * مبلغ نشان می‌دهد از همین‌جا استفاده می‌کند تا نماد و رقم اعشار همه‌جا یکسان
 * بماند.
 */
import { api } from './api';

export type Currency = {
  code: string;
  name: string;
  nameEn: string;
  symbol: string;
  decimals: number;
  locale: string;
};

const FALLBACK: Currency = {
  code: 'IRR',
  name: 'ریال',
  nameEn: 'Iranian Rial',
  symbol: 'ریال',
  decimals: 0,
  locale: 'fa-IR',
};

let cached: Currency | null = null;
let pending: Promise<Currency> | null = null;

/**
 * واحد پول شرکت را می‌گیرد.  چند فراخوانی هم‌زمان یک درخواست می‌سازند، و اگر
 * سرور در دسترس نباشد به ریال برمی‌گردد تا صفحه بی‌عدد نماند.
 */
export async function loadCurrency(): Promise<Currency> {
  if (cached) return cached;

  pending ??= api<Currency>('/company/currency')
    .then((currency) => {
      cached = currency;
      return currency;
    })
    .catch(() => FALLBACK)
    .finally(() => {
      pending = null;
    });

  return pending;
}

/** واحد پولی که هم‌اکنون در حافظه است — برای رندر همگام. */
export function currentCurrency(): Currency {
  return cached ?? FALLBACK;
}

/** مبلغ با نماد واحد پول، مثلاً «۱۲۰٬۰۰۰ تومان». */
export function money(amount: unknown, currency: Currency = currentCurrency()): string {
  return `${amountOnly(amount, currency)} ${currency.symbol}`;
}

/** فقط عدد، بدون نماد — برای جدول‌هایی که واحد را در سرستون می‌نویسند. */
export function amountOnly(
  amount: unknown,
  currency: Currency = currentCurrency(),
): string {
  const value = Number(amount ?? 0);

  return (Number.isFinite(value) ? value : 0).toLocaleString(currency.locale, {
    minimumFractionDigits: currency.decimals,
    maximumFractionDigits: currency.decimals,
  });
}

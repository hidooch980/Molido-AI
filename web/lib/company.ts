/**
 * هویت شرکت یا فروشگاه.
 *
 * نام، آدرس، تلفن و لوگو یک‌بار از سرور خوانده و در حافظه نگه داشته
 * می‌شوند؛ هرجا که این‌ها دیده می‌شوند — سربرگ پنل، فاکتور، رسید صندوق،
 * برچسب کالا — از همین‌جا می‌آیند.
 *
 * چرا یک‌جا: تا امروز «Molido AI» در پنج فایل مختلف ثابت نوشته شده بود.
 * فروشگاهی که سامانه را می‌خرد، نام خودش را می‌خواهد نه نام سازنده را — و
 * با پنج نقطهٔ جدا، همیشه یکی‌شان جا می‌ماند.
 *
 * الگویش عمداً همان `loadCurrency` است: یک ماژول با حافظهٔ داخلی، نه یک
 * Context تازه.  دو الگوی متفاوت برای یک کار یکسان، فقط سردرگمی می‌سازد.
 */
import { api } from './api';

export type Company = {
  id: string;
  name: string;
  legalName: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  address: string | null;
  city: string | null;
  taxNumber: string | null;
  logo: string | null;
};

/**
 * مقدار پیش‌فرض پیش از رسیدن پاسخ.
 *
 * نامِ خالی بهتر از «Molido AI» است: نام سازنده روی فاکتور یک فروشگاه
 * دیگر، اشتباه است — حتی برای یک لحظه.
 */
const FALLBACK: Company = {
  id: '',
  name: '',
  legalName: null,
  phone: null,
  email: null,
  website: null,
  address: null,
  city: null,
  taxNumber: null,
  logo: null,
};

let cached: Company | null = null;
let pending: Promise<Company> | null = null;

/**
 * مشخصات شرکت را می‌گیرد.
 *
 * چند فراخوانی هم‌زمان یک درخواست می‌سازند، و اگر سرور در دسترس نباشد
 * مقدار خالی برمی‌گردد تا صفحه نشکند.
 */
export async function loadCompany(): Promise<Company> {
  if (cached) return cached;

  pending ??= api<Company>('/company')
    .then((company) => {
      cached = company;
      return company;
    })
    .catch(() => FALLBACK)
    .finally(() => {
      pending = null;
    });

  return pending;
}

/** مشخصاتی که هم‌اکنون در حافظه است — برای رندر همگام. */
export function currentCompany(): Company {
  return cached ?? FALLBACK;
}

/**
 * نام نمایشی.
 *
 * پیش از رسیدن پاسخ، `fallback` نشان داده می‌شود — معمولاً نام محصول در
 * صفحهٔ ورود، جایی که هنوز کاربری وارد نشده و شرکتی معلوم نیست.
 */
export function companyName(fallback = ''): string {
  return currentCompany().name?.trim() || fallback;
}

/** پس از ویرایش تنظیمات، حافظه باید تازه شود وگرنه نام قدیمی می‌ماند. */
export function invalidateCompany(next?: Company): void {
  cached = next ?? null;
}

/**
 * سربرگ چاپی: نام، آدرس، تلفن و شناسهٔ مالیاتی.
 *
 * فاکتور و رسید هر دو همین را می‌خواهند؛ ساختش در دو جا یعنی روزی یکی از
 * آن‌ها شناسهٔ مالیاتی را جا می‌اندازد.
 */
export function printHeader(): string[] {
  const company = currentCompany();

  return [
    company.name,
    company.address,
    company.phone,
    company.taxNumber ? `شناسهٔ مالیاتی: ${company.taxNumber}` : null,
  ].filter((line): line is string => Boolean(line?.trim()));
}

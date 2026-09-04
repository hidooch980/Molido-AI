/**
 * اتصال به عامل چاپ محلی.
 *
 * اگر عامل روی دستگاه صندوق نصب باشد، رسید مستقیم و بی‌صدا چاپ می‌شود و
 * کشوی پول باز می‌شود.  اگر نباشد، همان چاپ معمولی مرورگر استفاده می‌شود —
 * پس نبودِ عامل هیچ‌چیز را نمی‌شکند، فقط یک گفتگوی چاپ اضافه می‌شود.
 */

const AGENT_URL = 'http://127.0.0.1:17777';

/** نتیجهٔ بررسی تا هر بار رفت‌وبرگشت شبکه انجام نشود. */
let cached: boolean | null = null;

/**
 * آیا عامل در دسترس است.
 *
 * `AbortSignal.timeout` لازم است چون وقتی عامل نصب نباشد، اتصال به پورت
 * بسته روی برخی سیستم‌ها تا ده‌ها ثانیه معلق می‌ماند — و صندوق‌دار پشت
 * یک دکمهٔ بی‌جواب می‌ماند.
 */
export async function isAgentAvailable(): Promise<boolean> {
  if (cached !== null) return cached;
  if (typeof window === 'undefined') return false;

  try {
    const response = await fetch(`${AGENT_URL}/status`, {
      signal: AbortSignal.timeout(600),
    });

    cached = response.ok;
  } catch {
    cached = false;
  }

  return cached;
}

/**
 * چاپ رسید از طریق عامل.
 *
 * `false` یعنی نشد و فراخوان باید به چاپ مرورگر برگردد.  خطا پرتاب
 * نمی‌شود: شکست چاپ نباید مانع ثبت فروش شود — فاکتور ثبت شده و رسید را
 * می‌شود دوباره چاپ کرد.
 */
export async function printViaAgent(
  text: string,
  options: { cut?: boolean; drawer?: boolean } = {},
): Promise<boolean> {
  if (!(await isAgentAvailable())) return false;

  try {
    const response = await fetch(`${AGENT_URL}/print`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        cut: options.cut !== false,
        drawer: options.drawer === true,
      }),
      signal: AbortSignal.timeout(5000),
    });

    return response.ok;
  } catch {
    return false;
  }
}

/** باز کردن کشوی پول بدون چاپ — برای گرفتن یا دادن پول خرد. */
export async function openCashDrawer(): Promise<boolean> {
  if (!(await isAgentAvailable())) return false;

  try {
    const response = await fetch(`${AGENT_URL}/drawer`, {
      method: 'POST',
      signal: AbortSignal.timeout(3000),
    });

    return response.ok;
  } catch {
    return false;
  }
}

/**
 * تبدیل رسید به متن ساده برای چاپگر حرارتی.
 *
 * چاپگر HTML نمی‌فهمد؛ متن ساده با عرض ثابت لازم دارد.  عرض ۳۲ نویسه
 * استاندارد چاپگر ۸۰ میلی‌متری با فونت پیش‌فرض است.
 */
export function receiptToText(sale: {
  invoiceNo: string;
  createdAt?: string;
  items: Array<{ name: string; quantity: number; price: number; total: number }>;
  subtotal: number;
  discount?: number;
  tax?: number;
  total: number;
  paid?: number;
  change?: number;
  shopName?: string;
}): string {
  const W = 32;
  const line = '-'.repeat(W);
  const fa = (value: number) => Number(value ?? 0).toLocaleString('fa-IR');

  const center = (text: string) => {
    const pad = Math.max(0, Math.floor((W - text.length) / 2));
    return ' '.repeat(pad) + text;
  };

  /** برچسب راست، عدد چپ — با نقطه‌چین بینشان تا خوانا بماند. */
  const row = (label: string, value: string) => {
    const gap = Math.max(1, W - label.length - value.length);
    return label + ' '.repeat(gap) + value;
  };

  const out: string[] = [];

  if (sale.shopName) out.push(center(sale.shopName), '');
  out.push(center(`فاکتور ${sale.invoiceNo}`));

  if (sale.createdAt) {
    out.push(center(new Date(sale.createdAt).toLocaleString('fa-IR')));
  }

  out.push(line);

  for (const item of sale.items) {
    // نام در یک خط، مقدار و مبلغ در خط بعد: نام کالای فارسی معمولاً از
    // عرض کاغذ بلندتر است و شکستنش خواناتر از بریدن است.
    out.push(item.name.slice(0, W));
    out.push(row(`  ${fa(item.quantity)} × ${fa(item.price)}`, fa(item.total)));
  }

  out.push(line);
  out.push(row('جمع', fa(sale.subtotal)));

  if (sale.discount) out.push(row('تخفیف', `-${fa(sale.discount)}`));
  if (sale.tax) out.push(row('مالیات', fa(sale.tax)));

  out.push(row('مبلغ کل', fa(sale.total)));

  if (sale.paid !== undefined) out.push(row('پرداختی', fa(sale.paid)));
  if (sale.change) out.push(row('باقی‌مانده', fa(sale.change)));

  out.push(line, center('با تشکر از خرید شما'));

  return out.join('\n');
}

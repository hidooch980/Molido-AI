import { Currency, amountOnly, currentCurrency, money } from './money';

/**
 * چاپ رسید فروشگاهی
 *
 * چاپگرهای حرارتی رومیزی به‌صورت درایور ویندوز/لینوکس نصب می‌شوند و از مسیر
 * چاپ معمولی مرورگر کار می‌کنند؛ بنابراین به‌جای وابستگی به ESC/POS، یک صفحهٔ
 * HTML با عرض ۸۰ میلی‌متر ساخته و چاپ می‌شود.  این کار سیستم را ساده نگه
 * می‌دارد: هیچ سرویس جانبی روی دستگاه صندوق لازم نیست.
 */

export type ReceiptSale = {
  invoiceNo: string;
  subtotal: string | number;
  discount: string | number;
  tax: string | number;
  total: string | number;
  createdAt: string;
};

export type ReceiptLine = {
  name: string;
  quantity: number | string;
  price: number | string;
  total: number | string;
};

export type ReceiptOptions = {
  storeName?: string;
  lines?: ReceiptLine[];
  cashierName?: string;
  footer?: string;
  /** واحد پول شرکت؛ در نبودش ریال فرض می‌شود. */
  currency?: Currency;
};

/** عدد بدون نماد — ستون‌های رسید حرارتی جا برای نماد ندارند. */
const num = (value: unknown, currency?: Currency) => amountOnly(value, currency);

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function receiptHtml(sale: ReceiptSale, options: ReceiptOptions = {}): string {
  const currency = options.currency ?? currentCurrency();
  const rows = (options.lines ?? [])
    .map(
      (line) => `<tr>
        <td class="name">${escapeHtml(line.name)}</td>
        <td>${num(line.quantity)}</td>
        <td>${num(line.price, currency)}</td>
        <td>${num(line.total, currency)}</td>
      </tr>`,
    )
    .join('');

  const discount = Number(sale.discount ?? 0);
  const tax = Number(sale.tax ?? 0);

  return `<!DOCTYPE html>
<html dir="rtl" lang="fa">
<head>
<meta charset="utf-8" />
<title>رسید ${escapeHtml(sale.invoiceNo)}</title>
<style>
  @page { size: 80mm auto; margin: 0; }
  body {
    font-family: Tahoma, 'Vazirmatn', sans-serif;
    width: 72mm; margin: 0 auto; padding: 4mm 0;
    color: #000; font-size: 11px; line-height: 1.6;
  }
  h2 { text-align: center; margin: 0 0 6px; font-size: 15px; }
  .meta { display: flex; justify-content: space-between; font-size: 10px; }
  hr { border: none; border-top: 1px dashed #000; margin: 6px 0; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: center; padding: 2px 1px; }
  th { font-size: 10px; border-bottom: 1px solid #000; }
  td.name { text-align: right; }
  .totals div { display: flex; justify-content: space-between; }
  .grand { font-weight: bold; font-size: 13px; border-top: 1px solid #000; padding-top: 4px; margin-top: 4px; }
  .footer { text-align: center; margin-top: 8px; font-size: 10px; }
  @media print { .no-print { display: none; } }
</style>
</head>
<body>
  <h2>${escapeHtml(options.storeName ?? 'فروشگاه')}</h2>

  <div class="meta">
    <span>فاکتور: ${escapeHtml(sale.invoiceNo)}</span>
    <span>${new Date(sale.createdAt).toLocaleDateString('fa-IR')}</span>
  </div>
  <div class="meta">
    <span>${options.cashierName ? `صندوق‌دار: ${escapeHtml(options.cashierName)}` : ''}</span>
    <span>${new Date(sale.createdAt).toLocaleTimeString('fa-IR')}</span>
  </div>

  <hr />

  ${
    rows
      ? `<table>
    <thead><tr><th>شرح</th><th>تعداد</th><th>فی</th><th>جمع</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <hr />`
      : ''
  }

  <div class="totals">
    <div><span>جمع اقلام</span><span>${num(sale.subtotal, currency)}</span></div>
    ${discount > 0 ? `<div><span>تخفیف</span><span>${num(discount, currency)}</span></div>` : ''}
    ${tax > 0 ? `<div><span>مالیات</span><span>${num(tax, currency)}</span></div>` : ''}
    <div class="grand"><span>قابل پرداخت</span><span>${money(sale.total, currency)}</span></div>
  </div>

  <div class="footer">${escapeHtml(options.footer ?? 'از خرید شما سپاسگزاریم 🌿')}</div>

  <button class="no-print" onclick="window.print()">چاپ</button>
</body>
</html>`;
}

/**
 * رسید را در یک پنجرهٔ جداگانه باز کرده و پنجرهٔ چاپ را باز می‌کند.
 *
 * پنجره پس از چاپ بسته می‌شود تا صندوق‌دار میان فاکتورها پنجرهٔ اضافی جمع
 * نکند؛ اگر مرورگر پنجره را مسدود کند، خطا برگردانده می‌شود تا صفحه بتواند
 * پیام بدهد.
 */
export function printReceipt(sale: ReceiptSale, options: ReceiptOptions = {}): void {
  const printWindow = window.open('', '_blank', 'width=380,height=640');

  if (!printWindow) {
    throw new Error('چاپ مسدود شد — اجازهٔ باز شدن پنجره را بدهید');
  }

  printWindow.document.write(receiptHtml(sale, options));
  printWindow.document.close();

  printWindow.addEventListener('load', () => {
    printWindow.focus();
    printWindow.print();
    printWindow.close();
  });
}

/**
 * محاسبهٔ فاکتور — عمداً بدون React و بدون شبکه.
 *
 * منطق پول باید بدون بالا آوردن مرورگر قابل آزمون باشد؛ همان درسی که در
 * قیمت‌گذاری و مالیات گرفتیم.  هرچه اینجا خالص بماند، اشتباهِ ریالی
 * زودتر و ارزان‌تر پیدا می‌شود.
 *
 * توجه: این محاسبه فقط برای نمایش زنده به فروشنده است.  مبلغ نهایی را
 * سرور دوباره حساب می‌کند و همان ملاک است — وگرنه هر کسی با ابزار
 * توسعه‌دهندهٔ مرورگر می‌توانست قیمت را عوض کند.
 */

export type Line = {
  key: string;
  productId: string;
  name: string;
  sku: string;
  barcode: string | null;
  unit: string;
  /** موجودی انبار در لحظهٔ افزودن — برای هشدار، نه برای محاسبه */
  available: number | null;
  quantity: number;
  unitPrice: number;
  /** درصد تخفیف این قلم؛ فرم درصد می‌گیرد، سرور مبلغ می‌خواهد */
  discountPercent: number;
  /**
   * نرخ مالیات این کالا — **خواندنی**، از خودِ کالا می‌آید.
   *
   * قابل ویرایش نیست چون سرور هم آن را از کالا می‌خواند و ورودی
   * کلاینت را نادیده می‌گیرد.  نمایش یک میدانِ قابل تایپ که اثری
   * ندارد، بدتر از نشان ندادنش است.
   */
  taxPercent: number;
  note: string;
  /** شمارهٔ سریال روی همین ردیف؛ متن آزاد چون گاهی چند سریال است. */
  serial: string;
};

export type Extras = {
  /** تخفیف کلی به درصد جمع اقلام */
  discountPercent: number;
  /**
   * نرخ مالیاتِ جایگزین، فقط وقتی هیچ کالایی نرخ خودش را ندارد.
   *
   * سرور همین قاعده را دارد: اگر جمع مالیات ردیفی صفر باشد، این عدد
   * به کار می‌آید؛ وگرنه نادیده گرفته می‌شود.  اگر هر دو جمع شوند،
   * مالیات دو بار بسته می‌شود.
   */
  fallbackTaxPercent: number;
  additions: number;
  deductions: number;
};

export type Totals = {
  itemsTotal: number;
  lineDiscount: number;
  overallDiscount: number;
  discount: number;
  tax: number;
  additions: number;
  deductions: number;
  payable: number;
};

/** ریال کسری ندارد؛ گرد کردن در همان قلم انجام می‌شود نه در جمع. */
function rial(value: number): number {
  return Math.round(value);
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(value, 100);
}

/** مبلغ ناخالص قلم، پیش از تخفیف. */
export function lineGross(line: Line): number {
  const qty = Number.isFinite(line.quantity) ? line.quantity : 0;
  const price = Number.isFinite(line.unitPrice) ? line.unitPrice : 0;
  return rial(Math.max(0, qty) * Math.max(0, price));
}

/** تخفیف قلم به ریال — همان چیزی که سرور در `manualDiscount` می‌خواهد. */
export function lineDiscountAmount(line: Line): number {
  return rial((lineGross(line) * clampPercent(line.discountPercent)) / 100);
}

export function lineNet(line: Line): number {
  return lineGross(line) - lineDiscountAmount(line);
}

/**
 * مالیات این قلم — روی مبلغِ **پس از تخفیف**.
 *
 * مالیات روی چیزی که مشتری نپرداخته بسته نمی‌شود؛ اگر روی مبلغ ناخالص
 * حساب شود، صورتحساب با آنچه به سامانهٔ مؤدیان می‌رود نمی‌خواند.
 */
export function lineTaxAmount(line: Line): number {
  return rial((lineNet(line) * clampPercent(line.taxPercent)) / 100);
}

export function computeTotals(lines: Line[], extras: Extras): Totals {
  const itemsTotal = lines.reduce((sum, line) => sum + lineGross(line), 0);
  const lineDiscount = lines.reduce((sum, line) => sum + lineDiscountAmount(line), 0);
  const afterLines = itemsTotal - lineDiscount;

  // تخفیف کلی روی مبلغِ پس از تخفیف قلم اعمال می‌شود، نه روی جمع خام.
  // اگر روی جمع خام باشد، دو تخفیف روی هم جمع می‌شوند و می‌توانند از
  // کل مبلغ فراتر بروند.
  const overallDiscount = rial((afterLines * clampPercent(extras.discountPercent)) / 100);
  const discount = lineDiscount + overallDiscount;

  const taxable = Math.max(0, afterLines - overallDiscount);

  // مالیات ردیفی مقدم است.  نرخ سراسری فقط برای فروشگاهی است که هنوز
  // نرخ کالاها را وارد نکرده — وگرنه جمعشان مالیات را دو برابر می‌کند.
  const lineTax = lines.reduce((sum, line) => sum + lineTaxAmount(line), 0);
  const tax =
    lineTax > 0 ? lineTax : rial((taxable * clampPercent(extras.fallbackTaxPercent)) / 100);

  const additions = Math.max(0, rial(extras.additions || 0));
  const deductions = Math.max(0, rial(extras.deductions || 0));

  // کسورات نباید مبلغ را منفی کند — سرور هم ردش می‌کند، ولی فروشنده
  // باید همان لحظه ببیند نه بعد از زدن «ثبت».
  const payable = Math.max(0, taxable + tax + additions - deductions);

  return { itemsTotal, lineDiscount, overallDiscount, discount, tax, additions, deductions, payable };
}

/** قلم‌هایی که موجودی کافی ندارند — پیام هشدار، نه جلوگیری. */
export function shortStock(lines: Line[]): Line[] {
  return lines.filter(
    (line) => line.available !== null && line.quantity > line.available,
  );
}

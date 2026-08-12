/**
 * فهرست ابزارهای دستیار
 *
 * دستیار به‌جای تولید SQL، از میان چند تابع تحلیلی از پیش تعریف‌شده انتخاب
 * می‌کند.  دلیل این انتخاب امنیت است: `companyId` هرگز به مدل داده نمی‌شود و
 * از درخواست احراز هویت‌شده می‌آید، بنابراین حتی اگر مدل چیز عجیبی برگرداند،
 * نشت داده بین شرکت‌ها ممکن نیست.  به‌علاوه هر ابزار قطعی و قابل تست است و
 * بدون مدل زبانی هم کار می‌کند.
 */

export type ToolParam = {
  name: string;
  type: 'number' | 'string';
  description: string;
  default?: number | string;
};

export type ToolSpec = {
  name: string;
  /** توضیح فارسی — هم برای مدل و هم برای تطبیق آفلاین به کار می‌رود. */
  description: string;
  /** واژه‌هایی که در نبود مدل زبانی، پرسش را به این ابزار می‌رسانند. */
  keywords: string[];
  params: ToolParam[];
};

export const TOOLS: ToolSpec[] = [
  {
    name: 'dashboard',
    description: 'خلاصهٔ وضعیت امروز و ماه جاری: فروش، هزینه، تعداد کالا و مشتری، ارزش انبار',
    keywords: ['داشبورد', 'خلاصه', 'وضعیت', 'امروز', 'کلی', 'اوضاع', 'چه خبر'],
    params: [],
  },
  {
    name: 'salesAnalysis',
    description: 'تحلیل روند فروش ۶۰ روز اخیر: رشد یا افت، پرفروش‌ترین روز هفته، میانگین فاکتور',
    keywords: ['روند', 'رشد', 'افت', 'تحلیل فروش', 'فروش چطور', 'میانگین فاکتور'],
    params: [],
  },
  {
    name: 'salesForecast',
    description: 'پیش‌بینی فروش روزهای آینده بر اساس الگوی هفتگی',
    keywords: ['پیش‌بینی', 'پیشبینی', 'آینده', 'هفته آینده', 'فردا', 'چقدر می‌فروشیم'],
    params: [
      { name: 'daysAhead', type: 'number', description: 'چند روز آینده', default: 7 },
    ],
  },
  {
    name: 'reorderSuggestions',
    description: 'پیشنهاد سفارش خرید: چه کالایی، چه مقدار، با چه هزینه‌ای باید سفارش داد',
    keywords: ['سفارش', 'خرید', 'چه بخرم', 'تأمین', 'تامین', 'کم شده', 'شارژ انبار'],
    params: [
      { name: 'leadTimeDays', type: 'number', description: 'روز تا تحویل کالا', default: 7 },
      { name: 'coverDays', type: 'number', description: 'چند روز پوشش موجودی', default: 14 },
    ],
  },
  {
    name: 'inventoryAnalysis',
    description: 'وضعیت موجودی هر کالا، سرعت فروش روزانه و پیش‌بینی روز اتمام موجودی',
    keywords: ['موجودی', 'انبار', 'تمام میشه', 'تمام می‌شود', 'سرعت فروش', 'کسری'],
    params: [],
  },
  {
    name: 'deadStock',
    description: 'کالای راکد و سرمایهٔ خوابیده در انبار',
    keywords: ['راکد', 'خواب', 'نمی‌فروشد', 'نمیفروشه', 'بی‌فروش', 'سرمایه خوابیده'],
    params: [
      { name: 'days', type: 'number', description: 'چند روز بدون فروش', default: 60 },
    ],
  },
  {
    name: 'expiryAnalysis',
    description: 'کالاهای نزدیک به تاریخ انقضا',
    keywords: ['انقضا', 'تاریخ مصرف', 'فاسد', 'منقضی'],
    params: [
      { name: 'daysAhead', type: 'number', description: 'افق هشدار به روز', default: 30 },
    ],
  },
  {
    name: 'topProducts',
    description: 'پرفروش‌ترین کالاها بر اساس درآمد',
    keywords: ['پرفروش', 'بهترین کالا', 'بیشترین فروش', 'محبوب'],
    params: [
      { name: 'limit', type: 'number', description: 'چند قلم', default: 10 },
    ],
  },
  {
    name: 'profitReport',
    description: 'سود و حاشیهٔ سود: درآمد فروش منهای بهای تمام‌شدهٔ کالای فروخته‌شده',
    keywords: ['سود', 'حاشیه', 'زیان', 'منفعت', 'درآمد خالص'],
    params: [],
  },
  {
    name: 'priceSuggestions',
    description: 'پیشنهاد قیمت برای رسیدن به حاشیهٔ سود هدف',
    keywords: ['قیمت', 'قیمت‌گذاری', 'گران', 'ارزان', 'حاشیه هدف'],
    params: [
      {
        name: 'targetMargin',
        type: 'number',
        description: 'حاشیهٔ سود هدف به درصد',
        default: 25,
      },
    ],
  },
  {
    name: 'cashierAnomalies',
    description: 'مغایرت غیرعادی صندوق و صندوق‌داران مشکوک',
    keywords: ['صندوق', 'صندوق‌دار', 'کسری صندوق', 'مغایرت', 'مشکوک', 'دزدی', 'تقلب'],
    params: [
      { name: 'days', type: 'number', description: 'بازهٔ بررسی به روز', default: 30 },
    ],
  },
  {
    name: 'lowStockAlerts',
    description: 'کالاهایی که موجودی‌شان به حداقل رسیده است',
    keywords: ['هشدار', 'حداقل موجودی', 'ته انبار', 'رو به اتمام'],
    params: [],
  },
  {
    name: 'unpaidSales',
    description: 'فاکتورهای پرداخت‌نشده و بدهی مشتریان',
    keywords: ['بدهی', 'طلب', 'پرداخت نشده', 'نسیه', 'مانده مشتری'],
    params: [],
  },
  {
    name: 'revenueStats',
    description: 'درآمد وصول‌شده به تفکیک زیرسیستم (عوارض، جواز، پارکینگ و ...)',
    keywords: ['درآمد', 'وصول', 'رسید', 'عوارض'],
    params: [],
  },
  {
    name: 'rationSettlement',
    description: 'گزارش تسویهٔ کالابرگ: مصرف، برگشت و اعتبار باقی‌مانده',
    keywords: ['کالابرگ', 'یارانه', 'سهمیه', 'تسویه کالابرگ'],
    params: [],
  },
];

/**
 * ابزار مناسب پرسش را بدون مدل زبانی پیدا می‌کند.
 *
 * امتیازدهی ساده بر پایهٔ واژه‌های کلیدی است.  هدف جایگزینی مدل نیست؛ هدف این
 * است که سامانه در نبود اینترنت هم پاسخ بدهد، چون بسیاری از فروشگاه‌ها اصلاً
 * دسترسی خارجی ندارند.
 */
/**
 * واژه‌های عمومی که به‌تنهایی نشانهٔ قصد نیستند.  «امروز هوا چطور است؟» نباید
 * داشبورد فروشگاه را باز کند، ولی «امروز چقدر فروختیم؟» باید.  بنابراین این
 * واژه‌ها فقط وقتی می‌شمارند که واژهٔ اختصاصی‌تری هم در پرسش باشد، یا پرسش
 * حاوی واژهٔ حوزهٔ کسب‌وکار باشد.
 */
const GENERIC_KEYWORDS = new Set(['امروز', 'کلی', 'آینده', 'خرید', 'قیمت', 'صندوق']);

/** واژه‌هایی که نشان می‌دهند پرسش دربارهٔ همین سامانه است. */
const DOMAIN_HINTS = [
  'فروش',
  'فروخت',
  'بفروش',
  'می‌فروش',
  'میفروش',
  'فروشگاه',
  'کالا',
  'انبار',
  'موجودی',
  'مشتری',
  'فاکتور',
  'صندوق',
  'سود',
  'درآمد',
  'خرید',
  'سفارش',
];

export function matchTool(question: string): { tool: ToolSpec; score: number } | null {
  const text = question.trim().toLowerCase();
  if (!text) return null;

  const inDomain = DOMAIN_HINTS.some((hint) => text.includes(hint));

  let best: { tool: ToolSpec; score: number } | null = null;

  for (const tool of TOOLS) {
    let score = 0;
    let specific = false;

    for (const keyword of tool.keywords) {
      if (!text.includes(keyword.toLowerCase())) continue;

      // واژهٔ بلندتر نشانهٔ تطبیق دقیق‌تر است
      score += keyword.length;
      if (!GENERIC_KEYWORDS.has(keyword)) specific = true;
    }

    // تطبیقی که فقط از واژه‌های عمومی آمده باشد، تنها وقتی پذیرفته می‌شود که
    // پرسش دست‌کم به حوزهٔ کسب‌وکار مربوط باشد.
    if (!score || (!specific && !inDomain)) continue;

    if (!best || score > best.score) best = { tool, score };
  }

  return best;
}

/**
 * عددی که در متن پرسش آمده را برای یک پارامتر برمی‌دارد.
 * مثال: «۱۴ روز آینده چقدر می‌فروشیم؟» → ۱۴
 */
export function extractNumber(question: string): number | null {
  const normalised = question.replace(/[۰-۹]/g, (digit) =>
    String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)),
  );
  const match = /\d+/.exec(normalised);
  return match ? Number(match[0]) : null;
}

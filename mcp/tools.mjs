/**
 * تعریف ابزارهای MCP — عمداً خالص و بدون شبکه.
 *
 * هر ابزار سه چیز دارد: توضیح، شمای ورودی، و تابعی که ورودی را به یک
 * درخواست HTTP تبدیل می‌کند.  خودِ فرستادن درخواست جای دیگری است تا
 * این فایل بدون سرور آزمون‌پذیر بماند.
 *
 * ## چرا همه‌شان فقط خواندنی‌اند
 *
 * دستیار هوشمند گاهی اشتباه می‌کند.  اشتباه در «گزارش فروش امروز را
 * بده» یک جملهٔ غلط است؛ اشتباه در «این فاکتور را ثبت کن» پولِ واقعیِ
 * مشتری است و موجودی انبار را هم خراب می‌کند.
 *
 * تا وقتی کسی صریح نخواهد و راهی برای تأیید انسانی نباشد، نوشتن از
 * این مسیر باز نمی‌شود.
 */

/** بازهٔ زمانی که گزارش‌ها می‌پذیرند. */
const PERIODS = ['today', 'week', 'month', 'year'];

/**
 * قالب‌بندی تاریخ با **اجزای محلی**، نه UTC.
 *
 * `toISOString()` تاریخ را به UTC می‌برد.  نیمه‌شبِ محلی در تهران
 * (UTC+۳:۳۰) می‌شود ۲۰:۳۰ روزِ قبل — یعنی «فروش امروز» یک روز عقب
 * می‌رفت و هیچ خطایی هم نمی‌داد؛ فقط عددِ غلط برمی‌گشت.
 */
function localDate(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * تبدیل تاریخ نسبی به بازهٔ میلادی.
 *
 * `today` را خودِ سرور هم می‌فهمد، ولی «هفتهٔ گذشته» را نه — و
 * فرستادن تاریخ صریح یعنی جواب به ساعتِ سرور وابسته نیست.
 */
export function rangeOf(period, now) {
  const end = new Date(now);
  const start = new Date(now);

  switch (period) {
    case 'week':
      start.setDate(start.getDate() - 7);
      break;
    case 'month':
      start.setMonth(start.getMonth() - 1);
      break;
    case 'year':
      start.setFullYear(start.getFullYear() - 1);
      break;
    default:
      // امروز: از نیمه‌شبِ محلی
      start.setHours(0, 0, 0, 0);
  }

  return { from: localDate(start), to: localDate(end) };
}

/**
 * پاک‌سازی عدد ورودی.
 *
 * مدل گاهی رشته می‌فرستد («۱۰») و گاهی عددِ بی‌معنی (−۵ یا ۱۰۰۰۰).
 * هر دو باید پیش از رسیدن به سرور مهار شوند.
 */
export function clampLimit(value, fallback = 20, max = 100) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(Math.floor(n), max);
}

export const TOOLS = [
  {
    name: 'search_products',
    title: 'جست‌وجوی کالا',
    description:
      'جست‌وجوی کالا با نام، کد کالا یا بارکد. برای پیدا کردن شناسهٔ کالا پیش از پرسیدن موجودی یا قیمتش.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'نام، کد یا بارکد کالا' },
        limit: { type: 'number', description: 'حداکثر نتیجه (پیش‌فرض ۲۰)' },
      },
      required: ['query'],
    },
    request: (args) => ({
      method: 'GET',
      path: '/retail/search',
      query: { q: String(args.query ?? ''), limit: clampLimit(args.limit) },
    }),
  },

  {
    name: 'low_stock',
    title: 'کالاهای رو به اتمام',
    description:
      'کالاهایی که موجودی‌شان از حد سفارش پایین‌تر رفته. برای پاسخ به «چه چیزی باید بخرم؟».',
    inputSchema: {
      type: 'object',
      properties: {
        warehouseId: { type: 'string', description: 'شناسهٔ انبار (اختیاری)' },
      },
    },
    request: (args) => ({
      method: 'GET',
      path: '/inventory/low-stock',
      query: args.warehouseId ? { warehouseId: String(args.warehouseId) } : {},
    }),
  },

  {
    name: 'expiring_stock',
    title: 'کالاهای نزدیک به انقضا',
    description:
      'بچ‌هایی که تاریخ انقضایشان نزدیک است. برای تصمیم دربارهٔ تخفیف یا مرجوعی.',
    inputSchema: {
      type: 'object',
      properties: {
        days: { type: 'number', description: 'تا چند روز آینده (پیش‌فرض ۳۰)' },
      },
    },
    request: (args) => ({
      method: 'GET',
      path: '/inventory/expiring',
      query: { days: clampLimit(args.days, 30, 365) },
    }),
  },

  {
    name: 'sales_report',
    title: 'گزارش فروش',
    description:
      'جمع فروش در یک بازه. بازه‌های مجاز: today، week، month، year.',
    inputSchema: {
      type: 'object',
      properties: {
        period: {
          type: 'string',
          enum: PERIODS,
          description: 'بازهٔ زمانی (پیش‌فرض today)',
        },
      },
    },
    request: (args, now) => {
      const period = PERIODS.includes(args.period) ? args.period : 'today';
      return { method: 'GET', path: '/reports/sales', query: rangeOf(period, now) };
    },
  },

  {
    name: 'top_products',
    title: 'پرفروش‌ترین کالاها',
    description: 'کالاهایی که بیشترین فروش را داشته‌اند در بازهٔ خواسته‌شده.',
    inputSchema: {
      type: 'object',
      properties: {
        period: { type: 'string', enum: PERIODS, description: 'بازهٔ زمانی' },
        limit: { type: 'number', description: 'چند قلم (پیش‌فرض ۱۰)' },
      },
    },
    request: (args, now) => {
      const period = PERIODS.includes(args.period) ? args.period : 'month';
      return {
        method: 'GET',
        path: '/reports/top-products',
        query: { ...rangeOf(period, now), limit: clampLimit(args.limit, 10, 50) },
      };
    },
  },

  {
    name: 'profit_report',
    title: 'گزارش سود',
    description:
      'سود ناخالص در یک بازه: فروش منهای بهای تمام‌شده. برای پاسخ به «چقدر سود کردیم؟».',
    inputSchema: {
      type: 'object',
      properties: {
        period: { type: 'string', enum: PERIODS, description: 'بازهٔ زمانی' },
      },
    },
    request: (args, now) => {
      const period = PERIODS.includes(args.period) ? args.period : 'month';
      return { method: 'GET', path: '/reports/profit', query: rangeOf(period, now) };
    },
  },

  {
    name: 'dashboard',
    title: 'نمای کلی',
    description:
      'خلاصهٔ وضعیت امروز: فروش، تعداد فاکتور، موجودی نقد. برای شروع هر گفت‌وگو دربارهٔ وضعیت فروشگاه.',
    inputSchema: { type: 'object', properties: {} },
    request: () => ({ method: 'GET', path: '/reports/dashboard', query: {} }),
  },

  {
    name: 'purchase_suggestions',
    title: 'پیشنهاد خرید مریم',
    description:
      'کالاهایی که منشی خرید پیشنهاد می‌کند سفارش داده شوند، با مقدار پیشنهادی و آخرین قیمت خرید.',
    inputSchema: {
      type: 'object',
      properties: {
        warehouseId: { type: 'string', description: 'شناسهٔ انبار (اختیاری)' },
      },
    },
    request: (args) => ({
      method: 'GET',
      path: '/purchasing/suggestions',
      query: args.warehouseId ? { warehouseId: String(args.warehouseId) } : {},
    }),
  },

  {
    name: 'price_history',
    title: 'تاریخچهٔ قیمت خرید',
    description:
      'قیمت‌هایی که بنکداران مختلف برای یک کالا داده‌اند. برای پاسخ به «این را از کی ارزان‌تر می‌خرم؟».',
    inputSchema: {
      type: 'object',
      properties: {
        productId: { type: 'string', description: 'شناسهٔ کالا' },
      },
      required: ['productId'],
    },
    request: (args) => ({
      method: 'GET',
      path: `/purchasing/price-history/${encodeURIComponent(String(args.productId ?? ''))}`,
      query: {},
    }),
  },

  {
    name: 'voice_corpus_status',
    title: 'وضعیت پیکرهٔ صوتی بلوچی',
    description:
      'چند عبارت ضبط شده، چند گوینده، و آیا داده برای آموزش موتور گفتار کافی است.',
    inputSchema: {
      type: 'object',
      properties: {
        dialect: {
          type: 'string',
          enum: ['SARHADDI', 'MAKRANI', 'SARAWANI'],
          description: 'گویش (پیش‌فرض سرحدی)',
        },
      },
    },
    request: (args) => ({
      method: 'GET',
      path: '/voice/status',
      query: args.dialect ? { dialect: String(args.dialect) } : {},
    }),
  },
];

/** پیدا کردن ابزار با نام — برای سرور و آزمون. */
export function toolByName(name) {
  return TOOLS.find((tool) => tool.name === name) ?? null;
}

/**
 * ساخت درخواست از فراخوانی ابزار.
 *
 * `now` پارامتر است نه `new Date()` داخلی: بدون آن، آزمونِ بازهٔ زمانی
 * فردا نتیجهٔ دیگری می‌دهد.
 */
export function buildRequest(name, args = {}, now = new Date()) {
  const tool = toolByName(name);
  if (!tool) throw new Error(`ابزار ناشناخته: ${name}`);

  for (const required of tool.inputSchema.required ?? []) {
    const value = args[required];
    if (value === undefined || value === null || String(value).trim() === '') {
      throw new Error(`پارامتر «${required}» برای ${name} لازم است`);
    }
  }

  return tool.request(args, now);
}

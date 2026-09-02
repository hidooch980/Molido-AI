import { PostingLine } from './posting.service';

/**
 * نگاشت رویداد کسب‌وکار به اقلام سند
 *
 * همهٔ قاعده‌های «چه چیزی بدهکار، چه چیزی بستانکار» اینجا جمع‌اند تا در
 * سرویس‌های عملیاتی پخش نشوند.  توابع خالص‌اند: نه به دیتابیس دست می‌زنند نه
 * به تراکنش، بنابراین بدون زیرساخت قابل تست‌اند.
 *
 * کدها با کدینگ حساب `seed.ts` یکی است؛ تغییرشان بدون به‌روزرسانی آنجا، ثبت
 * خودکار را می‌شکند.
 */
export const ACCOUNTS = {
  cash: '1101',
  bank: '1102',
  receivable: '1103',
  inventory: '1104',
  chequeReceivable: '1105',
  inputVat: '1106',
  payable: '2101',
  outputVat: '2103',
  salesRevenue: '4101',
  salesDiscount: '4102',
  otherRevenue: '4104',
  cogs: '5101',
  otherExpense: '5299',
  fixedAsset: '1201',
  accumulatedDepreciation: '1202',
  depreciationExpense: '5205',
  assetDisposal: '4105',
  capital: '3101',
  retainedEarnings: '3102',
  commissionExpense: '5206',
  commissionPayable: '2106',
  salaryPayable: '2104',
  insurancePayable: '2105',
  salaryExpense: '5201',
  freightExpense: '5204',
  freightRevenue: '4106',
  freightPayable: '2107',
} as const;

/** روش پرداخت را به حسابی که پول در آن می‌نشیند نگاشت می‌کند. */
export function accountForMethod(method: string): string {
  switch (method) {
    case 'CASH':
      return ACCOUNTS.cash;
    case 'CARD':
    case 'POS':
    case 'BANK_TRANSFER':
    case 'ONLINE':
      return ACCOUNTS.bank;
    case 'CHEQUE':
      return ACCOUNTS.chequeReceivable;
    case 'CREDIT':
      // نسیه: طلب از مشتری، نه وجه دریافتی.
      return ACCOUNTS.receivable;
    default:
      // روش ناشناخته مثل نسیه رفتار می‌کند تا مبلغ گم نشود
      return ACCOUNTS.receivable;
  }
}

/** یک قلم را به فهرست می‌افزاید، مگر آنکه مبلغش صفر باشد. */
function push(lines: PostingLine[], line: PostingLine): void {
  const amount = Number(line.debit ?? 0) + Number(line.credit ?? 0);
  if (Math.abs(amount) > 0.004) lines.push(line);
}

export type SaleTender = { method: string; amount: number };

/**
 * سند فروش
 *
 *   بدهکار: صندوق / بانک / حساب دریافتنی  ← به اندازهٔ مبلغ فاکتور
 *   بستانکار: فروش کالا (خالص از تخفیف) + مالیات بر ارزش افزوده
 *
 * تخفیف به‌جای کم کردن از درآمد، در حساب کاهندهٔ «تخفیفات فروش» بدهکار
 * می‌شود تا فروش ناخالص در گزارش دیده شود.
 */
export function saleEntry(input: {
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  tenders: SaleTender[];
  rationAmount?: number;
  /** کرایهٔ حمل و بسته‌بندی که به خریدار بسته شده */
  additions?: number;
  /** کسر توافقی و گرد کردن مبلغ */
  deductions?: number;
}): PostingLine[] {
  const lines: PostingLine[] = [];

  // سمت دریافت
  for (const tender of input.tenders) {
    push(lines, {
      accountCode: accountForMethod(tender.method),
      debit: Number(tender.amount),
      description: `دریافت ${tender.method}`,
    });
  }

  // سهم کالابرگ از دولت طلب است، نه وجه نقد
  const ration = Number(input.rationAmount ?? 0);
  push(lines, {
    accountCode: ACCOUNTS.receivable,
    debit: ration,
    description: 'مطالبات کالابرگ',
  });

  // مانده‌ای که پرداخت نشده، نسیه است
  const collected =
    input.tenders.reduce((sum, tender) => sum + Number(tender.amount), 0) + ration;
  push(lines, {
    accountCode: ACCOUNTS.receivable,
    debit: Number(input.total) - collected,
    description: 'مانده نسیه',
  });

  // سمت درآمد
  push(lines, {
    accountCode: ACCOUNTS.salesDiscount,
    debit: Number(input.discount),
    description: 'تخفیف فروش',
  });
  push(lines, {
    accountCode: ACCOUNTS.salesRevenue,
    credit: Number(input.subtotal),
    description: 'فروش کالا',
  });
  push(lines, {
    accountCode: ACCOUNTS.outputVat,
    credit: Number(input.tax),
    description: 'مالیات بر ارزش افزوده',
  });

  // اضافات درآمدِ حمل است، نه فروش کالا.  اگر به حساب فروش بنشیند، هم
  // سود ناخالص را بالا نشان می‌دهد (چون بهای تمام‌شده‌اش آنجا نیست) و
  // هم مبلغ فروشِ گزارش با صورتحساب مالیاتی نمی‌خواند.
  push(lines, {
    accountCode: ACCOUNTS.freightRevenue,
    credit: Number(input.additions ?? 0),
    description: 'اضافات فاکتور',
  });

  // کسورات کاهش مبلغ است ولی تخفیف فروش نیست؛ حساب جدا نگه داشته
  // می‌شود تا گزارش تخفیف با گرد کردن مبلغ آلوده نشود.
  push(lines, {
    accountCode: ACCOUNTS.otherExpense,
    debit: Number(input.deductions ?? 0),
    description: 'کسورات فاکتور',
  });

  return lines;
}

/**
 * سند بهای تمام‌شدهٔ کالای فروش‌رفته
 *
 *   بدهکار: بهای تمام‌شده
 *   بستانکار: موجودی کالا
 *
 * جدا از سند فروش صادر می‌شود چون ماهیتش متفاوت است و در گزارش‌ها باید
 * مستقل دیده شود.
 */
export function cogsEntry(cost: number): PostingLine[] {
  if (Math.abs(cost) < 0.005) return [];

  return [
    { accountCode: ACCOUNTS.cogs, debit: cost, description: 'بهای تمام‌شدهٔ کالای فروش‌رفته' },
    { accountCode: ACCOUNTS.inventory, credit: cost, description: 'کاهش موجودی کالا' },
  ];
}

/**
 * سند دریافت کالای خرید
 *
 *   بدهکار: موجودی کالا + مالیات خرید
 *   بستانکار: حساب‌های پرداختنی
 *
 * سند در لحظهٔ **دریافت** صادر می‌شود، نه ثبت سفارش؛ تا آن لحظه هنوز نه
 * کالایی رسیده و نه بدهی قطعی شده است.
 */
export function purchaseEntry(input: {
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
}): PostingLine[] {
  const lines: PostingLine[] = [];

  push(lines, {
    accountCode: ACCOUNTS.inventory,
    debit: Number(input.subtotal) - Number(input.discount),
    description: 'ورود کالا به انبار',
  });
  push(lines, {
    accountCode: ACCOUNTS.inputVat,
    debit: Number(input.tax),
    description: 'مالیات خرید',
  });
  push(lines, {
    accountCode: ACCOUNTS.payable,
    credit: Number(input.total),
    description: 'بدهی به تأمین‌کننده',
  });

  return lines;
}

/**
 * سند هزینه
 *
 *   بدهکار: حساب هزینه
 *   بستانکار: صندوق (پرداخت‌شده) یا حساب‌های پرداختنی (پرداخت‌نشده)
 */
export function expenseEntry(input: {
  amount: number;
  paid: boolean;
  accountCode?: string;
}): PostingLine[] {
  const amount = Number(input.amount);
  if (Math.abs(amount) < 0.005) return [];

  return [
    {
      accountCode: input.accountCode ?? ACCOUNTS.otherExpense,
      debit: amount,
      description: 'هزینه',
    },
    {
      accountCode: input.paid ? ACCOUNTS.cash : ACCOUNTS.payable,
      credit: amount,
      description: input.paid ? 'پرداخت نقدی' : 'بدهی',
    },
  ];
}

/**
 * سند دریافت وجه زیرسیستم‌های غیرفروشی (عوارض، جواز، پارکینگ و ...)
 *
 *   بدهکار: صندوق یا بانک
 *   بستانکار: سایر درآمدها
 */
/**
 * وصول طلب از مشتری — قسط یا تسویهٔ نسیه.
 *
 * با `receiptEntry` فرق دارد و این تفاوت مهم است: آن یکی درآمد ثبت
 * می‌کند، این یکی **طلبِ قبلاً ثبت‌شده** را تسویه می‌کند.  اگر وصول
 * قسط به درآمد بنشیند، همان فروش دو بار درآمد حساب می‌شود — یک بار
 * موقع صدور فاکتور و یک بار موقع وصول.
 */
export function collectionEntry(input: {
  amount: number;
  method: string;
  description?: string;
}): PostingLine[] {
  const amount = Number(input.amount);
  if (Math.abs(amount) < 0.005) return [];

  return [
    {
      accountCode: accountForMethod(input.method ?? 'CASH'),
      debit: amount,
      description: input.description ?? 'وصول از مشتری',
    },
    {
      // طلب کم می‌شود، نه اینکه درآمد اضافه شود.
      accountCode: ACCOUNTS.receivable,
      credit: amount,
      description: input.description ?? 'تسویهٔ مطالبات',
    },
  ];
}

export function receiptEntry(input: {
  amount: number;
  toCashBox: boolean;
  description?: string;
}): PostingLine[] {
  const amount = Number(input.amount);
  if (Math.abs(amount) < 0.005) return [];

  return [
    {
      accountCode: input.toCashBox ? ACCOUNTS.cash : ACCOUNTS.bank,
      debit: amount,
      description: input.description ?? 'دریافت وجه',
    },
    {
      accountCode: ACCOUNTS.otherRevenue,
      credit: amount,
      description: input.description ?? 'درآمد',
    },
  ];
}

/**
 * برگشت از فروش — معکوس فروش، ولی نه با «سند معکوس».
 *
 * برای برگشتِ *کامل* می‌شد سند اصلی را معکوس کرد، اما مرجوعی معمولاً جزئی
 * است: از ده قلم، دو قلم برمی‌گردد.  پس سند مستقلی زده می‌شود که فقط سهم
 * برگشتی را خنثی می‌کند.
 *
 * برگشت فروش، درآمد را کم می‌کند و پول (یا بدهی مشتری) را برمی‌گرداند.
 */
export function salesReturnEntry(input: {
  subtotal: number;
  tax: number;
  total: number;
  /** CASH | CARD | CREDIT — به کدام حساب برگردانده می‌شود */
  refundMethod: string;
}): PostingLine[] {
  const lines: PostingLine[] = [];

  // درآمد فروش برمی‌گردد (بدهکار = کاهش درآمد)
  push(lines, {
    accountCode: ACCOUNTS.salesRevenue,
    debit: Number(input.subtotal),
    description: 'برگشت از فروش',
  });

  push(lines, {
    accountCode: ACCOUNTS.outputVat,
    debit: Number(input.tax),
    description: 'برگشت مالیات فروش',
  });

  // سمت پرداخت: نقد/کارت از حساب خودش می‌رود؛ «CREDIT» یعنی به‌جای پول،
  // بدهی مشتری کم می‌شود.
  push(lines, {
    accountCode:
      input.refundMethod === 'CREDIT'
        ? ACCOUNTS.receivable
        : accountForMethod(input.refundMethod),
    credit: Number(input.total),
    description: `عودت وجه ${input.refundMethod}`,
  });

  return lines;
}

/** بهای تمام‌شدهٔ کالای مرجوعی: کالا به انبار برمی‌گردد، بهای فروش کم می‌شود. */
export function returnCogsEntry(cost: number): PostingLine[] {
  const lines: PostingLine[] = [];

  push(lines, {
    accountCode: ACCOUNTS.inventory,
    debit: Number(cost),
    description: 'بازگشت کالا به انبار',
  });

  push(lines, {
    accountCode: ACCOUNTS.cogs,
    credit: Number(cost),
    description: 'برگشت بهای تمام‌شده',
  });

  return lines;
}

/**
 * برگشت از خرید — کالا به تأمین‌کننده برمی‌گردد.
 * موجودی کم می‌شود و بدهی به تأمین‌کننده (یا طلب از او) تسویه می‌شود.
 */
export function purchaseReturnEntry(input: {
  subtotal: number;
  tax: number;
  total: number;
}): PostingLine[] {
  const lines: PostingLine[] = [];

  push(lines, {
    accountCode: ACCOUNTS.payable,
    debit: Number(input.total),
    description: 'برگشت از خرید — تسویه با تأمین‌کننده',
  });

  push(lines, {
    accountCode: ACCOUNTS.inventory,
    credit: Number(input.subtotal),
    description: 'خروج کالای مرجوعی از انبار',
  });

  push(lines, {
    accountCode: ACCOUNTS.inputVat,
    credit: Number(input.tax),
    description: 'برگشت مالیات خرید',
  });

  return lines;
}

/**
 * خریدِ دارایی ثابت: دارایی بدهکار، منبعِ پرداخت بستانکار.
 *
 * ⚠️ این قاعده **وجود نداشت** و نبودنش دفتر کل را غلط می‌کرد.
 *
 *    `AssetDisposal` و `AssetDepreciation` هر دو سند می‌زدند، ولی
 *    ثبتِ خودِ دارایی هیچ سندی نمی‌زد.  نتیجه در تراز آزمایشی دیده
 *    شد: حساب ۱۲۰۱ «اموال و تجهیزات» — که یک **دارایی** است —
 *    ماندهٔ **بستانکار** داشت.
 *
 *    یعنی دفاتر می‌گفتند دارایی‌هایی واگذار شده‌اند که هرگز خریداری
 *    نشده بودند.  ترازنامه هم به همان اندازه کم‌ارزش می‌شد.
 *
 *    هیچ آزمونی این را نمی‌گرفت چون تراز **صفر** می‌ماند: هر دو طرفِ
 *    سندِ واگذاری درست بودند؛ چیزی که کم بود، سندِ **قبلی** بود.
 */
export function assetAcquisitionEntry(input: {
  cost: number;
  /** نقد، بانک، یا نسیه.  پیش‌فرض نقد. */
  method?: string;
}): PostingLine[] {
  const lines: PostingLine[] = [];
  const cost = Number(input.cost);

  push(lines, {
    accountCode: ACCOUNTS.fixedAsset,
    debit: cost,
    description: 'خرید دارایی ثابت',
  });

  // ⚠️ منبعِ پرداخت از همان تابعی می‌آید که بقیهٔ ماژول‌ها استفاده
  //    می‌کنند.  نوشتنِ «۱۱۰۱» دستی یعنی روزی که کدینگ عوض شود،
  //    اینجا عقب می‌ماند.
  push(lines, {
    accountCode: accountForMethod(input.method ?? 'CASH'),
    credit: cost,
    description: 'پرداخت بابت خرید دارایی',
  });

  return lines;
}


/**
 * واریز یا برداشتِ صندوق.
 *
 * ⚠️ تا امروز این رویداد **اصلاً سند نمی‌خورد**.
 *
 *    موجودیِ صندوق عوض می‌شد و حسابِ ۱۱۰۱ دست‌نخورده می‌ماند.  و
 *    هیچ آزمونی نمی‌گرفتش، چون تراز آزمایشی **صفر می‌ماند**: وقتی
 *    سندی زده نمی‌شود، چیزی هم نامتراز نمی‌شود.  دقیقاً همان خانواده
 *    از اشکال که «خریدِ دارایی» داشت.
 *
 * ⚠️ طرفِ دوم از «بابت» می‌آید، نه از حدس.
 *
 *    واریزِ مالک، انتقال از بانک، و اصلاحِ شمارش سه سندِ کاملاً
 *    متفاوت‌اند.  یکی گرفتنشان یعنی دفتری که عددهایش تراز است و
 *    معنایش غلط — و آن بدتر از نامتراز بودن است، چون کسی شک نمی‌کند.
 */
export function cashBoxMovementEntry(input: {
  amount: number;
  /** DEPOSIT یا WITHDRAW */
  type: string;
  /** OWNER | BANK | ADJUST | OTHER */
  reason: string;
}): PostingLine[] {
  const lines: PostingLine[] = [];
  const amount = Number(input.amount);
  const isDeposit = input.type === 'DEPOSIT';

  // طرفِ دومِ سند بر اساسِ بابت.
  //
  //   OWNER  — واریز/برداشتِ مالک ⇒ سرمایه
  //   BANK   — جابه‌جایی با بانک ⇒ حسابِ بانک
  //   ADJUST — اصلاحِ شمارش ⇒ هزینه/درآمدِ متفرقه (کسری یا اضافیِ صندوق)
  //   OTHER  — سایر
  const counter =
    input.reason === 'BANK'
      ? ACCOUNTS.bank
      : input.reason === 'OWNER'
        ? ACCOUNTS.capital
        : isDeposit
          ? ACCOUNTS.otherRevenue
          : ACCOUNTS.otherExpense;

  const label = isDeposit ? 'واریز به صندوق' : 'برداشت از صندوق';

  push(lines, {
    accountCode: ACCOUNTS.cash,
    debit: isDeposit ? amount : 0,
    credit: isDeposit ? 0 : amount,
    description: label,
  });

  push(lines, {
    accountCode: counter,
    debit: isDeposit ? 0 : amount,
    credit: isDeposit ? amount : 0,
    description: label,
  });

  return lines;
}


/**
 * واریز یا برداشتِ حسابِ خزانه.
 *
 * ⚠️ مثل صندوق، این رویداد هم **اصلاً سند نمی‌خورد**.
 *
 *    `TreasuryAccount.balance` عوض می‌شد و دفترکل خبر نداشت.  خزانه
 *    دستِ‌کم سطرِ `TreasuryTransaction` داشت — یعنی ردِ حسابرسی بود و
 *    فقط دفتر عقب می‌ماند؛ صندوق حتی آن را هم نداشت.
 *
 * ⚠️ سمتِ خزانه از **نوعِ حساب** می‌آید، نه از حدس.
 *
 *    حسابِ بانکی به ۱۱۰۲ می‌نشیند و حسابِ نقدی/تنخواه به ۱۱۰۱.  یکی
 *    گرفتنشان یعنی موجودیِ بانک و نقد در گزارش قاطی شود — عددِ جمع
 *    درست می‌ماند و تفکیک غلط، که کسی متوجهش نمی‌شود.
 *
 * ⚠️ انتقالِ بین دو حسابِ خزانه عمداً سند نمی‌خورد.
 *
 *    اثرِ خالصش روی دفتر صفر است وقتی هر دو حساب به یک حسابِ کل
 *    می‌نشینند.  سند زدنش فقط دفتر را شلوغ می‌کند.
 */
export function treasuryMovementEntry(input: {
  amount: number;
  /** DEPOSIT یا WITHDRAWAL */
  type: string;
  /** OWNER | BANK | ADJUST | OTHER */
  reason: string;
  /** BANK | CASH | FUND */
  accountType?: string;
}): PostingLine[] {
  const lines: PostingLine[] = [];
  const amount = Number(input.amount);
  const isDeposit = input.type === 'DEPOSIT';

  const side =
    (input.accountType ?? 'BANK') === 'BANK' ? ACCOUNTS.bank : ACCOUNTS.cash;

  const counter =
    input.reason === 'BANK'
      ? ACCOUNTS.bank
      : input.reason === 'OWNER'
        ? ACCOUNTS.capital
        : isDeposit
          ? ACCOUNTS.otherRevenue
          : ACCOUNTS.otherExpense;

  const label = isDeposit ? 'واریز به خزانه' : 'برداشت از خزانه';

  push(lines, {
    accountCode: side,
    debit: isDeposit ? amount : 0,
    credit: isDeposit ? 0 : amount,
    description: label,
  });

  push(lines, {
    accountCode: counter,
    debit: isDeposit ? 0 : amount,
    credit: isDeposit ? amount : 0,
    description: label,
  });

  return lines;
}

/** هزینهٔ استهلاک دوره: هزینه بدهکار، استهلاک انباشته بستانکار. */
export function depreciationEntry(amount: number): PostingLine[] {
  const lines: PostingLine[] = [];

  push(lines, {
    accountCode: ACCOUNTS.depreciationExpense,
    debit: Number(amount),
    description: 'هزینهٔ استهلاک دوره',
  });

  // استهلاک انباشته حساب «کاهنده دارایی» است: زیر دارایی می‌نشیند و
  // بستانکار می‌شود، پس بهای تمام‌شدهٔ دارایی دست‌نخورده می‌ماند و در
  // ترازنامه هر دو رقم دیده می‌شوند.
  push(lines, {
    accountCode: ACCOUNTS.accumulatedDepreciation,
    credit: Number(amount),
    description: 'استهلاک انباشته',
  });

  return lines;
}

/**
 * واگذاری دارایی: بهای تمام‌شده و استهلاک انباشته از دفاتر خارج می‌شوند و
 * اختلاف با مبلغ دریافتی، سود یا زیان واگذاری است.
 */
export function assetDisposalEntry(input: {
  cost: number;
  accumulated: number;
  proceeds: number;
}): PostingLine[] {
  const lines: PostingLine[] = [];
  const bookValue = Number(input.cost) - Number(input.accumulated);
  const gain = Number(input.proceeds) - bookValue;

  push(lines, {
    accountCode: ACCOUNTS.accumulatedDepreciation,
    debit: Number(input.accumulated),
    description: 'حذف استهلاک انباشته',
  });

  push(lines, {
    accountCode: ACCOUNTS.cash,
    debit: Number(input.proceeds),
    description: 'وجه حاصل از واگذاری',
  });

  push(lines, {
    accountCode: ACCOUNTS.fixedAsset,
    credit: Number(input.cost),
    description: 'حذف بهای تمام‌شدهٔ دارایی',
  });

  // سود بستانکار، زیان بدهکار — با یک حساب واحد تا گزارش واگذاری یکجا باشد.
  if (gain >= 0) {
    push(lines, {
      accountCode: ACCOUNTS.assetDisposal,
      credit: gain,
      description: 'سود واگذاری دارایی',
    });
  } else {
    push(lines, {
      accountCode: ACCOUNTS.assetDisposal,
      debit: -gain,
      description: 'زیان واگذاری دارایی',
    });
  }

  return lines;
}

/**
 * کمیسیون فروش دوره: هزینه شناسایی می‌شود و بدهی به ویزیتور ثبت می‌شود.
 * پرداخت واقعی بعداً از خزانه انجام و همان بدهی تسویه می‌شود.
 */
export function agentCommissionEntry(amount: number): PostingLine[] {
  const lines: PostingLine[] = [];

  push(lines, {
    accountCode: ACCOUNTS.commissionExpense,
    debit: Number(amount),
    description: 'هزینهٔ کمیسیون فروش',
  });

  push(lines, {
    accountCode: ACCOUNTS.commissionPayable,
    credit: Number(amount),
    description: 'کمیسیون پرداختنی',
  });

  return lines;
}

/**
 * فیش حقوق: هزینهٔ ناخالص شناسایی می‌شود و کسورات به‌عنوان بدهی به سازمان
 * بیمه و دارایی می‌نشیند؛ خالص پرداختی بدهی به کارمند است.
 *
 * ثبت در لحظهٔ **تأیید** فیش انجام می‌شود، نه پرداخت: تعهد از همان لحظه
 * وجود دارد و اگر تا پایان ماه پرداخت نشود، باید در ترازنامه دیده شود.
 */
export function payrollEntry(input: {
  gross: number;
  insurance: number;
  tax: number;
  netPay: number;
}): PostingLine[] {
  const lines: PostingLine[] = [];

  push(lines, {
    accountCode: ACCOUNTS.salaryExpense,
    debit: Number(input.gross),
    description: 'هزینهٔ حقوق و دستمزد',
  });

  push(lines, {
    accountCode: ACCOUNTS.insurancePayable,
    credit: Number(input.insurance),
    description: 'بیمهٔ پرداختنی',
  });

  // مالیات حقوق هم بدهی به دولت است و در همان حساب مالیات می‌نشیند.
  push(lines, {
    accountCode: ACCOUNTS.outputVat,
    credit: Number(input.tax),
    description: 'مالیات حقوق پرداختنی',
  });

  push(lines, {
    accountCode: ACCOUNTS.salaryPayable,
    credit: Number(input.netPay),
    description: 'حقوق پرداختنی',
  });

  return lines;
}

/** پرداخت فیش: بدهی به کارمند تسویه و پول از صندوق یا بانک خارج می‌شود. */
export function payrollPaymentEntry(input: {
  netPay: number;
  method: string;
}): PostingLine[] {
  const lines: PostingLine[] = [];

  push(lines, {
    accountCode: ACCOUNTS.salaryPayable,
    debit: Number(input.netPay),
    description: 'تسویهٔ حقوق پرداختنی',
  });

  push(lines, {
    accountCode: accountForMethod(input.method),
    credit: Number(input.netPay),
    description: 'پرداخت حقوق',
  });

  return lines;
}

/**
 * کرایهٔ حمل ورودی که روی بهای کالا سرشکن می‌شود.
 *
 * موجودی بدهکار می‌شود (نه هزینه) چون کرایه بخشی از بهای تمام‌شدهٔ رسیده
 * است.  اگر هزینه شود، بهای موجودی کمتر از واقع می‌ماند و سود ناخالص بیش
 * از واقع گزارش می‌شود — و در ماه فروش، ناگهان افت می‌کند.
 */
export function inboundFreightEntry(input: {
  amount: number;
  capitalize: boolean;
  paid: boolean;
}): PostingLine[] {
  const lines: PostingLine[] = [];

  push(lines, {
    accountCode: input.capitalize ? ACCOUNTS.inventory : ACCOUNTS.freightExpense,
    debit: Number(input.amount),
    description: input.capitalize
      ? 'کرایه حمل — سرشکن بر بهای کالا'
      : 'هزینهٔ کرایه حمل خرید',
  });

  push(lines, {
    accountCode: input.paid ? ACCOUNTS.cash : ACCOUNTS.freightPayable,
    credit: Number(input.amount),
    description: 'کرایه حمل',
  });

  return lines;
}

/**
 * کرایهٔ حمل خروجی.
 *
 * دو سمت مستقل دارد و عمداً در یک سند می‌آیند: آنچه از مشتری گرفته می‌شود
 * درآمد است و آنچه به باربری داده می‌شود هزینه.  جدا نگه داشتنشان تنها راه
 * فهمیدن این است که توزیع سودده است یا زیان‌ده.
 */
export function outboundFreightEntry(input: {
  /** مبلغ دریافتی از مشتری */
  charge: number;
  /** هزینهٔ پرداختی به باربری */
  cost: number;
  /** آیا وجه باربری همان لحظه نقداً پرداخت شده */
  paid: boolean;
}): PostingLine[] {
  const lines: PostingLine[] = [];

  // سمت درآمد: مشتری بدهکار یا وجه نقد دریافت شده
  push(lines, {
    accountCode: ACCOUNTS.receivable,
    debit: Number(input.charge),
    description: 'کرایه حمل دریافتنی از مشتری',
  });

  push(lines, {
    accountCode: ACCOUNTS.freightRevenue,
    credit: Number(input.charge),
    description: 'درآمد حمل و نقل',
  });

  // سمت هزینه: پرداخت به باربری
  push(lines, {
    accountCode: ACCOUNTS.freightExpense,
    debit: Number(input.cost),
    description: 'هزینهٔ کرایه حمل',
  });

  push(lines, {
    accountCode: input.paid ? ACCOUNTS.cash : ACCOUNTS.freightPayable,
    credit: Number(input.cost),
    description: 'پرداخت به باربری',
  });

  return lines;
}

/**
 * سرشکن کرایه بر اقلام، به نسبت ارزش هر قلم.
 *
 * به نسبت **ارزش** است نه تعداد یا وزن: کالای گران‌تر معمولاً بیمه و
 * مسئولیت بیشتری در حمل دارد، و تقسیم بر تعداد باعث می‌شود یک قلم ارزان
 * پرتعداد، بیشتر کرایه بگیرد.
 *
 * تابع خالص است تا بدون دیتابیس آزموده شود.  آخرین قلم باقی‌مانده را
 * می‌گیرد تا مجموع سهم‌ها دقیقاً برابر کرایه بماند و ریالی گم نشود.
 */
export function allocateFreight(
  items: Array<{ total: number }>,
  freight: number,
): number[] {
  const amount = Number(freight);
  if (!items.length || amount <= 0) return items.map(() => 0);

  const base = items.reduce((sum, item) => sum + Number(item.total), 0);

  // اگر ارزش کل صفر باشد (کالای رایگان)، مساوی تقسیم می‌شود.
  if (base <= 0) {
    const share = Math.round((amount / items.length) * 100) / 100;
    const shares = items.map(() => share);
    shares[shares.length - 1] = Math.round((amount - share * (items.length - 1)) * 100) / 100;
    return shares;
  }

  const shares = items.map(
    (item) => Math.round(((Number(item.total) / base) * amount) * 100) / 100,
  );

  const assigned = shares.slice(0, -1).reduce((sum, value) => sum + value, 0);
  shares[shares.length - 1] = Math.round((amount - assigned) * 100) / 100;

  return shares;
}

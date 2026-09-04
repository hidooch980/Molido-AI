/**
 * مقایسهٔ پیشنهاد تأمین‌کننده‌ها — عمداً خالص و بدون دیتابیس.
 *
 * انتخاب اشتباه اینجا مستقیم پول است، و اشتباهش دیده نمی‌شود: کسی
 * فاکتور خرید را با استعلام‌های آن روز مقایسه نمی‌کند.  پس قاعده باید
 * صریح و آزمون‌پذیر باشد، نه پخش‌شده در چند کوئری.
 */

export type Quote = {
  callId: string;
  supplierId: string;
  supplierName: string;
  productId: string;
  unitPrice: number;
  /** موجودی تأمین‌کننده؛ `null` یعنی نگفته */
  availableQty: number | null;
  /** روز تا تحویل؛ `null` یعنی نگفته */
  leadDays: number | null;
};

export type NeedLine = {
  productId: string;
  productName: string;
  qty: number;
  /** آخرین قیمت خرید — برای سنجش گران/ارزان بودن پیشنهاد */
  lastPrice: number | null;
};

export type Winner = {
  productId: string;
  productName: string;
  qty: number;
  /** پیشنهاد برنده، یا `null` اگر هیچ‌کس قیمت نداده */
  quote: Quote | null;
  /** چند نفر برای این قلم قیمت دادند */
  quoteCount: number;
  /** درصد تفاوت با آخرین خرید؛ مثبت یعنی گران‌تر */
  changePercent: number | null;
  /** کمبود موجودی تأمین‌کننده نسبت به نیاز */
  shortBy: number;
  reason: string;
};

/** ریال کسری ندارد. */
function rial(value: number): number {
  return Math.round(value);
}

/**
 * آیا این پیشنهاد از آن یکی بهتر است؟
 *
 * ترتیب اهمیت عمدی است:
 *   ۱. کسی که کل نیاز را دارد بر کسی که نصفش را دارد مقدم است — خرید
 *      از دو جا یعنی دو کرایهٔ حمل و دو فاکتور.
 *   ۲. بعد قیمت.
 *   ۳. در قیمت برابر، تحویل زودتر.
 *
 * `null` در موجودی یعنی «نگفته»، که بدبینانه «کافی است» فرض می‌شود:
 * تأمین‌کننده‌ای که موجودی نگفته معمولاً دارد؛ اگر نداشت، هنگام سفارش
 * معلوم می‌شود و آن‌وقت هزینه‌اش فقط یک تماس دیگر است.
 */
function isBetter(candidate: Quote, current: Quote, needQty: number): boolean {
  const covers = (q: Quote) => q.availableQty === null || q.availableQty >= needQty;

  const candidateCovers = covers(candidate);
  const currentCovers = covers(current);
  if (candidateCovers !== currentCovers) return candidateCovers;

  if (candidate.unitPrice !== current.unitPrice) {
    return candidate.unitPrice < current.unitPrice;
  }

  const candidateLead = candidate.leadDays ?? Number.MAX_SAFE_INTEGER;
  const currentLead = current.leadDays ?? Number.MAX_SAFE_INTEGER;
  return candidateLead < currentLead;
}

/**
 * برندهٔ هر قلم را انتخاب می‌کند.
 *
 * قلمی که هیچ پیشنهادی ندارد **حذف نمی‌شود** — با `quote: null` و
 * دلیلش برمی‌گردد.  حذف بی‌صدا یعنی خریدار فکر می‌کند همه‌چیز سفارش
 * شده، و هفتهٔ بعد قفسه خالی است.
 */
export function pickWinners(needs: NeedLine[], quotes: Quote[]): Winner[] {
  return needs.map((need) => {
    const forProduct = quotes.filter((q) => q.productId === need.productId);

    if (!forProduct.length) {
      return {
        productId: need.productId,
        productName: need.productName,
        qty: need.qty,
        quote: null,
        quoteCount: 0,
        changePercent: null,
        shortBy: need.qty,
        reason: 'هیچ تأمین‌کننده‌ای برای این قلم قیمت نداد',
      };
    }

    let best = forProduct[0];
    for (const candidate of forProduct.slice(1)) {
      if (isBetter(candidate, best, need.qty)) best = candidate;
    }

    const changePercent =
      need.lastPrice && need.lastPrice > 0
        ? Math.round(((best.unitPrice - need.lastPrice) / need.lastPrice) * 1000) / 10
        : null;

    const shortBy =
      best.availableQty !== null && best.availableQty < need.qty
        ? Math.round((need.qty - best.availableQty) * 1000) / 1000
        : 0;

    const parts: string[] = [`ارزان‌ترین از ${forProduct.length} پیشنهاد`];
    if (shortBy > 0) parts.push(`${shortBy} واحد کم دارد`);
    if (changePercent !== null && changePercent > 0) parts.push(`${changePercent}٪ گران‌تر از خرید قبل`);
    if (changePercent !== null && changePercent < 0) parts.push(`${Math.abs(changePercent)}٪ ارزان‌تر`);

    return {
      productId: need.productId,
      productName: need.productName,
      qty: need.qty,
      quote: best,
      quoteCount: forProduct.length,
      changePercent,
      shortBy,
      reason: parts.join(' · '),
    };
  });
}

export type Summary = {
  /** مبلغ کل خرید پیشنهادی */
  total: number;
  /** چند قلم پوشش داده شد */
  covered: number;
  /** چند قلم بی‌پیشنهاد ماند */
  uncovered: number;
  /** چند تأمین‌کنندهٔ متفاوت درگیر می‌شوند */
  supplierCount: number;
  /** اقلامی که از آخرین خرید بیش از این درصد گران‌ترند */
  expensive: Winner[];
};

/**
 * خلاصهٔ تصمیم — پیش از زدن دکمهٔ «سفارش بده».
 *
 * `alertPercent` آستانهٔ هشدار گرانی است.  پیش‌فرض ۱۵٪: کمتر از آن،
 * نوسان عادی بازار است و هشدارش فقط بی‌اعتبار می‌شود.
 */
export function summarize(winners: Winner[], alertPercent = 15): Summary {
  const chosen = winners.filter((w) => w.quote);

  return {
    total: rial(chosen.reduce((sum, w) => sum + w.quote!.unitPrice * w.qty, 0)),
    covered: chosen.length,
    uncovered: winners.length - chosen.length,
    supplierCount: new Set(chosen.map((w) => w.quote!.supplierId)).size,
    expensive: chosen.filter(
      (w) => w.changePercent !== null && w.changePercent >= alertPercent,
    ),
  };
}

/**
 * گروه‌بندی برندگان بر اساس تأمین‌کننده.
 *
 * هر تأمین‌کننده یک فاکتور خرید می‌شود: خرید از سه نفر یعنی سه فاکتور،
 * نه یک فاکتور با سه فروشنده.
 */
export function groupBySupplier(
  winners: Winner[],
): Array<{ supplierId: string; supplierName: string; lines: Winner[]; total: number }> {
  const groups = new Map<string, { supplierName: string; lines: Winner[] }>();

  for (const winner of winners) {
    if (!winner.quote) continue;

    const key = winner.quote.supplierId;
    const group = groups.get(key) ?? { supplierName: winner.quote.supplierName, lines: [] };
    group.lines.push(winner);
    groups.set(key, group);
  }

  return [...groups.entries()].map(([supplierId, group]) => ({
    supplierId,
    supplierName: group.supplierName,
    lines: group.lines,
    total: rial(group.lines.reduce((sum, w) => sum + w.quote!.unitPrice * w.qty, 0)),
  }));
}

// ---------------------------------------------------------- گزارش مدیر

export type Saving = {
  productId: string;
  productName: string;
  /** ارزان‌ترین قیمتی که گرفته شد */
  best: number;
  /** گران‌ترین قیمتی که گرفته شد */
  worst: number;
  /** چند بنکدار برای این قلم قیمت دادند */
  quoteCount: number;
  /** مبلغی که با انتخاب ارزان‌ترین صرفه‌جویی شد */
  saved: number;
};

export type Brief = {
  summary: Summary;
  /** قلم‌هایی که بیش از یک قیمت داشتند و انتخاب، پول نگه داشت */
  savings: Saving[];
  /** جمع صرفه‌جویی نسبت به گران‌ترین پیشنهادها */
  totalSaved: number;
  /** قلم‌هایی که هیچ‌کس قیمت نداد — تصمیمشان با مدیر است */
  missing: Winner[];
  /** قلم‌هایی که فقط یک بنکدار قیمت داد — مقایسه‌ای در کار نبوده */
  singleQuote: Winner[];
  /** متن کوتاه برای پیامک یا اعلان */
  message: string;
};

/**
 * صرفه‌جویی واقعی، نه ادعایی.
 *
 * ملاک، تفاوت ارزان‌ترین و **گران‌ترین** پیشنهادِ همین استعلام است —
 * نه تفاوت با قیمت قبلی.  دلیلش این است که قیمت قبلی مال بازارِ
 * دیگری بود؛ اگر ارز بالا رفته باشد، همهٔ پیشنهادها گران‌ترند و
 * «صرفه‌جویی منفی» گزارش کردن، عددِ بی‌معنی می‌سازد.
 *
 * آنچه مریم واقعاً کنترل می‌کند، انتخاب بین پیشنهادهای امروز است.
 * همان را گزارش می‌کنیم.
 */
export function savingsOf(needs: NeedLine[], quotes: Quote[]): Saving[] {
  return needs
    .map((need) => {
      const forProduct = quotes.filter((q) => q.productId === need.productId);
      if (forProduct.length < 2) return null;

      const prices = forProduct.map((q) => q.unitPrice);
      const best = Math.min(...prices);
      const worst = Math.max(...prices);

      return {
        productId: need.productId,
        productName: need.productName,
        best: rial(best),
        worst: rial(worst),
        quoteCount: forProduct.length,
        saved: rial((worst - best) * need.qty),
      };
    })
    .filter((s): s is Saving => s !== null && s.saved > 0)
    .sort((a, b) => b.saved - a.saved);
}

/** جداکنندهٔ هزارگان — عدد بلندِ بی‌جداکننده در پیامک خوانده نمی‌شود. */
function grouped(value: number): string {
  return value.toLocaleString('en-US').replace(/,/g, '٬');
}

/**
 * گزارش مریم به مدیر.
 *
 * مدیر وقت ندارد جدول بخواند.  چیزی که باید بداند سه چیز است: چقدر
 * پول، چقدر صرفه‌جویی، و کجا تصمیمش لازم است.
 *
 * قلم‌هایی که هیچ قیمتی نگرفتند و قلم‌هایی که فقط یک قیمت داشتند
 * جدا گزارش می‌شوند: اولی یعنی کسی موجودی ندارد، دومی یعنی مقایسه‌ای
 * در کار نبوده و آن قیمت ممکن است گران باشد بی‌آنکه معلوم شود.
 */
export function brief(
  needs: NeedLine[],
  quotes: Quote[],
  winners: Winner[],
  alertPercent = 15,
): Brief {
  const summary = summarize(winners, alertPercent);
  const savings = savingsOf(needs, quotes);
  const totalSaved = rial(savings.reduce((sum, s) => sum + s.saved, 0));

  const missing = winners.filter((w) => !w.quote);
  const singleQuote = winners.filter((w) => w.quote && w.quoteCount === 1);

  const parts: string[] = [
    `خرید پیشنهادی: ${grouped(summary.total)} ریال از ${summary.supplierCount} بنکدار`,
  ];

  if (totalSaved > 0) {
    parts.push(`صرفه‌جویی: ${grouped(totalSaved)} ریال`);
  }
  if (missing.length) {
    parts.push(`${missing.length} قلم بی‌قیمت ماند`);
  }
  if (singleQuote.length) {
    parts.push(`${singleQuote.length} قلم فقط یک قیمت داشت`);
  }
  if (summary.expensive.length) {
    parts.push(`${summary.expensive.length} قلم بیش از ${alertPercent}٪ گران شده`);
  }

  return {
    summary,
    savings,
    totalSaved,
    missing,
    singleQuote,
    message: parts.join(' · '),
  };
}

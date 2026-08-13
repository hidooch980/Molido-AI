/**
 * قواعد قیمت‌گذاری و تخفیف — توابع خالص.
 *
 * جدا از دیتابیس نگه داشته می‌شوند تا بدون بالا آوردن هیچ‌چیز آزموده شوند.
 * محاسبهٔ تخفیف جایی است که یک اشتباه کوچک مستقیم به پول تبدیل می‌شود، پس
 * باید بتوان ده‌ها حالت مرزی را ارزان آزمود.
 */

export type DiscountKind = 'PERCENT' | 'AMOUNT' | 'BUY_X_GET_Y';

export type DiscountRule = {
  id: string;
  name: string;
  kind: DiscountKind;
  value: number;
  minQty?: number | null;
  minAmount?: number | null;
  getQty?: number | null;
  productId?: string | null;
  categoryId?: string | null;
  priority?: number | null;
  startsAt?: Date | string | null;
  endsAt?: Date | string | null;
  isActive?: boolean;
  code?: string | null;
  maxUses?: number | null;
  usedCount?: number | null;
};

export type PriceTier = {
  price: number;
  minQty: number;
};

/**
 * قیمت یک قلم در یک سطح قیمت.
 *
 * پلکان‌ها بر اساس حداقل تعداد مرتب می‌شوند و **بزرگ‌ترین پلکانی که مقدار
 * از آن رد کرده** انتخاب می‌شود.  اگر کوچک‌ترین انتخاب می‌شد، خرید عمده
 * قیمت خرده‌فروشی می‌گرفت.
 */
export function tierPrice(
  tiers: PriceTier[],
  qty: number,
  fallback: number,
): number {
  const eligible = tiers
    .filter((tier) => qty >= Number(tier.minQty ?? 0))
    .sort((a, b) => Number(b.minQty ?? 0) - Number(a.minQty ?? 0));

  return eligible[0] ? Number(eligible[0].price) : Number(fallback);
}

/** آیا قاعده در این لحظه فعال است. */
export function isRuleActive(rule: DiscountRule, at: Date = new Date()): boolean {
  if (rule.isActive === false) return false;

  const starts = rule.startsAt ? new Date(rule.startsAt) : null;
  const ends = rule.endsAt ? new Date(rule.endsAt) : null;

  if (starts && at < starts) return false;
  if (ends && at > ends) return false;

  // سقف استفاده: کد تخفیفی که تمام شده نباید دوباره اعمال شود.
  //
  // صفر یعنی «بی‌نهایت»، نه «هیچ».  ستون در دیتابیس پیش‌فرض صفر دارد، پس
  // اگر صفر را سقف واقعی بگیریم، هر قاعده‌ای از لحظهٔ ساخت تمام‌شده حساب
  // می‌شود و هیچ تخفیفی هرگز اعمال نمی‌شود.
  const maxUses = Number(rule.maxUses ?? 0);

  if (maxUses > 0 && Number(rule.usedCount ?? 0) >= maxUses) {
    return false;
  }

  return true;
}

/** آیا قاعده به این قلم می‌خورد. */
export function ruleMatches(
  rule: DiscountRule,
  line: { productId: string; categoryId?: string | null; qty: number; unitPrice: number },
): boolean {
  // قاعدهٔ مخصوص یک کالا فقط به همان کالا؛ قاعدهٔ دسته به همهٔ کالاهای
  // آن دسته؛ قاعدهٔ بدون هیچ‌کدام، سراسری است.
  if (rule.productId && rule.productId !== line.productId) return false;
  if (rule.categoryId && rule.categoryId !== line.categoryId) return false;

  if (rule.minQty && line.qty < Number(rule.minQty)) return false;

  if (rule.minAmount && line.qty * line.unitPrice < Number(rule.minAmount)) {
    return false;
  }

  return true;
}

/**
 * مبلغ تخفیف یک قلم.
 *
 * `BUY_X_GET_Y`: به‌ازای هر `minQty` خرید، `getQty` قلم رایگان می‌شود.
 * مثال «۳ بخر ۱ ببر»: minQty=3، getQty=1 ⇒ در خرید ۸ تایی، دو قلم رایگان.
 * محاسبه بر اساس گروه‌های کامل است، نه نسبت — نیم گروه هدیه‌ای ندارد.
 */
export function lineDiscount(
  rule: DiscountRule,
  line: { qty: number; unitPrice: number },
): number {
  const gross = line.qty * line.unitPrice;

  switch (rule.kind) {
    case 'PERCENT':
      return round2((gross * Number(rule.value)) / 100);

    case 'AMOUNT':
      // تخفیف مبلغی به‌ازای هر قلم است، نه کل سطر: «۵۰۰۰ تومان تخفیف»
      // روی ده عدد یعنی ۵۰٬۰۰۰.  ولی هرگز از خود مبلغ سطر بیشتر نشود.
      return round2(Math.min(Number(rule.value) * line.qty, gross));

    case 'BUY_X_GET_Y': {
      const buy = Number(rule.minQty ?? 0);
      const free = Number(rule.getQty ?? 0);

      if (buy <= 0 || free <= 0) return 0;

      const groups = Math.floor(line.qty / (buy + free));
      return round2(groups * free * line.unitPrice);
    }

    default:
      return 0;
  }
}

/**
 * بهترین تخفیف برای یک قلم.
 *
 * تخفیف‌ها **جمع نمی‌شوند**: بهترین برنده است.  جمع کردنشان یعنی سه قاعدهٔ
 * ۴۰٪ کالا را رایگان می‌کند — که هیچ فروشگاهی نمی‌خواهد.  در تساوی، قاعدهٔ
 * با اولویت بالاتر انتخاب می‌شود.
 */
export function bestDiscount(
  rules: DiscountRule[],
  line: { productId: string; categoryId?: string | null; qty: number; unitPrice: number },
  at: Date = new Date(),
): { rule: DiscountRule; amount: number } | null {
  let best: { rule: DiscountRule; amount: number } | null = null;

  for (const rule of rules) {
    if (!isRuleActive(rule, at)) continue;
    if (!ruleMatches(rule, line)) continue;

    const amount = lineDiscount(rule, line);
    if (amount <= 0) continue;

    if (
      !best ||
      amount > best.amount ||
      (amount === best.amount &&
        Number(rule.priority ?? 0) > Number(best.rule.priority ?? 0))
    ) {
      best = { rule, amount };
    }
  }

  return best;
}

/** گرد کردن به دو رقم؛ ریال کسری در فاکتور معنا ندارد. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

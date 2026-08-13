import {
  bestDiscount,
  isRuleActive,
  lineDiscount,
  ruleMatches,
  tierPrice,
  type DiscountRule,
} from './pricing-rules';

const rule = (over: Partial<DiscountRule>): DiscountRule => ({
  id: 'r',
  name: 'r',
  kind: 'PERCENT',
  value: 10,
  isActive: true,
  ...over,
});

describe('پلکان قیمت', () => {
  const tiers = [
    { price: 100, minQty: 0 },
    { price: 90, minQty: 10 },
    { price: 80, minQty: 50 },
  ];

  it('بزرگ‌ترین پلکانِ رسیده را می‌گیرد', () => {
    expect(tierPrice(tiers, 1, 999)).toBe(100);
    expect(tierPrice(tiers, 10, 999)).toBe(90);
    expect(tierPrice(tiers, 49, 999)).toBe(90);
    expect(tierPrice(tiers, 50, 999)).toBe(80);
  });

  it('بدون پلکان به قیمت پایه برمی‌گردد', () => {
    expect(tierPrice([], 5, 777)).toBe(777);
  });
});

describe('محاسبهٔ تخفیف', () => {
  it('درصدی', () => {
    expect(lineDiscount(rule({ value: 10 }), { qty: 2, unitPrice: 1000 })).toBe(200);
  });

  it('مبلغی از کل سطر بیشتر نمی‌شود', () => {
    expect(
      lineDiscount(rule({ kind: 'AMOUNT', value: 5000 }), { qty: 2, unitPrice: 1000 }),
    ).toBe(2000);
  });

  it('بخر و ببر بر اساس گروه کامل', () => {
    const bxgy = rule({ kind: 'BUY_X_GET_Y', minQty: 3, getQty: 1, value: 0 });
    expect(lineDiscount(bxgy, { qty: 3, unitPrice: 100 })).toBe(0);
    expect(lineDiscount(bxgy, { qty: 4, unitPrice: 100 })).toBe(100);
    expect(lineDiscount(bxgy, { qty: 8, unitPrice: 100 })).toBe(200);
  });
});

describe('فعال بودن قاعده', () => {
  const now = new Date('2026-06-15');

  it('بازهٔ زمانی', () => {
    expect(isRuleActive(rule({ startsAt: '2026-07-01' }), now)).toBe(false);
    expect(isRuleActive(rule({ endsAt: '2026-06-01' }), now)).toBe(false);
    expect(
      isRuleActive(rule({ startsAt: '2026-06-01', endsAt: '2026-06-30' }), now),
    ).toBe(true);
  });

  // این حالت یک بار در عمل شکست: ستون maxUses در دیتابیس پیش‌فرض صفر دارد،
  // و کد آن را «سقف صفر» می‌خواند — پس هیچ تخفیفی هرگز اعمال نمی‌شد.
  it('سقف صفر یعنی بی‌نهایت، نه هیچ', () => {
    expect(isRuleActive(rule({ maxUses: 0, usedCount: 999 }), now)).toBe(true);
    expect(isRuleActive(rule({ maxUses: null }), now)).toBe(true);
    expect(isRuleActive(rule({ maxUses: 3, usedCount: 3 }), now)).toBe(false);
  });
});

describe('انتخاب بهترین تخفیف', () => {
  const line = { productId: 'p1', categoryId: 'c1', qty: 5, unitPrice: 1000 };

  it('بزرگ‌ترین را برمی‌دارد، نه جمعشان را', () => {
    const best = bestDiscount(
      [
        rule({ id: 'a', value: 10 }),
        rule({ id: 'b', value: 20 }),
        rule({ id: 'c', kind: 'AMOUNT', value: 50 }),
      ],
      line,
    );

    expect(best?.rule.id).toBe('b');
    expect(best?.amount).toBe(1000);
  });

  it('در تساوی، اولویت بالاتر', () => {
    const best = bestDiscount(
      [
        rule({ id: 'low', value: 10, priority: 1 }),
        rule({ id: 'high', value: 10, priority: 9 }),
      ],
      line,
    );

    expect(best?.rule.id).toBe('high');
  });

  it('قاعدهٔ نامرتبط اعمال نمی‌شود', () => {
    expect(bestDiscount([rule({ productId: 'other' })], line)).toBeNull();
    expect(ruleMatches(rule({ minQty: 10 }), line)).toBe(false);
  });
});

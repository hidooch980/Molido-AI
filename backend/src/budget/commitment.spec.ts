/**
 * حسابِ چرخهٔ اعتبار بودجه.
 *
 * ⚠️ چرا آزمونِ جدا برای چند خط حساب؟
 *
 *    اشتباهش خطا نمی‌دهد؛ فقط رقمی نشان می‌دهد که آزاد نیست.  مدیر
 *    آن را دوباره خرج می‌کند و کسی تا پایانِ سال نمی‌فهمد.  در دستگاه
 *    دولتی همین می‌شود تخلف.
 */

type Line = {
  amount: string;
  allocated: string | null;
  committed: string;
  spent: string | null;
};

/** همان منطقی که در `BudgetCommitmentService` است. */
const base = (l: Line) =>
  l.allocated !== null && l.allocated !== undefined
    ? Number(l.allocated)
    : Number(l.amount);

const available = (l: Line) =>
  base(l) - Number(l.committed ?? 0) - Number(l.spent ?? 0);

const line = (p: Partial<Line> = {}): Line => ({
  amount: '1000',
  allocated: null,
  committed: '0',
  spent: '0',
  ...p,
});

describe('مبنای اعتبار', () => {
  it('بدونِ تخصیص، مبنا مصوب است', () => {
    // تا خزانه پول را آزاد نکرده، مصوب موقتاً جایش می‌نشیند.
    expect(base(line({ amount: '1000' }))).toBe(1000);
  });

  it('با تخصیص، مبنا تخصیص است — حتی اگر کمتر باشد', () => {
    // ⚠️ مهم‌ترین قاعده.  مصوب یعنی «اجازه داده شده»، تخصیص یعنی «پول
    //    آزاد شده».  خرج کردن تا سقفِ مصوب وقتی تخصیص کمتر است، یعنی
    //    خرجِ پولی که نیامده.
    expect(base(line({ amount: '1000', allocated: '600' }))).toBe(600);
  });

  it('تخصیصِ صفر یعنی هیچ اعتباری آزاد نیست', () => {
    // صفر با تهی فرق دارد: تهی یعنی «هنوز نیامده»، صفر یعنی «آمد و
    // هیچ بود».
    expect(base(line({ amount: '1000', allocated: '0' }))).toBe(0);
  });
});

describe('اعتبارِ آزاد', () => {
  it('تعهد از اعتبارِ آزاد کم می‌کند، حتی پیش از خرج شدن', () => {
    // ⚠️ همان چیزی که کم بود: قراردادِ امضاشده پول را قفل می‌کند.
    expect(available(line({ amount: '1000', committed: '300' }))).toBe(700);
  });

  it('تعهد و هزینه هر دو کم می‌شوند', () => {
    expect(
      available(line({ amount: '1000', committed: '300', spent: '200' })),
    ).toBe(500);
  });

  it('اعتبارِ تمام‌شده صفر است، نه منفی', () => {
    expect(
      available(line({ amount: '1000', committed: '600', spent: '400' })),
    ).toBe(0);
  });

  it('تخصیصِ کمتر، اعتبارِ آزاد را کم می‌کند', () => {
    expect(
      available(line({ amount: '1000', allocated: '500', committed: '200' })),
    ).toBe(300);
  });
});

describe('قطعی کردنِ تعهد', () => {
  /** تعهد به‌اندازهٔ اولیه آزاد، هزینه به‌اندازهٔ قطعی ثبت. */
  const settle = (l: Line, committed: number, actual: number) => ({
    committed: Number(l.committed) - committed,
    spent: Number(l.spent ?? 0) + actual,
    released: committed - actual,
  });

  it('قطعیِ برابرِ تعهد، چیزی آزاد نمی‌کند', () => {
    const r = settle(line({ committed: '300' }), 300, 300);
    expect(r).toEqual({ committed: 0, spent: 300, released: 0 });
  });

  it('قطعیِ کمتر، مابه‌التفاوت را آزاد می‌کند', () => {
    // ⚠️ قراردادِ صد میلیونی که نود فاکتور خورد: ده میلیون باید به
    //    اعتبار برگردد، نه اینکه به‌عنوان هزینه بنشیند.
    const r = settle(line({ committed: '100' }), 100, 90);
    expect(r).toEqual({ committed: 0, spent: 90, released: 10 });
  });

  it('پس از قطعی، اعتبارِ آزاد درست می‌ماند', () => {
    const before = line({ amount: '1000', committed: '100' });
    const r = settle(before, 100, 90);
    const after = line({
      amount: '1000',
      committed: String(r.committed),
      spent: String(r.spent),
    });
    // ۱۰۰۰ − ۰ تعهد − ۹۰ هزینه = ۹۱۰
    expect(available(after)).toBe(910);
  });
});

describe('آزادسازی', () => {
  it('کلِ تعهد به اعتبار برمی‌گردد', () => {
    const before = line({ amount: '1000', committed: '250' });
    expect(available(before)).toBe(750);

    const after = line({ amount: '1000', committed: '0' });
    expect(available(after)).toBe(1000);
  });
});

describe('کنترلِ سقف', () => {
  const allows = (l: Line, request: number) => request <= available(l);

  it('درخواستِ برابرِ اعتبار پذیرفته می‌شود', () => {
    expect(allows(line({ amount: '1000' }), 1000)).toBe(true);
  });

  it('یک ریال بیشتر رد می‌شود', () => {
    // ⚠️ کنترل سخت است نه هشدار: هشدار را می‌شود نادیده گرفت و همیشه
    //    گرفته می‌شود.
    expect(allows(line({ amount: '1000' }), 1001)).toBe(false);
  });

  it('تعهدِ موجود سقف را پایین می‌آورد', () => {
    expect(allows(line({ amount: '1000', committed: '400' }), 700)).toBe(false);
    expect(allows(line({ amount: '1000', committed: '400' }), 600)).toBe(true);
  });
});

import {
  brief,
  groupBySupplier,
  pickWinners,
  savingsOf,
  summarize,
  type NeedLine,
  type Quote,
} from './quote-rules';

function need(over: Partial<NeedLine> = {}): NeedLine {
  return { productId: 'p1', productName: 'برنج', qty: 10, lastPrice: 100_000, ...over };
}

function quote(over: Partial<Quote> = {}): Quote {
  return {
    callId: 'c1',
    supplierId: 's1',
    supplierName: 'پخش الف',
    productId: 'p1',
    unitPrice: 100_000,
    availableQty: null,
    leadDays: null,
    ...over,
  };
}

describe('انتخاب برنده', () => {
  it('ارزان‌ترین را برمی‌دارد', () => {
    const winners = pickWinners(
      [need()],
      [
        quote({ supplierId: 's1', unitPrice: 120_000 }),
        quote({ callId: 'c2', supplierId: 's2', unitPrice: 90_000 }),
        quote({ callId: 'c3', supplierId: 's3', unitPrice: 110_000 }),
      ],
    );
    expect(winners[0].quote?.supplierId).toBe('s2');
    expect(winners[0].quoteCount).toBe(3);
  });

  it('کسی که کل نیاز را دارد بر ارزان‌ترِ ناکافی مقدم است', () => {
    // خرید از دو جا یعنی دو کرایهٔ حمل و دو فاکتور — تفاوت قیمتِ کم،
    // این هزینه را جبران نمی‌کند.
    const winners = pickWinners(
      [need({ qty: 10 })],
      [
        quote({ supplierId: 'کم', unitPrice: 80_000, availableQty: 4 }),
        quote({ callId: 'c2', supplierId: 'کامل', unitPrice: 95_000, availableQty: 10 }),
      ],
    );
    expect(winners[0].quote?.supplierId).toBe('کامل');
    expect(winners[0].shortBy).toBe(0);
  });

  it('موجودیِ نگفته یعنی «کافی است»', () => {
    // تأمین‌کننده‌ای که موجودی نگفته معمولاً دارد؛ اگر نداشت، هنگام
    // سفارش معلوم می‌شود و هزینه‌اش فقط یک تماس دیگر است.
    const winners = pickWinners(
      [need({ qty: 100 })],
      [
        quote({ supplierId: 'نگفته', unitPrice: 90_000, availableQty: null }),
        quote({ callId: 'c2', supplierId: 'کامل', unitPrice: 95_000, availableQty: 100 }),
      ],
    );
    expect(winners[0].quote?.supplierId).toBe('نگفته');
  });

  it('در قیمت برابر، تحویل زودتر برنده است', () => {
    const winners = pickWinners(
      [need()],
      [
        quote({ supplierId: 'دیر', unitPrice: 100_000, leadDays: 7 }),
        quote({ callId: 'c2', supplierId: 'زود', unitPrice: 100_000, leadDays: 2 }),
      ],
    );
    expect(winners[0].quote?.supplierId).toBe('زود');
  });

  it('قلمِ بی‌پیشنهاد حذف نمی‌شود', () => {
    // حذف بی‌صدا یعنی خریدار فکر می‌کند همه‌چیز سفارش شده و هفتهٔ بعد
    // قفسه خالی است.
    const winners = pickWinners([need({ productId: 'p9', productName: 'شکر' })], []);
    expect(winners).toHaveLength(1);
    expect(winners[0].quote).toBeNull();
    expect(winners[0].shortBy).toBe(10);
    expect(winners[0].reason).toContain('قیمت نداد');
  });

  it('کمبود موجودی گزارش می‌شود', () => {
    const winners = pickWinners(
      [need({ qty: 10 })],
      [quote({ availableQty: 6, unitPrice: 90_000 })],
    );
    expect(winners[0].shortBy).toBe(4);
    expect(winners[0].reason).toContain('کم دارد');
  });

  it('گرانی نسبت به خرید قبل حساب می‌شود', () => {
    const winners = pickWinners(
      [need({ lastPrice: 100_000 })],
      [quote({ unitPrice: 125_000 })],
    );
    expect(winners[0].changePercent).toBe(25);
  });

  it('ارزانی هم گزارش می‌شود', () => {
    const winners = pickWinners([need({ lastPrice: 100_000 })], [quote({ unitPrice: 80_000 })]);
    expect(winners[0].changePercent).toBe(-20);
    expect(winners[0].reason).toContain('ارزان‌تر');
  });

  it('بدون قیمت قبلی، درصد تغییر نامشخص است نه صفر', () => {
    // صفر یعنی «تغییر نکرده» که دروغ است؛ `null` یعنی «نمی‌دانیم».
    const winners = pickWinners([need({ lastPrice: null })], [quote({ unitPrice: 90_000 })]);
    expect(winners[0].changePercent).toBeNull();
  });

  it('قیمت قبلیِ صفر باعث تقسیم بر صفر نمی‌شود', () => {
    const winners = pickWinners([need({ lastPrice: 0 })], [quote({ unitPrice: 90_000 })]);
    expect(winners[0].changePercent).toBeNull();
  });

  it('پیشنهاد کالای دیگر روی این قلم اثر ندارد', () => {
    const winners = pickWinners(
      [need({ productId: 'p1' })],
      [
        quote({ productId: 'p1', unitPrice: 100_000 }),
        quote({ callId: 'c2', productId: 'p2', unitPrice: 10 }),
      ],
    );
    expect(winners[0].quote?.unitPrice).toBe(100_000);
  });

  it('فهرست خالی خطا نمی‌دهد', () => {
    expect(pickWinners([], [])).toEqual([]);
  });
});

describe('خلاصهٔ تصمیم', () => {
  const winners = pickWinners(
    [
      need({ productId: 'p1', qty: 10, lastPrice: 100_000 }),
      need({ productId: 'p2', productName: 'روغن', qty: 5, lastPrice: 200_000 }),
      need({ productId: 'p3', productName: 'شکر', qty: 3, lastPrice: 50_000 }),
    ],
    [
      quote({ productId: 'p1', supplierId: 's1', unitPrice: 100_000 }),
      quote({ callId: 'c2', productId: 'p2', supplierId: 's2', unitPrice: 260_000 }),
      // p3 هیچ پیشنهادی ندارد
    ],
  );

  it('مبلغ کل درست است', () => {
    // ۱۰×۱۰۰٬۰۰۰ + ۵×۲۶۰٬۰۰۰ = ۲٬۳۰۰٬۰۰۰
    expect(summarize(winners).total).toBe(2_300_000);
  });

  it('پوشش‌داده و بی‌پیشنهاد شمرده می‌شوند', () => {
    const s = summarize(winners);
    expect(s.covered).toBe(2);
    expect(s.uncovered).toBe(1);
  });

  it('تعداد تأمین‌کننده‌های درگیر', () => {
    expect(summarize(winners).supplierCount).toBe(2);
  });

  it('قلم گران‌شده هشدار می‌گیرد', () => {
    // روغن ۳۰٪ گران شده — بالای آستانهٔ ۱۵٪.
    const s = summarize(winners);
    expect(s.expensive.map((w) => w.productId)).toEqual(['p2']);
  });

  it('آستانهٔ هشدار قابل تنظیم است', () => {
    // با آستانهٔ ۵۰٪، همان ۳۰٪ دیگر هشدار نیست.
    expect(summarize(winners, 50).expensive).toHaveLength(0);
  });
});

describe('گروه‌بندی بر اساس تأمین‌کننده', () => {
  it('هر تأمین‌کننده یک فاکتور می‌شود', () => {
    const winners = pickWinners(
      [
        need({ productId: 'p1', qty: 2 }),
        need({ productId: 'p2', qty: 3 }),
        need({ productId: 'p3', qty: 1 }),
      ],
      [
        quote({ productId: 'p1', supplierId: 's1', unitPrice: 100 }),
        quote({ callId: 'c2', productId: 'p2', supplierId: 's1', unitPrice: 200 }),
        quote({ callId: 'c3', productId: 'p3', supplierId: 's2', unitPrice: 300 }),
      ],
    );

    const groups = groupBySupplier(winners);
    expect(groups).toHaveLength(2);

    const first = groups.find((g) => g.supplierId === 's1')!;
    expect(first.lines).toHaveLength(2);
    // ۲×۱۰۰ + ۳×۲۰۰ = ۸۰۰
    expect(first.total).toBe(800);
  });

  it('قلم بی‌پیشنهاد در هیچ گروهی نمی‌آید', () => {
    const winners = pickWinners([need({ productId: 'p9' })], []);
    expect(groupBySupplier(winners)).toEqual([]);
  });
});

// ---------------------------------------------------- گزارش به مدیر

describe('savingsOf', () => {
  const need = (id: string, qty: number) => ({
    productId: id,
    productName: id,
    qty,
    lastPrice: null,
  });
  const q = (product: string, supplier: string, price: number) => ({
    callId: `c-${supplier}`,
    supplierId: supplier,
    supplierName: supplier,
    productId: product,
    unitPrice: price,
    availableQty: null,
    leadDays: null,
  });

  it('صرفه‌جویی، تفاوت ارزان‌ترین و گران‌ترین ضربدر مقدار است', () => {
    const savings = savingsOf([need('p1', 10)], [q('p1', 's1', 100), q('p1', 's2', 130)]);
    expect(savings).toHaveLength(1);
    expect(savings[0].best).toBe(100);
    expect(savings[0].worst).toBe(130);
    expect(savings[0].saved).toBe(300);
  });

  it('یک پیشنهاد، صرفه‌جویی ندارد', () => {
    // با یک قیمت، انتخابی در کار نبوده؛ ادعای صرفه‌جویی دروغ است.
    expect(savingsOf([need('p1', 10)], [q('p1', 's1', 100)])).toEqual([]);
  });

  it('پیشنهادهای هم‌قیمت، صرفه‌جویی ندارند', () => {
    expect(savingsOf([need('p1', 5)], [q('p1', 's1', 100), q('p1', 's2', 100)])).toEqual([]);
  });

  it('بزرگ‌ترین صرفه‌جویی اول می‌آید', () => {
    const savings = savingsOf(
      [need('p1', 1), need('p2', 100)],
      [q('p1', 's1', 10), q('p1', 's2', 20), q('p2', 's1', 5), q('p2', 's2', 6)],
    );
    expect(savings.map((s) => s.productId)).toEqual(['p2', 'p1']);
  });

  it('قلمی که هیچ قیمتی ندارد، در فهرست نمی‌آید', () => {
    expect(savingsOf([need('p9', 3)], [])).toEqual([]);
  });
});

describe('brief', () => {
  const need = (id: string, qty: number, last: number | null = null) => ({
    productId: id,
    productName: id,
    qty,
    lastPrice: last,
  });
  const q = (product: string, supplier: string, price: number) => ({
    callId: `c-${supplier}`,
    supplierId: supplier,
    supplierName: supplier,
    productId: product,
    unitPrice: price,
    availableQty: null,
    leadDays: null,
  });

  it('قلم بی‌قیمت جدا گزارش می‌شود', () => {
    // مدیر باید بداند کسی موجودی نداشت — این تصمیم اوست نه مریم.
    const needs = [need('p1', 1), need('p2', 1)];
    const quotes = [q('p1', 's1', 100)];
    const result = brief(needs, quotes, pickWinners(needs, quotes));
    expect(result.missing.map((m) => m.productId)).toEqual(['p2']);
    expect(result.message).toContain('۱ قلم بی‌قیمت'.replace('۱', '1'));
  });

  it('قلم تک‌پیشنهاد جدا گزارش می‌شود', () => {
    // یک قیمت یعنی مقایسه‌ای نبوده؛ ممکن است گران باشد بی‌آنکه معلوم شود.
    const needs = [need('p1', 1)];
    const quotes = [q('p1', 's1', 100)];
    const result = brief(needs, quotes, pickWinners(needs, quotes));
    expect(result.singleQuote.map((w) => w.productId)).toEqual(['p1']);
  });

  it('چند پیشنهاد، تک‌پیشنهاد شمرده نمی‌شود', () => {
    const needs = [need('p1', 1)];
    const quotes = [q('p1', 's1', 100), q('p1', 's2', 120)];
    const result = brief(needs, quotes, pickWinners(needs, quotes));
    expect(result.singleQuote).toEqual([]);
    expect(result.totalSaved).toBe(20);
  });

  it('پیام، مبلغ و صرفه‌جویی را می‌گوید', () => {
    const needs = [need('p1', 2)];
    const quotes = [q('p1', 's1', 1000), q('p1', 's2', 1500)];
    const result = brief(needs, quotes, pickWinners(needs, quotes));
    expect(result.message).toContain('خرید پیشنهادی');
    expect(result.message).toContain('صرفه‌جویی');
  });

  it('بدون صرفه‌جویی، ادعایش را نمی‌کند', () => {
    const needs = [need('p1', 1)];
    const quotes = [q('p1', 's1', 100)];
    const result = brief(needs, quotes, pickWinners(needs, quotes));
    expect(result.totalSaved).toBe(0);
    expect(result.message).not.toContain('صرفه‌جویی');
  });

  it('گرانیِ بیش از آستانه هشدار می‌دهد', () => {
    const needs = [need('p1', 1, 100)];
    const quotes = [q('p1', 's1', 150)];
    const result = brief(needs, quotes, pickWinners(needs, quotes));
    expect(result.summary.expensive).toHaveLength(1);
    expect(result.message).toContain('گران شده');
  });

  it('نوسان کوچک هشدار نمی‌دهد', () => {
    // زیر آستانه، نوسان عادی بازار است و هشدارش فقط بی‌اعتبار می‌شود.
    const needs = [need('p1', 1, 100)];
    const quotes = [q('p1', 's1', 105)];
    const result = brief(needs, quotes, pickWinners(needs, quotes));
    expect(result.summary.expensive).toEqual([]);
  });
});

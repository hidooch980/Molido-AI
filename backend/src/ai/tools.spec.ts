import { TOOLS, extractNumber, matchTool } from './tools';

describe('فهرست ابزارها', () => {
  it('نام ابزارها یکتاست', () => {
    const names = TOOLS.map((tool) => tool.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('هر ابزار توضیح و واژهٔ کلیدی دارد', () => {
    for (const tool of TOOLS) {
      expect(tool.description.length).toBeGreaterThan(10);
      expect(tool.keywords.length).toBeGreaterThan(0);
    }
  });
});

describe('مسیریابی آفلاین پرسش', () => {
  const cases: Array<[string, string]> = [
    ['امروز اوضاع فروشگاه چطور است؟', 'dashboard'],
    ['این هفته چه بخرم؟', 'reorderSuggestions'],
    ['کدام کالاها راکد مانده‌اند؟', 'deadStock'],
    ['هفته آینده چقدر می‌فروشیم؟', 'salesForecast'],
    ['کدام صندوق‌دار مغایرت مشکوک دارد؟', 'cashierAnomalies'],
    ['سود این دوره چقدر بوده؟', 'profitReport'],
    ['چه کالایی نزدیک انقضاست؟', 'expiryAnalysis'],
    ['پرفروش‌ترین کالاها کدامند؟', 'topProducts'],
    ['وضعیت کالابرگ چطور است؟', 'rationSettlement'],
    ['بدهی مشتریان چقدر است؟', 'unpaidSales'],
  ];

  it.each(cases)('«%s» → %s', (question, expected) => {
    expect(matchTool(question)?.tool.name).toBe(expected);
  });

  it('پرسش نامربوط را به هیچ ابزاری نمی‌رساند', () => {
    expect(matchTool('امروز هوا چطور است؟')).toBeNull();
    expect(matchTool('')).toBeNull();
  });

  it('واژهٔ دقیق‌تر بر واژهٔ کوتاه‌تر غلبه می‌کند', () => {
    // «صندوق» در cashierAnomalies هست، ولی «کسری صندوق» دقیق‌تر است
    expect(matchTool('کسری صندوق را نشان بده')?.tool.name).toBe('cashierAnomalies');
  });
});

describe('استخراج عدد از پرسش', () => {
  it('رقم لاتین را می‌خواند', () => {
    expect(extractNumber('14 روز آینده')).toBe(14);
  });

  it('رقم فارسی را می‌خواند', () => {
    expect(extractNumber('۲۱ روز آینده چقدر می‌فروشیم؟')).toBe(21);
  });

  it('وقتی عددی نیست null برمی‌گرداند', () => {
    expect(extractNumber('چه بخرم؟')).toBeNull();
  });
});

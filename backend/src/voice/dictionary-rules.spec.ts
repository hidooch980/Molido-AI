import {
  findColumns,
  matchUiKeys,
  normalizeText,
  parseDictionary,
} from './dictionary-rules';

describe('یکسان‌سازی نویسه', () => {
  it('کاف عربی را فارسی می‌کند', () => {
    // فایل‌هایی که با کیبورد عربی تایپ شده‌اند فراوان‌اند، و «کتاب» با
    // کافِ عربی هیچ‌وقت با متن سامانه برابر نمی‌شود.
    expect(normalizeText('كتاب')).toBe('کتاب');
  });

  it('یای عربی را فارسی می‌کند', () => {
    expect(normalizeText('برنجي')).toBe('برنجی');
  });

  it('اعراب را برمی‌دارد', () => {
    expect(normalizeText('نَان')).toBe('نان');
  });

  it('BOM را برمی‌دارد', () => {
    expect(normalizeText('\ufeffبرنج')).toBe('برنج');
  });

  it('فاصله‌های اضافی را جمع می‌کند', () => {
    expect(normalizeText('  برنج   ایرانی  ')).toBe('برنج ایرانی');
  });
});

describe('تشخیص ستون', () => {
  it('سرستون فارسی را می‌شناسد', () => {
    expect(findColumns(['فارسی', 'بلوچی'])).toEqual({ fa: 0, target: 1 });
  });

  it('ترتیب معکوس را هم می‌شناسد', () => {
    expect(findColumns(['بلوچی', 'فارسی'])).toEqual({ fa: 1, target: 0 });
  });

  it('سرستون انگلیسی', () => {
    expect(findColumns(['persian', 'balochi'])).toEqual({ fa: 0, target: 1 });
  });

  it('بدون سرستون، دو ستون اول', () => {
    // فایل دست‌نویس معمولاً سرستون ندارد؛ ردکردنش یعنی کاربر باید
    // فایلش را دوباره بسازد.
    expect(findColumns(['برنج', 'برنج'])).toEqual({ fa: 0, target: 1 });
  });

  it('یک ستون کافی نیست', () => {
    expect(findColumns(['برنج'])).toBeNull();
  });
});

describe('تجزیهٔ واژه‌نامه', () => {
  it('فایل با سرستون', () => {
    const { entries } = parseDictionary('فارسی,بلوچی\nبرنج,برنج\nنان,نگن');
    expect(entries).toHaveLength(2);
    expect(entries[1]).toMatchObject({ fa: 'نان', target: 'نگن' });
  });

  it('فایل بدون سرستون', () => {
    const { entries } = parseDictionary('برنج,برنج\nنان,نگن');
    expect(entries).toHaveLength(2);
  });

  it('جداکنندهٔ نقطه‌ویرگول اکسل فارسی', () => {
    const { entries } = parseDictionary('فارسی;بلوچی\nبرنج;برنج');
    expect(entries).toHaveLength(1);
  });

  it('سطر ناقص رد می‌شود، نه نادیده', () => {
    // کاربر باید ببیند از هزار سطر چرا نهصدتا وارد شد.
    const { entries, skipped } = parseDictionary('فارسی,بلوچی\nبرنج,برنج\nنان,');
    expect(entries).toHaveLength(1);
    expect(skipped).toHaveLength(1);
    expect(skipped[0].row).toBe(3);
    expect(skipped[0].reason).toContain('بلوچی');
  });

  it('سطر خالی خطا نیست', () => {
    const { entries, skipped } = parseDictionary('فارسی,بلوچی\nبرنج,برنج\n,\nنان,نگن');
    expect(entries).toHaveLength(2);
    expect(skipped).toHaveLength(0);
  });

  it('واژهٔ تکراری: اولی می‌ماند', () => {
    const { entries, skipped } = parseDictionary('فارسی,بلوچی\nنان,نگن\nنان,نان');
    expect(entries).toHaveLength(1);
    expect(entries[0].target).toBe('نگن');
    expect(skipped[0].reason).toContain('قبلاً آمده');
  });

  it('نویسهٔ عربی در فایل، تطبیق را نمی‌شکند', () => {
    const { entries } = parseDictionary('فارسی,بلوچی\nكتاب,كتاب');
    expect(entries[0].fa).toBe('کتاب');
  });

  it('فایل تک‌ستونی با پیام روشن رد می‌شود', () => {
    const { entries, skipped } = parseDictionary('برنج');
    expect(entries).toHaveLength(0);
    expect(skipped[0].reason).toContain('دو ستون');
  });

  it('فایل خالی خطا نمی‌دهد', () => {
    expect(parseDictionary('')).toEqual({ entries: [], skipped: [] });
  });
});

describe('تطبیق با کلیدهای رابط', () => {
  const dict = {
    menuSales: { fa: 'فروش' },
    menuProducts: { fa: 'کالاها' },
    unknownKey: { fa: 'چیز ترجمه‌نشده' },
  };

  it('کلیدهای موجود در واژه‌نامه را برمی‌گرداند', () => {
    const { entries } = parseDictionary('فارسی,بلوچی\nفروش,پروش\nکالاها,جنسان');
    const matched = matchUiKeys(entries, dict);
    expect(matched.map((m) => m.key).sort()).toEqual(['menuProducts', 'menuSales']);
  });

  it('کلیدی که در واژه‌نامه نیست، ترجمه نمی‌شود', () => {
    // ترجمهٔ حدسی بدتر از فارسی ماندن است.
    const { entries } = parseDictionary('فارسی,بلوچی\nفروش,پروش');
    expect(matchUiKeys(entries, dict).map((m) => m.key)).toEqual(['menuSales']);
  });

  it('نویسهٔ عربی در متن سامانه هم تطبیق می‌خورد', () => {
    const { entries } = parseDictionary('فارسی,بلوچی\nکالاها,جنسان');
    const arabicDict = { k: { fa: 'كالاها' } };
    expect(matchUiKeys(entries, arabicDict)).toHaveLength(1);
  });

  it('واژه‌نامهٔ خالی چیزی ترجمه نمی‌کند', () => {
    expect(matchUiKeys([], dict)).toEqual([]);
  });
});

describe('یکسان‌سازی املای پاکستانی به ایرانی', () => {
  // دادهٔ بلوچیِ در دسترس بیشتر پاکستانی است؛ بدون این تبدیل، هیچ
  // واژه‌ای با آنچه کاربر ایرانی تایپ می‌کند تطبیق نمی‌خورد.
  it('ہ اردو به ه فارسی', () => {
    expect(normalizeText('دہ')).toBe('ده');
  });

  it('ھ دوچشمی به ه', () => {
    expect(normalizeText('ھو')).toBe('هو');
  });

  it('ے بزرگ به ی', () => {
    expect(normalizeText('سئے')).toBe('سئی');
  });

  it('ں نون غنه به ن', () => {
    expect(normalizeText('اناں')).toBe('انان');
  });

  it('تای گرد به ه', () => {
    expect(normalizeText('زکاة')).toBe('زکاه');
  });

  it('اعراب و مدّ حذف می‌شوند', () => {
    expect(normalizeText('بِرنج')).toBe('برنج');
    expect(normalizeText('کُلّ')).toBe('کل');
  });

  it('حروف واکرفته دست‌نخورده می‌مانند', () => {
    // ٹ ڈ ڑ واج‌اند نه شکل نوشتاری؛ تبدیلشان معنی را عوض می‌کند.
    expect(normalizeText('ٹگرد')).toBe('ٹگرد');
    expect(normalizeText('ڈن')).toBe('ڈن');
    expect(normalizeText('گڑ')).toBe('گڑ');
  });

  it('واژهٔ فارسی دست‌نخورده می‌ماند', () => {
    expect(normalizeText('صابون')).toBe('صابون');
  });
});

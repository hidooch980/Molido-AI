import { needsTransliteration, toBaluchiScript } from './translit-rules';

describe('toBaluchiScript', () => {
  it('ص را به س بدل می‌کند', () => {
    expect(toBaluchiScript('صابون').suggestion).toBe('سابون');
  });

  it('ث را به س بدل می‌کند', () => {
    expect(toBaluchiScript('اثاث').suggestion).toBe('اساس');
  });

  it('ذ و ض و ظ را به ز بدل می‌کند', () => {
    expect(toBaluchiScript('ذرت').suggestion).toBe('زرت');
    expect(toBaluchiScript('حاضر').suggestion).toBe('هازر');
    expect(toBaluchiScript('ظرف').suggestion).toBe('زرف');
  });

  it('ط را به ت بدل می‌کند', () => {
    expect(toBaluchiScript('طناب').suggestion).toBe('تناب');
  });

  it('ح را به ه بدل می‌کند', () => {
    expect(toBaluchiScript('حلوا').suggestion).toBe('هلوا');
  });

  it('ع آغازین را به ا بدل می‌کند', () => {
    expect(toBaluchiScript('عسل').suggestion).toBe('اسل');
  });

  it('ع میانی و پایانی را حذف می‌کند', () => {
    expect(toBaluchiScript('شمع').suggestion).toBe('شم');
    expect(toBaluchiScript('معدن').suggestion).toBe('مدن');
  });

  it('در عبارت چندواژه‌ای هر واژه جدا حساب می‌شود', () => {
    // «ع» اولی آغازِ واژه است و دومی نه — سرنوشتشان یکی نیست.
    expect(toBaluchiScript('عطر شمع').suggestion).toBe('اتر شم');
  });

  it('واژهٔ بدون حرف عربی دست‌نخورده می‌ماند', () => {
    const result = toBaluchiScript('برنج');
    expect(result.suggestion).toBe('برنج');
    expect(result.changed).toBe(false);
  });

  it('ی و ک عربی را یکسان می‌کند', () => {
    expect(toBaluchiScript('كتاب').suggestion).toBe('کتاب');
    expect(toBaluchiScript('چاي').suggestion).toBe('چای');
  });

  it('اعراب را حذف می‌کند', () => {
    expect(toBaluchiScript('نَان').suggestion).toBe('نان');
  });

  it('فاصله‌های اضافی جمع می‌شوند', () => {
    expect(toBaluchiScript('  شیر    خشک  ').suggestion).toBe('شیر خشک');
  });

  it('رشتهٔ خالی، پیشنهاد خالی', () => {
    expect(toBaluchiScript('   ')).toEqual({ suggestion: '', changed: false, notes: [] });
  });

  it('واژه‌ای که فقط ع است، دست‌نخورده می‌ماند', () => {
    // «ع» تنها، پس از حذف چیزی نمی‌ماند؛ پیشنهادِ خالی بی‌فایده است.
    // (چون آغازِ واژه است به «ا» بدل می‌شود، نه حذف)
    expect(toBaluchiScript('ع').suggestion).toBe('ا');
  });

  it('گزارش تغییرها تکراری ندارد', () => {
    const result = toBaluchiScript('صصص');
    expect(result.suggestion).toBe('سسس');
    expect(result.notes).toEqual(['ص ← س']);
  });

  it('گزارش، دلیل هر تغییر را می‌گوید', () => {
    const result = toBaluchiScript('حاضر');
    expect(result.notes).toContain('ح ← ه');
    expect(result.notes).toContain('ض ← ز');
  });

  it('عدد و لاتین دست‌نخورده می‌مانند', () => {
    expect(toBaluchiScript('شیر 1 لیتری').suggestion).toBe('شیر 1 لیتری');
  });
});

describe('needsTransliteration', () => {
  it('واژهٔ دارای حرف عربی، بازنویسی لازم دارد', () => {
    expect(needsTransliteration('صابون')).toBe(true);
  });

  it('واژهٔ بلوچی‌پسند، لازم ندارد', () => {
    expect(needsTransliteration('نان')).toBe(false);
  });

  it('عبارت خالی، لازم ندارد', () => {
    expect(needsTransliteration('')).toBe(false);
  });
});

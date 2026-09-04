import { amountInWords, numberToPersianWords, MAX_SUPPORTED } from './number-words';

describe('عدد به حروف فارسی', () => {
  it('یکان و ده‌گان', () => {
    expect(numberToPersianWords(0)).toBe('صفر');
    expect(numberToPersianWords(1)).toBe('یک');
    expect(numberToPersianWords(9)).toBe('نه');
    expect(numberToPersianWords(20)).toBe('بیست');
    expect(numberToPersianWords(21)).toBe('بیست و یک');
    expect(numberToPersianWords(99)).toBe('نود و نه');
  });

  // ⚠️ ده تا نوزده واژهٔ خودشان را دارند، نه «ده و یک».
  //    این بخش همان‌جایی است که پیاده‌سازیِ ساده‌انگارانه می‌شکند.
  it('یازده تا نوزده واژهٔ مستقل دارند', () => {
    expect(numberToPersianWords(10)).toBe('ده');
    expect(numberToPersianWords(11)).toBe('یازده');
    expect(numberToPersianWords(15)).toBe('پانزده');
    expect(numberToPersianWords(19)).toBe('نوزده');
    expect(numberToPersianWords(119)).toBe('صد و نوزده');
  });

  it('صدگان', () => {
    expect(numberToPersianWords(100)).toBe('صد');
    expect(numberToPersianWords(500)).toBe('پانصد');
    expect(numberToPersianWords(900)).toBe('نهصد');
    expect(numberToPersianWords(123)).toBe('صد و بیست و سه');
  });

  it('هزار و میلیون و میلیارد', () => {
    expect(numberToPersianWords(1000)).toBe('یک هزار');
    expect(numberToPersianWords(1500)).toBe('یک هزار و پانصد');
    expect(numberToPersianWords(1_000_000)).toBe('یک میلیون');
    expect(numberToPersianWords(1_000_000_000)).toBe('یک میلیارد');
  });

  // ⚠️ گروهِ صفر اصلاً گفته نمی‌شود.
  //    «یک میلیون و صفر هزار و بیست» غلط است و روی چک مسخره.
  it('گروهِ صفر را نمی‌گوید', () => {
    expect(numberToPersianWords(1_000_020)).toBe('یک میلیون و بیست');
    expect(numberToPersianWords(1_000_000_001)).toBe('یک میلیارد و یک');
    expect(numberToPersianWords(2_000_500)).toBe('دو میلیون و پانصد');
  });

  it('مبلغ‌های واقعیِ چک', () => {
    expect(numberToPersianWords(15_000_000)).toBe('پانزده میلیون');
    expect(numberToPersianWords(87_650_000)).toBe(
      'هشتاد و هفت میلیون و ششصد و پنجاه هزار',
    );
    expect(numberToPersianWords(123_456_789)).toBe(
      'صد و بیست و سه میلیون و چهارصد و پنجاه و شش هزار و هفتصد و هشتاد و نه',
    );
  });

  // ⚠️ اینجا جایی است که یک اشتباهِ کوچک پولِ واقعی جابه‌جا می‌کند:
  //    عددِ روی چک و حروفِ روی چک باید یکی باشند.
  it('واحد ریال است، نه تومان', () => {
    expect(amountInWords(15_000_000)).toBe('پانزده میلیون ریال');
    expect(amountInWords(0)).toBe('صفر ریال');
  });

  it('ورودیِ نامعتبر را رد می‌کند', () => {
    expect(() => numberToPersianWords(-1)).toThrow();
    expect(() => numberToPersianWords(1.5)).toThrow();
    expect(() => numberToPersianWords(Number.NaN)).toThrow();
    expect(() => numberToPersianWords(Number.POSITIVE_INFINITY)).toThrow();
    // بالاتر از میلیارد واژه‌ای که کسی بفهمد وجود ندارد؛ خطا بهتر از
    // عبارتِ نامفهوم روی چک است.
    expect(() => numberToPersianWords(MAX_SUPPORTED + 1)).toThrow();
  });

  it('تا مرزِ پشتیبانی کار می‌کند', () => {
    expect(numberToPersianWords(MAX_SUPPORTED)).toContain('میلیارد');
  });

  // ⚠️ سنجهٔ ساختاری: هیچ خروجی‌ای نباید فاصلهٔ دوتایی، فاصلهٔ ابتدایی
  //    یا «و»ِ آویزان داشته باشد.  اینها روی چکِ چاپ‌شده دیده می‌شوند.
  it('خروجی تمیز است — بدونِ فاصلهٔ اضافه یا «و»ِ آویزان', () => {
    for (const n of [0, 5, 10, 11, 100, 101, 110, 1000, 1001, 1010, 1100,
                     10_000, 100_000, 1_000_000, 1_000_001, 20_000_000,
                     999_999_999, 1_000_000_000]) {
      const w = numberToPersianWords(n);
      expect(w).not.toMatch(/ {2}/);
      expect(w.trim()).toBe(w);
      expect(w).not.toMatch(/(^و |\sو$)/);
    }
  });
});

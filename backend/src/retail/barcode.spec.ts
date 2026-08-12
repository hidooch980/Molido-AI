import {
  buildScaleBarcode,
  ean13CheckDigit,
  isValidEan13,
  parseScaleBarcode,
} from './barcode';

describe('EAN-13', () => {
  it('computes the published check digit', () => {
    // نمونهٔ مرجع استاندارد
    expect(ean13CheckDigit('400638133393')).toBe(1);
    expect(isValidEan13('4006381333931')).toBe(true);
  });

  it('rejects a barcode with a broken check digit', () => {
    expect(isValidEan13('4006381333930')).toBe(false);
  });

  it('rejects anything that is not 13 digits', () => {
    expect(isValidEan13('12345')).toBe(false);
    expect(isValidEan13('40063813339XX')).toBe(false);
  });
});

describe('بارکد ترازو', () => {
  it('وزن را به کیلوگرم برمی‌گرداند', () => {
    const barcode = buildScaleBarcode('12345', 1.234);
    const parsed = parseScaleBarcode(barcode);

    expect(parsed).not.toBeNull();
    expect(parsed?.scaleCode).toBe('12345');
    expect(parsed?.value).toBeCloseTo(1.234, 3);
    expect(parsed?.mode).toBe('WEIGHT');
  });

  it('در حالت مبلغی، مبلغ را برمی‌گرداند', () => {
    const barcode = buildScaleBarcode('54321', 87_500, '2', 'PRICE');
    const parsed = parseScaleBarcode(barcode, '2', 'PRICE');

    expect(parsed?.scaleCode).toBe('54321');
    expect(parsed?.value).toBe(87_500);
  });

  it('پیشوند دلخواه فروشگاه را می‌پذیرد', () => {
    const barcode = buildScaleBarcode('11111', 0.5, '9');

    expect(parseScaleBarcode(barcode, '9')?.value).toBeCloseTo(0.5, 3);
    // با پیشوند اشتباه، بارکد ترازو محسوب نمی‌شود
    expect(parseScaleBarcode(barcode, '2')).toBeNull();
  });

  it('بارکد معمولی کالا را به‌اشتباه وزنی تفسیر نمی‌کند', () => {
    expect(parseScaleBarcode('4006381333931')).toBeNull();
  });

  it('اسکن خراب را رد می‌کند تا مبلغ فاکتور غلط نشود', () => {
    const barcode = buildScaleBarcode('12345', 1.234);
    const corrupted = `${barcode.slice(0, 12)}${(Number(barcode[12]) + 1) % 10}`;

    expect(parseScaleBarcode(corrupted)).toBeNull();
  });

  it('مقدار صفر را نامعتبر می‌داند', () => {
    const body = '212345' + '000000';
    const withCheck = `${body}${ean13CheckDigit(body)}`;

    expect(isValidEan13(withCheck)).toBe(true);
    expect(parseScaleBarcode(withCheck)).toBeNull();
  });

  it('مقدار خارج از محدوده را نمی‌سازد', () => {
    expect(() => buildScaleBarcode('12345', 1000, '20')).toThrow();
    expect(() => buildScaleBarcode('123', 1)).toThrow();
  });
});

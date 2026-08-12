import { PRODUCTS, activeProduct, hasFeature } from './product';

describe('تعریف محصول', () => {
  const original = process.env.MOLIDO_PRODUCT;

  afterEach(() => {
    if (original === undefined) delete process.env.MOLIDO_PRODUCT;
    else process.env.MOLIDO_PRODUCT = original;
  });

  it('پیش‌فرض نسخهٔ کامل است', () => {
    delete process.env.MOLIDO_PRODUCT;
    expect(activeProduct().key).toBe('suite');
  });

  it('مقدار نامعتبر خطا می‌دهد و بی‌صدا به نسخهٔ کامل برنمی‌گردد', () => {
    process.env.MOLIDO_PRODUCT = 'shop';
    expect(() => activeProduct()).toThrow(/MOLIDO_PRODUCT/);
  });

  it('فروشگاه رستوران را ندارد', () => {
    process.env.MOLIDO_PRODUCT = 'store';
    expect(hasFeature('retail')).toBe(true);
    expect(hasFeature('ration')).toBe(true);
    expect(hasFeature('restaurant')).toBe(false);
    expect(hasFeature('municipal')).toBe(false);
  });

  it('رستوران صندوق فروشگاهی و کالابرگ را ندارد', () => {
    process.env.MOLIDO_PRODUCT = 'resto';
    expect(hasFeature('restaurant')).toBe(true);
    // رسپی از موجودی مواد اولیه کم می‌کند، پس کالا و انبار لازم است
    expect(hasFeature('catalogue')).toBe(true);
    expect(hasFeature('retail')).toBe(false);
    expect(hasFeature('ration')).toBe(false);
    expect(hasFeature('municipal')).toBe(false);
  });

  it('نسخهٔ کامل همه‌چیز را دارد', () => {
    process.env.MOLIDO_PRODUCT = 'suite';
    for (const feature of PRODUCTS.suite.features) {
      expect(hasFeature(feature)).toBe(true);
    }
    expect(PRODUCTS.suite.features).toContain('restaurant');
    expect(PRODUCTS.suite.features).toContain('municipal');
  });

  it('هر محصول قابلیت تکراری ندارد', () => {
    for (const product of Object.values(PRODUCTS)) {
      expect(new Set(product.features).size).toBe(product.features.length);
    }
  });

  it('فروشگاه و رستوران زیرمجموعهٔ نسخهٔ کامل‌اند', () => {
    const suite = new Set<string>(PRODUCTS.suite.features);

    for (const key of ['store', 'resto'] as const) {
      for (const feature of PRODUCTS[key].features) {
        expect(suite.has(feature)).toBe(true);
      }
    }
  });
});

import { STRUCTURE, FORBIDDEN } from './structure-map';

/**
 * نگهبانِ فهرستِ سفید — بی‌نیاز از سرور و پایگاه‌داده.
 *
 * ⚠️ سنجهٔ اصلی این نیست که «خروجی درست است».
 *
 *    فایلِ ساختار چیزی است که کاربر **ایمیلش می‌کند** یا به نصبِ
 *    تازه می‌برد.  اگر روزی کسی `merchantId` یا `privateKeyPem` را
 *    به فهرستِ سفید اضافه کند — با نیتِ خوب، چون «لازم است» — راز
 *    در آن فایل می‌نشیند و هیچ آزمونی نمی‌گیردش.
 *
 *    این آزمون همان لحظه می‌شکند.
 */
describe('نقشهٔ ساختار', () => {
  it('هیچ ستونِ رازآلودی در فهرستِ سفید نیست', () => {
    const leaks: string[] = [];

    for (const spec of STRUCTURE) {
      for (const column of spec.columns) {
        const bad = FORBIDDEN.find((f) =>
          column.toLowerCase().includes(f.toLowerCase()),
        );
        if (bad) leaks.push(`${spec.table}.${column} (${bad})`);
      }
    }

    expect(leaks).toEqual([]);
  });

  it('ماندهٔ حساب و صندوق بیرون می‌ماند', () => {
    // ⚠️ مانده از تراکنش‌ها می‌آید.  بردنش به نصبِ تازه یعنی دفتری که
    //    از روزِ اول نامتراز است — ماندهٔ بدونِ سندِ پشتیبان.
    const withBalance = STRUCTURE.filter((s) =>
      s.columns.some((c) => c.toLowerCase().includes('balance')),
    ).map((s) => s.table);

    expect(withBalance).toEqual([]);
  });

  it('هر جدول کلیدِ طبیعی دارد و کلیدش `id` نیست', () => {
    // ⚠️ `id`ِ نصبِ مبدأ در مقصد معنایی ندارد؛ تطبیق با آن یعنی هر
    //    بازیابی رکوردِ تکراری بسازد.
    for (const spec of STRUCTURE) {
      expect(spec.key.length).toBeGreaterThan(0);
      expect(spec.key).not.toContain('id');
    }
  });

  it('هر ارجاع به جدولی اشاره می‌کند که زودتر آمده', () => {
    // ⚠️ ترتیب بی‌صدا خراب می‌کند: اگر انبار پیش از شعبه بیاید،
    //    `branchId` تهی می‌ماند و کسی متوجه نمی‌شود.
    const seen = new Set<string>();

    for (const spec of STRUCTURE) {
      for (const target of Object.values(spec.refs ?? {})) {
        expect(seen.has(target) || target === spec.table).toBe(true);
      }
      seen.add(spec.table);
    }
  });
});

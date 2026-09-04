import { BadRequestException } from '@nestjs/common';

import { ReviewService } from './review.service';

/**
 * نظر و امتیازِ کالا — قاعده‌هایی که نظر را از تبلیغ جدا می‌کنند.
 *
 * ⚠️ اینجا پایگاه داده صدا زده نمی‌شود؛ `db` جعلی است.  چیزی که
 *    سنجیده می‌شود ترتیبِ تصمیم‌هاست: امتیازِ نامعتبر باید **پیش از**
 *    هر پرس‌وجویی رد شود، و بدونِ خریدِ تحویل‌شده هیچ نوشتنی رخ ندهد.
 */

function service(deliveredCount: number) {
  const calls: string[] = [];
  const db = {
    query: async (sql: string) => {
      calls.push(sql.replace(/\s+/g, ' ').trim().slice(0, 40));
      if (sql.includes('OnlineOrderItem')) {
        return [{ n: String(deliveredCount) }];
      }
      return [];
    },
    execute: async () => 1,
  };
  return { svc: new ReviewService(db as never), calls };
}

describe('ReviewService.upsert', () => {
  describe('اعتبارِ امتیاز', () => {
    it.each([0, 6, 99, -1, Number.NaN])('امتیاز %p رد می‌شود', async (bad) => {
      const { svc } = service(1);
      await expect(
        svc.upsert('co', 'p1', 'c1', { rating: bad as number }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('امتیازِ نامعتبر پیش از هر پرس‌وجو رد می‌شود', async () => {
      // ⚠️ ترتیب مهم است: اگر اول به پایگاه داده می‌زد، ورودیِ آشغال
      //    هم بار می‌ساخت — و در مسیرِ عمومی، همان می‌شود راهِ فشار.
      const { svc, calls } = service(1);
      await expect(
        svc.upsert('co', 'p1', 'c1', { rating: 9 }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(calls).toHaveLength(0);
    });

    it.each([1, 2, 3, 4, 5])('امتیاز %p پذیرفته می‌شود', async (good) => {
      const { svc } = service(1);
      await expect(
        svc.upsert('co', 'p1', 'c1', { rating: good }),
      ).resolves.toEqual({ ok: true, pending: true });
    });
  });

  describe('فقط خریدارِ تحویل‌گرفته', () => {
    it('بدونِ خریدِ تحویل‌شده رد می‌شود', async () => {
      const { svc } = service(0);
      await expect(
        svc.upsert('co', 'p1', 'c1', { rating: 5 }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('و هیچ نوشتنی رخ نمی‌دهد', async () => {
      // ⚠️ مهم‌ترین سنجه: اگر رد شد ولی رکورد نوشته شد، قید یکتا بعداً
      //    ویرایشِ خریدارِ واقعی را هم می‌بست.
      const { svc, calls } = service(0);
      await expect(
        svc.upsert('co', 'p1', 'c1', { rating: 5 }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(calls.some((c) => c.startsWith('INSERT'))).toBe(false);
    });

    it('با خریدِ تحویل‌شده، درج انجام می‌شود', async () => {
      const { svc, calls } = service(2);
      await svc.upsert('co', 'p1', 'c1', { rating: 4 });
      expect(calls.some((c) => c.startsWith('INSERT'))).toBe(true);
    });
  });

  describe('نظرِ تازه تأییدنشده است', () => {
    it('پاسخ `pending` می‌دهد', async () => {
      const { svc } = service(1);
      // ⚠️ اگر `pending` برنمی‌گشت، رابط پیامِ «نظرتان ثبت شد» می‌داد و
      //    کاربر انتظار داشت بلافاصله ببیندش — و نبودش را اشکال
      //    می‌پنداشت.
      await expect(svc.upsert('co', 'p1', 'c1', { rating: 5 })).resolves.toEqual({
        ok: true,
        pending: true,
      });
    });
  });
});

describe('ReviewService.summary', () => {
  it('بدونِ نظر، میانگین تهی است نه صفر', async () => {
    // ⚠️ «۰ از ۵» یعنی کالای بد؛ «بدونِ نظر» یعنی هنوز کسی نظر نداده.
    const db = { query: async () => [{ avg: null, n: '0' }], execute: async () => 0 };
    const svc = new ReviewService(db as never);
    await expect(svc.summary('co', 'p1')).resolves.toEqual({
      average: null,
      count: 0,
    });
  });

  it('میانگین عدد برمی‌گردد نه رشته', async () => {
    const db = { query: async () => [{ avg: '4.33', n: '3' }], execute: async () => 0 };
    const svc = new ReviewService(db as never);
    const out = await svc.summary('co', 'p1');
    expect(out).toEqual({ average: 4.33, count: 3 });
    expect(typeof out.average).toBe('number');
  });
});

/**
 * حسابِ صفحه‌بندی.
 *
 * ⚠️ چرا آزمونِ جدا برای چهار خط حساب؟
 *
 *    چون اشتباهش خطا نمی‌دهد، فقط عددِ غلط می‌سازد: «صفحهٔ ۱ از ۰»،
 *    یا دکمهٔ «بعدی» که به صفحهٔ خالی می‌رسد، یا OFFSET منفی که
 *    پرس‌وجو را می‌شکند.  هر سه در رابط دیده می‌شوند نه در لاگ.
 */

/** همان منطقی که در `catalogue` است. */
function paginate(options: { limit?: number; page?: number }, total: number) {
  const limit = Math.min(Math.max(options.limit ?? 24, 1), 200);
  const page = Math.max(options.page ?? 1, 1);
  return {
    limit,
    page,
    offset: (page - 1) * limit,
    pages: Math.max(Math.ceil(total / limit), 1),
  };
}

describe('صفحه‌بندی کاتالوگ', () => {
  describe('مقدارهای پیش‌فرض', () => {
    it('بدون ورودی، صفحهٔ یک با بیست‌وچهار قلم', () => {
      const r = paginate({}, 100);
      expect(r.page).toBe(1);
      expect(r.limit).toBe(24);
      expect(r.offset).toBe(0);
    });
  });

  describe('مرزها — نشانیِ دستکاری‌شده نباید چیزی بشکند', () => {
    it('صفحهٔ صفر به یک برمی‌گردد', () => {
      // ⚠️ بدونِ این، OFFSET منفی می‌شد و پستگرس خطا می‌داد — یعنی
      //    هر کسی با `?page=0` فروشگاه را ۵۰۰ می‌کرد.
      expect(paginate({ page: 0 }, 50).offset).toBe(0);
    });

    it('صفحهٔ منفی هم به یک برمی‌گردد', () => {
      expect(paginate({ page: -5 }, 50).offset).toBe(0);
    });

    it('limit صفر به یک می‌رسد، نه صفر', () => {
      // limit صفر یعنی `LIMIT 0` و فهرستِ همیشه‌خالی.
      expect(paginate({ limit: 0 }, 50).limit).toBe(1);
    });

    it('limit بزرگ به دویست سقف می‌خورد', () => {
      // ⚠️ بدونِ سقف، `?limit=999999` کلِ جدول را می‌کشید — یعنی یک
      //    درخواستِ ساده به ابزارِ فشار بدل می‌شد.
      expect(paginate({ limit: 999_999 }, 10_000).limit).toBe(200);
    });
  });

  describe('شمارشِ صفحه', () => {
    it('صد قلم با بیست‌وچهارتایی، پنج صفحه', () => {
      expect(paginate({}, 100).pages).toBe(5);
    });

    it('تقسیمِ رسا، صفحهٔ اضافی نمی‌سازد', () => {
      expect(paginate({ limit: 10 }, 100).pages).toBe(10);
    });

    it('یک قلمِ اضافی، یک صفحهٔ اضافی می‌سازد', () => {
      expect(paginate({ limit: 10 }, 101).pages).toBe(11);
    });

    it('کاتالوگِ خالی هم یک صفحه دارد، نه صفر', () => {
      // ⚠️ «صفحهٔ ۱ از ۰» در رابط غلط به‌نظر می‌رسد و کاربر فکر
      //    می‌کند چیزی خراب است.
      expect(paginate({}, 0).pages).toBe(1);
    });
  });

  describe('جابه‌جاییِ صفحه', () => {
    it('صفحهٔ دو از قلمِ بیست‌وچهارم شروع می‌شود', () => {
      expect(paginate({ page: 2 }, 100).offset).toBe(24);
    });

    it('صفحهٔ پنج با ده‌تایی، از چهل', () => {
      expect(paginate({ page: 5, limit: 10 }, 100).offset).toBe(40);
    });
  });
});

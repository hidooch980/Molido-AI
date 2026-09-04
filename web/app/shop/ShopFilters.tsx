'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export type ShopParams = {
  search?: string;
  categoryId?: string;
  minPrice?: string;
  maxPrice?: string;
  sort?: string;
  limit?: string;
};

/**
 * صافیِ قیمت و مرتب‌سازی.
 *
 * ⚠️ صافی‌های فعلی **prop**‌اند، نه `useSearchParams()`.
 *
 *    نسخهٔ اول این قلاب را داشت — که طبیعی به نظر می‌رسید، چون کامپوننت
 *    کلاینت است و مقدارها در نشانی‌اند.  ولی `useSearchParams()` کلِ
 *    مسیر را از رندرِ سرور بیرون می‌برد.
 *
 *    اثرش در مرورگر اندازه‌گیری شد: کلِ محتوای صفحه دو بار در DOM
 *    می‌ماند — یکی رندرِ کلاینت، و یکی نسخهٔ جریان‌یافتهٔ سرور که در
 *    `div[hidden]` یتیم می‌شد.  با سه شناسهٔ تکراری، و با دو برابر
 *    شدنِ حجمِ DOM که روی کاتالوگِ دویست‌تایی بی‌اهمیت نیست.
 *
 *    سرور این مقدارها را از قبل در `searchParams` دارد.  دادنشان
 *    به‌عنوان prop هم قلاب را حذف می‌کند، هم صفحه را سرور نگه می‌دارد.
 *
 *    `useRouter` می‌ماند — آن این عارضه را ندارد.
 *
 * کارِ این نوار فقط نوشتن در نشانی است؛ سرور دوباره رندر می‌کند.  پس هر
 * صافی نشانیِ خودش را دارد — قابل اشتراک‌گذاری و قابل بازگشت با دکمهٔ
 * back.
 */
export default function ShopFilters({
  total,
  params,
}: {
  total: number;
  params: ShopParams;
}) {
  const router = useRouter();

  const [minPrice, setMin] = useState(params.minPrice ?? '');
  const [maxPrice, setMax] = useState(params.maxPrice ?? '');

  const sort = params.sort ?? 'name';
  const hasFilter = Boolean(params.minPrice ?? params.maxPrice);

  /** نشانی را با کلیدهای تازه می‌سازد؛ مقدار خالی کلید را برمی‌دارد. */
  function go(patch: Partial<ShopParams>) {
    const next = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...params, ...patch })) {
      if (v) next.set(k, String(v));
    }
    // با عوض شدن صافی، «نمایش بیشتر» باید از اول شروع کند — وگرنه
    // کاربر صافیِ تازه را با تعداد دفعهٔ قبل می‌بیند.
    next.delete('limit');
    router.push(`/shop?${next}`);
  }

  return (
    <form
      className="shop-filters"
      onSubmit={(e) => {
        e.preventDefault();
        go({ minPrice, maxPrice });
      }}
    >
      <div className="filter-group">
        <label htmlFor="f-min">قیمت از</label>
        <input
          id="f-min"
          type="number"
          inputMode="numeric"
          min={0}
          placeholder="۰"
          value={minPrice}
          onChange={(e) => setMin(e.target.value)}
        />
      </div>

      <div className="filter-group">
        <label htmlFor="f-max">تا</label>
        <input
          id="f-max"
          type="number"
          inputMode="numeric"
          min={0}
          placeholder="بدون سقف"
          value={maxPrice}
          onChange={(e) => setMax(e.target.value)}
        />
        <span className="filter-unit">ریال</span>
      </div>

      <button type="submit" className="btn sm">
        اعمال
      </button>

      {hasFilter ? (
        <button
          type="button"
          className="btn ghost sm"
          onClick={() => {
            setMin('');
            setMax('');
            go({ minPrice: '', maxPrice: '' });
          }}
        >
          حذف صافی
        </button>
      ) : null}

      <div className="filter-group filter-sort">
        <label htmlFor="f-sort">مرتب‌سازی</label>
        <select
          id="f-sort"
          value={sort}
          onChange={(e) =>
            go({ sort: e.target.value === 'name' ? '' : e.target.value })
          }
        >
          <option value="name">نام</option>
          <option value="price-asc">ارزان‌ترین</option>
          <option value="price-desc">گران‌ترین</option>
        </select>
      </div>

      <span className="filter-count shop-muted">
        {total.toLocaleString('fa-IR')} کالا
      </span>
    </form>
  );
}

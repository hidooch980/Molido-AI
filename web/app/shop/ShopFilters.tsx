'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';

/**
 * صافیِ قیمت و مرتب‌سازی.
 *
 * ⚠️ کلاینت است ولی صفحهٔ کاتالوگ سرور می‌ماند.
 *
 *    وسوسه‌اش هست که کل کاتالوگ کلاینت شود تا صافی «زنده» باشد.  ولی
 *    آن‌وقت موتور جستجو کالاها را نمی‌بیند و کاربرِ روی اتصال کند
 *    صفحهٔ سفید می‌گیرد.  پس فقط این نوار کلاینت است و کارش نوشتن در
 *    نشانی است؛ سرور دوباره رندر می‌کند.
 *
 *    نتیجه‌اش این هم هست که هر صافی نشانیِ خودش را دارد — قابل
 *    اشتراک‌گذاری و قابل بازگشت با دکمهٔ back.
 */
export default function ShopFilters({ total }: { total: number }) {
  const router = useRouter();
  const params = useSearchParams();

  const [minPrice, setMin] = useState(params.get('minPrice') ?? '');
  const [maxPrice, setMax] = useState(params.get('maxPrice') ?? '');

  const sort = params.get('sort') ?? 'name';
  const hasFilter = Boolean(params.get('minPrice') ?? params.get('maxPrice'));

  /** نشانی را با کلیدهای تازه می‌سازد؛ مقدار خالی کلید را برمی‌دارد. */
  function go(patch: Record<string, string>) {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
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
          onChange={(e) => go({ sort: e.target.value === 'name' ? '' : e.target.value })}
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

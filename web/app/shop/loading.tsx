/**
 * اسکلتِ کاتالوگ.
 *
 * Next.js این را در فاصلهٔ میان کلیک و آمدنِ داده نشان می‌دهد.
 *
 * ⚠️ تعداد کارت‌ها با `PAGE` در `page.tsx` یکی نیست و عمداً کمتر است
 *    (۸ به‌جای ۲۴).  اسکلت قرار نیست پیش‌بینیِ دقیق باشد؛ قرار است
 *    بگوید «دارد می‌آید» و جای صفحه را نگه دارد.  هشت کارت روی هر
 *    اندازهٔ صفحه‌ای بیش از یک ردیف را پر می‌کند، و ۲۴ اسکلتِ تپنده
 *    بیشتر شبیه شلوغی است تا انتظار.
 */
export default function ShopLoading() {
  return (
    <div className="shop-grid" aria-busy="true" aria-label="در حال بارگذاری کالاها">
      {Array.from({ length: 8 }, (_, i) => (
        <article key={i} className="product-card skeleton-card">
          <div className="skeleton skeleton-image" />
          <div className="product-body">
            <div className="skeleton skeleton-line" />
            <div className="skeleton skeleton-line short" />
            <div className="skeleton skeleton-btn" />
          </div>
        </article>
      ))}
    </div>
  );
}

import Link from 'next/link';

import { Icon } from '../../components/icons';
import { shopFetch } from '../../lib/shop-server';
import AddToCart from './AddToCart';
import ShopFilters from './ShopFilters';

type Product = {
  id: string;
  name: string;
  unit: string | null;
  price: string | number;
  stock: string | number;
  imageUrl: string | null;
  categoryName: string | null;
};

type Category = { id: string; name: string; productCount: string | number };

type Settings = {
  shopName?: string | null;
  isOpen?: boolean;
  freeShippingOver?: string | number | null;
};

const fa = (value: unknown) => Number(value ?? 0).toLocaleString('fa-IR');

/** زیر این تعداد، «آخرین موجودی» نشان داده می‌شود. */
const LOW_STOCK = 5;

/**
 * چند کالا در هر بار.
 *
 * ⚠️ عمداً همه با هم نمی‌آیند.
 *
 *    فروشگاهی با سیصد کالا اگر یک‌جا بیاید، روی موبایلِ ارزان کند
 *    می‌شود — و مشتری پیش از دیدنِ کالای سی‌ام تصمیمش را گرفته.
 *    این عدد با «نمایش بیشتر» بالا می‌رود و در نشانی می‌ماند، پس با
 *    دکمهٔ back هم درست کار می‌کند.
 */
const PAGE = 24;

/**
 * کاتالوگ — **کامپوننت سرور**.
 *
 * برخلاف صفحه‌های پنل که همه کلاینت‌اند، کاتالوگ باید در HTML اولیه بیاید:
 * موتور جستجو باید کالاها را ببیند، و روی اتصال کند کاربر نباید صفحهٔ
 * سفید ببیند.  تنها بخش تعاملی — دکمهٔ افزودن به سبد — کامپوننت کلاینت
 * جداست.
 */
export default async function ShopPage({
  searchParams,
}: {
  searchParams: Promise<{
    search?: string;
    categoryId?: string;
    minPrice?: string;
    maxPrice?: string;
    sort?: string;
    limit?: string;
  }>;
}) {
  const params = await searchParams;
  const search = params.search ?? '';
  const categoryId = params.categoryId ?? '';

  // سقفِ ۲۰۰ همان چیزی است که سرویس هم اعمال می‌کند؛ اینجا تکرارش
  // می‌کنیم تا دکمهٔ «نمایش بیشتر» فراتر از آن پیشنهاد نشود و کاربر
  // روی دکمه‌ای که کاری نمی‌کند کلیک نکند.
  const limit = Math.min(Math.max(Number(params.limit) || PAGE, PAGE), 200);

  const query = new URLSearchParams();
  if (search) query.set('search', search);
  if (categoryId) query.set('categoryId', categoryId);
  if (params.minPrice) query.set('minPrice', params.minPrice);
  if (params.maxPrice) query.set('maxPrice', params.maxPrice);
  if (params.sort) query.set('sort', params.sort);
  query.set('limit', String(limit));

  const [products, categories, settings] = await Promise.all([
    shopFetch<Product[]>(`/products?${query}`, []),
    shopFetch<Category[]>('/categories', []),
    shopFetch<Settings>('/settings', {}),
  ]);

  if (settings.isOpen === false) {
    return (
      <div className="shop-empty">
        <Icon name="clock" size={40} />
        <h2>فروشگاه موقتاً بسته است</h2>
        <p className="shop-muted">لطفاً بعداً مراجعه کنید.</p>
      </div>
    );
  }

  // دستهٔ خالی نمایش داده نمی‌شود: کلیک روی آن به صفحهٔ «کالایی یافت نشد»
  // می‌رسد که برای مشتری شبیه خرابی است.
  const visibleCategories = categories.filter(
    (item) => Number(item.productCount) > 0,
  );

  const activeCategory = visibleCategories.find((item) => item.id === categoryId);

  return (
    <>
      {settings.freeShippingOver ? (
        <div className="shop-banner">
          <Icon name="package" size={18} />
          ارسال رایگان برای خرید بالای {fa(settings.freeShippingOver)} ریال
        </div>
      ) : null}

      {visibleCategories.length > 0 ? (
        <nav className="shop-cats" aria-label="دسته‌بندی">
          <Link
            href="/shop"
            className={`cat-pill${categoryId ? '' : ' active'}`}
            aria-current={categoryId ? undefined : 'page'}
          >
            همه
          </Link>
          {visibleCategories.map((cat) => (
            <Link
              key={cat.id}
              href={`/shop?categoryId=${cat.id}`}
              className={`cat-pill${categoryId === cat.id ? ' active' : ''}`}
              aria-current={categoryId === cat.id ? 'page' : undefined}
            >
              {cat.name}
            </Link>
          ))}
        </nav>
      ) : null}

      {products.length > 0 || params.minPrice || params.maxPrice ? (
        <ShopFilters total={products.length} params={params} />
      ) : null}

      {search || activeCategory ? (
        <h1 className="shop-section-title">
          {search ? `نتیجهٔ جستجوی «${search}»` : activeCategory?.name}
          <span className="shop-muted" style={{ fontWeight: 400 }}>
            {' '}
            — {fa(products.length)} کالا
          </span>
        </h1>
      ) : null}

      {products.length === 0 ? (
        <div className="shop-empty">
          <Icon name="search" size={40} />
          <h2>کالایی یافت نشد</h2>
          <p className="shop-muted">
            {search
              ? `نتیجه‌ای برای «${search}» پیدا نشد.`
              : 'هنوز کالایی در فروشگاه نیست.'}
          </p>
          {search || categoryId ? (
            <p style={{ marginTop: 'var(--s-4)' }}>
              <Link href="/shop" className="btn ghost">
                دیدن همهٔ کالاها
              </Link>
            </p>
          ) : null}
        </div>
      ) : (
        <div className="shop-grid">
          {products.map((product) => {
            const stock = Number(product.stock);
            const available = stock > 0;

            return (
              <article
                key={product.id}
                className={`product-card${available ? '' : ' sold-out'}`}
              >
                <Link
                  href={`/shop/product/${product.id}`}
                  className="product-image"
                  aria-label={product.name}
                >
                  {product.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={product.imageUrl} alt="" loading="lazy" />
                  ) : (
                    <Icon name="package" size={40} />
                  )}

                  {/* کمبود موجودی پیش از قیمت دیده می‌شود؛ همان چیزی است
                      که تصمیم خرید را جلو می‌اندازد. */}
                  {!available ? (
                    <span className="product-flag">ناموجود</span>
                  ) : stock <= LOW_STOCK ? (
                    <span className="product-flag low">
                      {fa(stock)} عدد مانده
                    </span>
                  ) : null}
                </Link>

                <div className="product-body">
                  <Link
                    href={`/shop/product/${product.id}`}
                    className="product-name"
                  >
                    {product.name}
                  </Link>

                  <span className="product-price">
                    {fa(product.price)}
                    <span className="unit">
                      ریال{product.unit ? ` / ${product.unit}` : ''}
                    </span>
                  </span>

                  <AddToCart productId={product.id} disabled={!available} />
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* دکمه فقط وقتی که واقعاً چیزی بیشتر هست.
          `length === limit` یعنی سرویس تا سقف پر کرده، پس احتمالاً
          بیشتر هم هست.  اگر دقیقاً همان تعداد بود، یک بار دکمهٔ
          بی‌اثر دیده می‌شود — بهتر از پنهان کردنِ کالایی که هست. */}
      {products.length === limit && limit < 200 ? (
        <p className="shop-more">
          <Link
            href={`/shop?${new URLSearchParams({
              ...(search ? { search } : {}),
              ...(categoryId ? { categoryId } : {}),
              ...(params.minPrice ? { minPrice: params.minPrice } : {}),
              ...(params.maxPrice ? { maxPrice: params.maxPrice } : {}),
              ...(params.sort ? { sort: params.sort } : {}),
              limit: String(Math.min(limit + PAGE, 200)),
            })}`}
            className="btn ghost"
            scroll={false}
          >
            نمایش بیشتر
          </Link>
        </p>
      ) : null}
    </>
  );
}

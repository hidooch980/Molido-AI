import Link from 'next/link';

import { Icon } from '../../components/icons';
import { shopFetch } from '../../lib/shop-server';
import AddToCart from './AddToCart';

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
  searchParams: Promise<{ search?: string; categoryId?: string }>;
}) {
  const params = await searchParams;
  const search = params.search ?? '';
  const categoryId = params.categoryId ?? '';

  const query = new URLSearchParams();
  if (search) query.set('search', search);
  if (categoryId) query.set('categoryId', categoryId);

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

  const visibleCategories = categories.filter(
    (item) => Number(item.productCount) > 0,
  );

  return (
    <>
      {settings.freeShippingOver ? (
        <div
          className="shop-card"
          style={{
            marginBottom: 'var(--s-4)',
            borderInlineStart: '4px solid var(--s-success)',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--s-2)',
          }}
        >
          <Icon name="package" size={18} />
          ارسال رایگان برای خرید بالای {fa(settings.freeShippingOver)} ریال
        </div>
      ) : null}

      {visibleCategories.length > 0 ? (
        <nav
          aria-label="دسته‌بندی"
          style={{
            display: 'flex',
            gap: 'var(--s-2)',
            flexWrap: 'wrap',
            marginBottom: 'var(--s-6)',
          }}
        >
          <Link
            href="/shop"
            className={`btn ${categoryId ? 'ghost' : ''}`}
            style={{ textDecoration: 'none' }}
          >
            همه
          </Link>
          {visibleCategories.map((cat) => (
            <Link
              key={cat.id}
              href={`/shop?categoryId=${cat.id}`}
              className={`btn ${categoryId === cat.id ? '' : 'ghost'}`}
              style={{ textDecoration: 'none' }}
            >
              {cat.name}
            </Link>
          ))}
        </nav>
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
        </div>
      ) : (
        <div className="shop-grid">
          {products.map((product) => {
            const available = Number(product.stock) > 0;

            return (
              <article key={product.id} className="product-card">
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
                </Link>

                <div className="product-body">
                  <Link
                    href={`/shop/product/${product.id}`}
                    className="product-name"
                    style={{ color: 'inherit', textDecoration: 'none' }}
                  >
                    {product.name}
                  </Link>

                  <span
                    className={`product-stock ${available ? 'in-stock' : 'out-stock'}`}
                  >
                    {available ? 'موجود' : 'ناموجود'}
                  </span>

                  <span className="product-price">
                    {fa(product.price)}
                    <span className="shop-muted" style={{ fontWeight: 400 }}>
                      {' '}
                      ریال
                    </span>
                  </span>

                  <AddToCart productId={product.id} disabled={!available} />
                </div>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}

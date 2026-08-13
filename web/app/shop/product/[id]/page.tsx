import type { Metadata } from 'next';
import Link from 'next/link';

import { Icon } from '../../../../components/icons';
import { shopFetch } from '../../../../lib/shop-server';
import AddToCart from '../../AddToCart';

type Product = {
  id: string;
  name: string;
  sku: string | null;
  unit: string | null;
  description: string | null;
  imageUrl: string | null;
  price: string | number;
  stock: string | number;
  categoryName: string | null;
};

const fa = (value: unknown) => Number(value ?? 0).toLocaleString('fa-IR');

/** عنوان و توضیح صفحه از خود کالا می‌آید — همان چیزی که موتور جستجو و
 *  پیش‌نمایش پیام‌رسان‌ها نشان می‌دهند. */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const product = await shopFetch<Product | null>(`/products/${id}`, null);

  if (!product) return { title: 'کالا یافت نشد' };

  return {
    title: product.name,
    description:
      product.description ?? `${product.name} — ${fa(product.price)} ریال`,
  };
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const product = await shopFetch<Product | null>(`/products/${id}`, null);

  if (!product) {
    return (
      <div className="shop-empty">
        <Icon name="alert" size={40} />
        <h2>کالا یافت نشد</h2>
        <Link href="/shop" className="btn" style={{ textDecoration: 'none' }}>
          بازگشت به فروشگاه
        </Link>
      </div>
    );
  }

  const stock = Number(product.stock);
  const available = stock > 0;

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: 'var(--s-6)',
        alignItems: 'start',
      }}
    >
      <div
        className="product-image"
        style={{
          borderRadius: 'var(--s-radius)',
          border: '1px solid var(--s-border)',
        }}
      >
        {product.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={product.imageUrl} alt={product.name} />
        ) : (
          <Icon name="package" size={64} />
        )}
      </div>

      <div>
        {product.categoryName ? (
          <div className="shop-muted">{product.categoryName}</div>
        ) : null}

        <h1 style={{ margin: '4px 0 var(--s-3)' }}>{product.name}</h1>

        <div
          style={{
            fontSize: 26,
            fontWeight: 800,
            fontVariantNumeric: 'tabular-nums',
            marginBottom: 'var(--s-2)',
          }}
        >
          {fa(product.price)}
          <span className="shop-muted" style={{ fontSize: 16, fontWeight: 400 }}>
            {' '}
            ریال{product.unit ? ` / ${product.unit}` : ''}
          </span>
        </div>

        <div
          className={available ? 'in-stock' : 'out-stock'}
          style={{ fontWeight: 600, marginBottom: 'var(--s-4)' }}
        >
          {available ? `موجود (${fa(stock)})` : 'ناموجود'}
        </div>

        {product.description ? (
          <p style={{ lineHeight: 1.9, marginBottom: 'var(--s-4)' }}>
            {product.description}
          </p>
        ) : null}

        {available ? (
          <AddToCart productId={product.id} label="افزودن به سبد" full />
        ) : null}
      </div>
    </div>
  );
}

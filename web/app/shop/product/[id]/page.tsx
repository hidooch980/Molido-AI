import type { Metadata } from 'next';
import Link from 'next/link';

import { Icon } from '../../../../components/icons';
import { shopFetch } from '../../../../lib/shop-server';
import AddToCart from '../../AddToCart';
import Stars from '../../Stars';
import ReviewForm from '../../ReviewForm';

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

type Review = {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  customerName: string | null;
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
  // ⚠️ سه درخواست موازی، نه پشتِ سرِ هم: نظرها به کالا وابسته نیستند و
  //    زنجیره کردنشان صفحه را بی‌دلیل کند می‌کند.
  const [product, rating, reviews] = await Promise.all([
    shopFetch<Product | null>(`/products/${id}`, null),
    shopFetch<{ average: number | null; count: number }>(
      `/products/${id}/rating`,
      { average: null, count: 0 },
    ),
    shopFetch<Review[]>(`/products/${id}/reviews`, []),
  ]);

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
  // ⚠️ آستانهٔ فوریت.  «۳ عدد مانده» خرید را جلو می‌اندازد، ولی فقط
  //    وقتی راست باشد؛ نشان دادنش برای موجودیِ زیاد، اعتماد را خرج
  //    می‌کند و دفعهٔ بعد کسی باورش نمی‌کند.
  const lowStock = available && stock <= 5;

  /**
   * دادهٔ ساخت‌یافتهٔ schema.org.
   *
   * ⚠️ چرا لازم است؟
   *
   *    بدون این، گوگل صفحه را فقط متن می‌بیند: قیمت، موجودی و ارز را
   *    نمی‌فهمد و نتیجه‌اش در جست‌وجو بدونِ قیمت و ستاره نشان داده
   *    می‌شود.  همین یک تفاوت، نرخِ کلیک را جابه‌جا می‌کند.
   *
   *    پیام‌رسان‌ها هم موقعِ اشتراک‌گذاریِ لینک همین را می‌خوانند.
   *
   * ⚠️ `IRR` است نه `IRT`: مبلغ در پایگاه داده ریال ذخیره می‌شود و
   *    اعلامِ واحدِ غلط یعنی قیمتِ ده برابر در نتایجِ جست‌وجو.
   */
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    ...(product.description ? { description: product.description } : {}),
    ...(product.sku ? { sku: product.sku } : {}),
    ...(product.imageUrl ? { image: product.imageUrl } : {}),
    ...(product.categoryName ? { category: product.categoryName } : {}),
    offers: {
      '@type': 'Offer',
      price: Number(product.price),
      priceCurrency: 'IRR',
      availability: available
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
    },
  };

  return (
    <>
      {/* اسکریپت پیش از محتوا می‌آید تا خزنده زودتر ببیندش. */}
      <script
        type="application/ld+json"
        // ⚠️ `JSON.stringify` به‌تنهایی **کافی نیست**.
        //
        //    گیومه را فرار می‌دهد ولی `<` را نه.  نامِ کالایی که
        //    `</script>` داشته باشد، از همین بلوک بیرون می‌زند و هر
        //    HTMLای که بعدش بیاید اجرا می‌شود — یعنی XSS ذخیره‌شده،
        //    از راهِ فرمِ ثبتِ کالا.
        //
        //    آزمونِ محلی نشانش داد: رشتهٔ `</script>` عیناً در خروجی
        //    می‌نشست.  جایگزینیِ `<` با `<` داخلِ JSON معتبر است
        //    و خزنده همان نویسه را می‌خواند.
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c'),
        }}
      />

      {/* مسیر راهنما — کاربر باید بداند کجاست و راهِ برگشت داشته باشد */}
      <nav className="shop-crumbs" aria-label="مسیر">
        <Link href="/shop">فروشگاه</Link>
        {product.categoryName ? (
          <>
            <span aria-hidden="true">/</span>
            <span>{product.categoryName}</span>
          </>
        ) : null}
        <span aria-hidden="true">/</span>
        <span aria-current="page">{product.name}</span>
      </nav>

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

        <h1 style={{ margin: '4px 0 var(--s-2)' }}>{product.name}</h1>

        <div style={{ marginBottom: 'var(--s-3)' }}>
          <Stars value={rating.average} count={rating.count} />
        </div>

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
          style={{ fontWeight: 600, marginBottom: 'var(--s-2)' }}
        >
          {available ? `موجود (${fa(stock)})` : 'ناموجود'}
        </div>

        {lowStock ? (
          <div className="stock-warn" role="status">
            <Icon name="alert" size={15} />
            تنها {fa(stock)} عدد مانده
          </div>
        ) : null}

        {/* کدِ کالا — خریدارِ حرفه‌ای با همین سفارش می‌دهد و پیگیری
            می‌کند، نه با نام. */}
        {product.sku ? (
          <div className="shop-muted" style={{ fontSize: 13, marginBottom: 'var(--s-4)' }}>
            کد کالا: <span style={{ fontVariantNumeric: 'tabular-nums' }}>{product.sku}</span>
          </div>
        ) : null}

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

      {/* ---------- نظرها ---------- */}
      <section className="reviews">
        <h2 className="reviews-title">
          نظر خریداران
          {rating.count ? (
            <span className="shop-muted"> ({fa(rating.count)})</span>
          ) : null}
        </h2>

        {reviews.length === 0 ? (
          // ⚠️ متنِ خالی باید بگوید **چه کسی** می‌تواند نظر بدهد.
          //    «نظری نیست» تنها، کاربر را به فرمِ زیرش راهنمایی نمی‌کند.
          <p className="shop-muted">
            هنوز نظری ثبت نشده. اگر این کالا را خریده‌اید، اولین نفر باشید.
          </p>
        ) : (
          <ul className="review-list">
            {reviews.map((review) => (
              <li key={review.id}>
                <div className="review-head">
                  <Stars value={review.rating} size={13} />
                  <span className="shop-muted">
                    {review.customerName || 'خریدار'}
                  </span>
                </div>
                {review.comment ? <p>{review.comment}</p> : null}
              </li>
            ))}
          </ul>
        )}

        <ReviewForm productId={product.id} />
      </section>
    </>
  );
}

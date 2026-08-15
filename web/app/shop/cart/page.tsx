'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { Icon } from '../../../components/icons';
import { getCustomer, shopApi } from '../../../lib/shop-api';

type CartItem = {
  id: string;
  productId: string;
  name: string;
  qty: string | number;
  price: string | number;
  stock: string | number;
  unit: string | null;
  imageUrl: string | null;
};

type Cart = { items: CartItem[]; subtotal: number };

type Settings = {
  shippingFee?: string | number;
  freeShippingOver?: string | number | null;
  minOrderAmount?: string | number;
};

const fa = (value: unknown) => Number(value ?? 0).toLocaleString('fa-IR');

export default function CartPage() {
  const router = useRouter();

  const [cart, setCart] = useState<Cart | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState({
    shipAddress: '',
    receiverName: '',
    receiverPhone: '',
    note: '',
  });

  const load = useCallback(async () => {
    try {
      const [c, s] = await Promise.all([
        shopApi<Cart>('/cart'),
        shopApi<Settings>('/settings'),
      ]);
      setCart(c);
      setSettings(s);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در بارگذاری سبد');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();

    const customer = getCustomer();
    if (customer) {
      setForm((prev) => ({
        ...prev,
        receiverName: prev.receiverName || `${customer.firstName} ${customer.lastName}`,
        receiverPhone: prev.receiverPhone || customer.phone,
      }));
    }
  }, [load]);

  async function setQty(item: CartItem, qty: number) {
    setBusy(true);
    try {
      const updated = await shopApi<Cart>(`/cart/items/${item.id}`, {
        method: 'PATCH',
        body: { qty },
      });
      setCart(updated);
      window.dispatchEvent(new Event('shop-cart-changed'));
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در تغییر سبد');
    } finally {
      setBusy(false);
    }
  }

  async function checkout() {
    if (!getCustomer()) {
      // مقصد در آدرس می‌ماند تا پس از ورود، کاربر به همین‌جا برگردد.
      router.push('/shop/login?next=/shop/cart');
      return;
    }

    if (!form.shipAddress.trim()) {
      setError('نشانی تحویل را وارد کنید');
      return;
    }

    setBusy(true);
    try {
      const order = await shopApi<{ id: string; orderNo: string }>('/checkout', {
        method: 'POST',
        body: {
          shipAddress: form.shipAddress.trim(),
          receiverName: form.receiverName.trim() || undefined,
          receiverPhone: form.receiverPhone.trim() || undefined,
          note: form.note.trim() || undefined,
          paymentMethod: 'COD',
        },
      });

      window.dispatchEvent(new Event('shop-cart-changed'));
      router.push(`/shop/orders/${order.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در ثبت سفارش');
      setBusy(false);
    }
  }

  const subtotal = Number(cart?.subtotal ?? 0);
  const freeOver = settings?.freeShippingOver
    ? Number(settings.freeShippingOver)
    : null;
  const shipping =
    freeOver !== null && subtotal >= freeOver
      ? 0
      : Number(settings?.shippingFee ?? 0);
  const minimum = Number(settings?.minOrderAmount ?? 0);
  const belowMinimum = minimum > 0 && subtotal < minimum;

  if (loading) return <div className="shop-empty">در حال بارگذاری…</div>;

  if (!cart?.items?.length) {
    return (
      <div className="shop-empty">
        <Icon name="package" size={40} />
        <h2>سبد خرید خالی است</h2>
        <Link href="/shop" className="btn" style={{ textDecoration: 'none' }}>
          مشاهدهٔ کالاها
        </Link>
      </div>
    );
  }

  return (
    <>
      <h1 style={{ marginBottom: 'var(--s-4)' }}>سبد خرید</h1>
      {error ? <div className="shop-error">{error}</div> : null}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: 'var(--s-6)',
          alignItems: 'start',
        }}
      >
        {/* اقلام */}
        <div className="shop-card">
          {cart.items.map((item) => {
            const qty = Number(item.qty);
            const stock = Number(item.stock);

            return (
              <div key={item.id} className="cart-row">
                <div
                  className="product-image"
                  style={{ width: 64, height: 64, borderRadius: 8, flexShrink: 0 }}
                >
                  {item.imageUrl ? (
                    <img src={item.imageUrl} alt="" />
                  ) : (
                    <Icon name="package" size={22} />
                  )}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>{item.name}</div>
                  <div className="shop-muted">
                    {fa(item.price)} ریال
                    {item.unit ? ` / ${item.unit}` : ''}
                  </div>
                  {qty > stock ? (
                    <div style={{ color: 'var(--s-danger)', fontSize: 13 }}>
                      موجودی کافی نیست (موجود: {fa(stock)})
                    </div>
                  ) : null}
                </div>

                <div className="qty-control">
                  <button
                    type="button"
                    disabled={busy}
                    aria-label="کاهش"
                    onClick={() => void setQty(item, qty - 1)}
                  >
                    −
                  </button>
                  <span style={{ minWidth: 32, textAlign: 'center', fontWeight: 700 }}>
                    {fa(qty)}
                  </span>
                  <button
                    type="button"
                    disabled={busy}
                    aria-label="افزایش"
                    onClick={() => void setQty(item, qty + 1)}
                  >
                    +
                  </button>
                </div>

                <div style={{ fontWeight: 700, minWidth: 90, textAlign: 'end' }}>
                  {fa(Number(item.price) * qty)}
                </div>
              </div>
            );
          })}
        </div>

        {/* تسویه */}
        <div className="shop-card cart-summary">
          <h2 style={{ fontSize: 18, marginBottom: 'var(--s-3)' }}>تسویه</h2>

          <div className="shop-field">
            <label htmlFor="addr">نشانی تحویل</label>
            <textarea
              id="addr"
              rows={3}
              value={form.shipAddress}
              onChange={(e) => setForm({ ...form, shipAddress: e.target.value })}
            />
          </div>

          <div className="shop-field">
            <label htmlFor="rname">نام تحویل‌گیرنده</label>
            <input
              id="rname"
              value={form.receiverName}
              onChange={(e) => setForm({ ...form, receiverName: e.target.value })}
            />
          </div>

          <div className="shop-field">
            <label htmlFor="rphone">تلفن تحویل‌گیرنده</label>
            <input
              id="rphone"
              dir="ltr"
              value={form.receiverPhone}
              onChange={(e) => setForm({ ...form, receiverPhone: e.target.value })}
            />
          </div>

          <div className="shop-field">
            <label htmlFor="note">توضیح (اختیاری)</label>
            <input
              id="note"
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
            />
          </div>

          <div style={{ borderTop: '1px solid var(--s-border)', paddingTop: 'var(--s-3)' }}>
            <Row label="جمع کالاها" value={`${fa(subtotal)} ریال`} />
            <Row
              label="هزینهٔ ارسال"
              value={shipping === 0 ? 'رایگان' : `${fa(shipping)} ریال`}
              highlight={shipping === 0}
            />
            <Row
              label="مبلغ قابل پرداخت"
              value={`${fa(subtotal + shipping)} ریال`}
              bold
            />
          </div>

          {belowMinimum ? (
            <div className="shop-error" style={{ marginTop: 'var(--s-3)' }}>
              حداقل مبلغ سفارش {fa(minimum)} ریال است.
            </div>
          ) : null}

          <button
            type="button"
            className="mobile-hidden"
            style={{ width: '100%', marginTop: 'var(--s-3)' }}
            disabled={busy || belowMinimum}
            onClick={() => void checkout()}
          >
            {busy ? 'در حال ثبت…' : 'ثبت سفارش (پرداخت در محل)'}
          </button>

          <p className="shop-muted" style={{ marginTop: 'var(--s-2)', textAlign: 'center' }}>
            پرداخت هنگام تحویل کالا
          </p>
        </div>
      </div>

      {/* نوار چسبان موبایل: مبلغ و دکمه همیشه در دسترس‌اند.  بدون آن مشتری
          باید از ته فهرست سبد و کل فرم آدرس رد شود تا دکمه را ببیند. */}
      <div className="cart-bar">
        <span className="total">{fa(subtotal + shipping)} ریال</span>
        <button
          type="button"
          disabled={busy || belowMinimum}
          onClick={() => void checkout()}
        >
          {busy ? 'در حال ثبت…' : 'ثبت سفارش'}
        </button>
      </div>
    </>
  );
}

function Row({
  label,
  value,
  bold,
  highlight,
}: {
  label: string;
  value: string;
  bold?: boolean;
  highlight?: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        padding: '6px 0',
        fontWeight: bold ? 800 : 400,
        fontSize: bold ? 17 : 15,
        color: highlight ? 'var(--s-success)' : undefined,
      }}
    >
      <span>{label}</span>
      <span style={{ fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  );
}

'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { Icon } from '../../../components/icons';
import { getCustomer, shopApi } from '../../../lib/shop-api';

type Order = {
  id: string;
  orderNo: string;
  status: string;
  total: string | number;
  itemCount: string | number;
  placedAt: string;
  paymentStatus: string;
};

/** وضعیت سفارش از دید مشتری — نه کدهای داخلی. */
const STATUS: Record<string, { label: string; color: string }> = {
  PLACED: { label: 'ثبت شد', color: 'var(--s-warning)' },
  CONFIRMED: { label: 'تأیید شد', color: 'var(--s-primary)' },
  PREPARING: { label: 'در حال آماده‌سازی', color: 'var(--s-primary)' },
  SHIPPED: { label: 'ارسال شد', color: 'var(--s-primary)' },
  DELIVERED: { label: 'تحویل شد', color: 'var(--s-success)' },
  CANCELLED: { label: 'لغو شد', color: 'var(--s-danger)' },
};

const fa = (value: unknown) => Number(value ?? 0).toLocaleString('fa-IR');

export default function OrdersPage() {
  const router = useRouter();

  const [orders, setOrders] = useState<Order[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!getCustomer()) {
      router.push('/shop/login?next=/shop/orders');
      return;
    }

    try {
      const list = await shopApi<Order[]>('/my-orders');
      setOrders(Array.isArray(list) ? list : []);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در بارگذاری سفارش‌ها');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <div className="shop-empty">در حال بارگذاری…</div>;

  return (
    <>
      <h1 style={{ marginBottom: 'var(--s-4)' }}>سفارش‌های من</h1>
      {error ? <div className="shop-error">{error}</div> : null}

      {orders.length === 0 ? (
        <div className="shop-empty">
          <Icon name="receipt" size={40} />
          <h2>هنوز سفارشی ثبت نکرده‌اید</h2>
          <Link href="/shop" className="btn" style={{ textDecoration: 'none' }}>
            شروع خرید
          </Link>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 'var(--s-3)' }}>
          {orders.map((order) => {
            const state = STATUS[order.status] ?? {
              label: order.status,
              color: 'var(--s-text-dim)',
            };

            return (
              <Link
                key={order.id}
                href={`/shop/orders/${order.id}`}
                className="shop-card"
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 'var(--s-3)',
                  color: 'inherit',
                  textDecoration: 'none',
                  flexWrap: 'wrap',
                }}
              >
                <div>
                  <div style={{ fontWeight: 700 }}>{order.orderNo}</div>
                  <div className="shop-muted">
                    {new Date(order.placedAt).toLocaleDateString('fa-IR')} —{' '}
                    {fa(order.itemCount)} قلم
                  </div>
                </div>

                <div style={{ textAlign: 'end' }}>
                  <div style={{ fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
                    {fa(order.total)} ریال
                  </div>
                  <div style={{ color: state.color, fontWeight: 600, fontSize: 14 }}>
                    {state.label}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}

'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { Icon } from '../../../../components/icons';
import { shopApi } from '../../../../lib/shop-api';

type OrderItem = {
  id: string;
  name: string;
  qty: string | number;
  unitPrice: string | number;
  total: string | number;
};

type Order = {
  id: string;
  orderNo: string;
  status: string;
  subtotal: string | number;
  shippingFee: string | number;
  total: string | number;
  shipAddress: string | null;
  receiverName: string | null;
  receiverPhone: string | null;
  paymentMethod: string;
  paymentStatus: string;
  placedAt: string;
  items?: OrderItem[];
};

/** مراحل به‌ترتیب؛ نوار پیشرفت از همین ساخته می‌شود. */
const STEPS = ['PLACED', 'CONFIRMED', 'PREPARING', 'SHIPPED', 'DELIVERED'] as const;

const LABELS: Record<string, string> = {
  PLACED: 'ثبت شد',
  CONFIRMED: 'تأیید شد',
  PREPARING: 'آماده‌سازی',
  SHIPPED: 'ارسال شد',
  DELIVERED: 'تحویل شد',
  CANCELLED: 'لغو شد',
};

const fa = (value: unknown) => Number(value ?? 0).toLocaleString('fa-IR');

export default function OrderDetailPage() {
  const params = useParams<{ id: string }>();

  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setOrder(await shopApi<Order>(`/my-orders/${params.id}`));
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'سفارش یافت نشد');
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <div className="shop-empty">در حال بارگذاری…</div>;

  if (error || !order) {
    return (
      <div className="shop-empty">
        <Icon name="alert" size={40} />
        <h2>{error || 'سفارش یافت نشد'}</h2>
        <Link href="/shop/orders" className="btn" style={{ textDecoration: 'none' }}>
          سفارش‌های من
        </Link>
      </div>
    );
  }

  const cancelled = order.status === 'CANCELLED';
  const current = STEPS.indexOf(order.status as (typeof STEPS)[number]);

  return (
    <>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 'var(--s-4)',
          flexWrap: 'wrap',
          gap: 'var(--s-2)',
        }}
      >
        <h1>سفارش {order.orderNo}</h1>
        <Link href="/shop/orders" className="btn ghost" style={{ textDecoration: 'none' }}>
          بازگشت
        </Link>
      </div>

      {/* پیشرفت سفارش */}
      <div className="shop-card" style={{ marginBottom: 'var(--s-4)' }}>
        {cancelled ? (
          <div style={{ color: 'var(--s-danger)', fontWeight: 700 }}>
            <Icon name="x" size={18} /> این سفارش لغو شده است
          </div>
        ) : (
          <ol
            style={{
              display: 'flex',
              listStyle: 'none',
              padding: 0,
              margin: 0,
              gap: 'var(--s-1)',
            }}
          >
            {STEPS.map((step, index) => {
              const done = index <= current;

              return (
                <li key={step} style={{ flex: 1, textAlign: 'center' }}>
                  <div
                    style={{
                      height: 6,
                      borderRadius: 3,
                      background: done ? 'var(--s-success)' : 'var(--s-border)',
                      marginBottom: 6,
                    }}
                  />
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: done ? 700 : 400,
                      color: done ? 'var(--s-text)' : 'var(--s-text-dim)',
                    }}
                  >
                    {LABELS[step]}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: 'var(--s-4)',
          alignItems: 'start',
        }}
      >
        <div className="shop-card">
          <h2 style={{ fontSize: 17, marginBottom: 'var(--s-3)' }}>اقلام</h2>

          {(order.items ?? []).map((item) => (
            <div
              key={item.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '8px 0',
                borderBottom: '1px solid var(--s-border)',
                gap: 'var(--s-2)',
              }}
            >
              <span style={{ flex: 1 }}>{item.name}</span>
              <span className="shop-muted">×{fa(item.qty)}</span>
              <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                {fa(item.total)}
              </span>
            </div>
          ))}

          <div style={{ paddingTop: 'var(--s-3)' }}>
            <Line label="جمع کالاها" value={fa(order.subtotal)} />
            <Line
              label="هزینهٔ ارسال"
              value={Number(order.shippingFee) === 0 ? 'رایگان' : fa(order.shippingFee)}
            />
            <Line label="مبلغ کل" value={fa(order.total)} bold />
          </div>
        </div>

        <div className="shop-card">
          <h2 style={{ fontSize: 17, marginBottom: 'var(--s-3)' }}>تحویل</h2>

          <Field label="نشانی" value={order.shipAddress} />
          <Field label="تحویل‌گیرنده" value={order.receiverName} />
          <Field label="تلفن" value={order.receiverPhone} ltr />
          <Field
            label="پرداخت"
            value={order.paymentMethod === 'COD' ? 'در محل' : order.paymentMethod}
          />
          <Field
            label="تاریخ ثبت"
            value={new Date(order.placedAt).toLocaleDateString('fa-IR')}
          />
        </div>
      </div>
    </>
  );
}

function Line({
  label,
  value,
  bold,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        padding: '5px 0',
        fontWeight: bold ? 800 : 400,
        fontSize: bold ? 17 : 15,
      }}
    >
      <span>{label}</span>
      <span style={{ fontVariantNumeric: 'tabular-nums' }}>{value} ریال</span>
    </div>
  );
}

function Field({
  label,
  value,
  ltr,
}: {
  label: string;
  value: string | null;
  ltr?: boolean;
}) {
  return (
    <div style={{ marginBottom: 'var(--s-3)' }}>
      <div className="shop-muted">{label}</div>
      <div dir={ltr ? 'ltr' : undefined} style={{ textAlign: ltr ? 'end' : undefined }}>
        {value || '—'}
      </div>
    </div>
  );
}

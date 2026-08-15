'use client';

import { useCallback, useEffect, useState } from 'react';

import AppShell from '../../components/AppShell';
import { Icon } from '../../components/icons';
import { DataTable, NUM, ROW, TD, TOUCH } from '../../components/ui';
import { api } from '../../lib/api';
import { useI18n } from '../../lib/i18n-context';

type Order = {
  id: string;
  orderNo: string;
  status: string;
  customerName: string | null;
  receiverName: string | null;
  receiverPhone: string | null;
  shipAddress: string | null;
  note: string | null;
  subtotal: string | number;
  shippingFee: string | number;
  total: string | number;
  itemCount: string | number;
  placedAt: string;
  saleId: string | null;
};

type OrderItem = {
  id: string;
  name: string;
  unit: string | null;
  qty: string | number;
  price: string | number;
  total: string | number;
};

type Detail = Order & { items: OrderItem[] };

type Stats = {
  newOrders: string | number;
  openOrders: string | number;
  monthSales: string | number;
  onlineProducts: string | number;
};

/**
 * وضعیت‌ها به ترتیب واقعیِ کار.
 *
 * `PLACED` مسیر جدایی دارد: تأییدش یک **سفارش فروش** می‌سازد و کار را به
 * زنجیرهٔ موجود می‌سپارد (فاکتور، کسر موجودی، سند حسابداری).  پس دکمه‌اش
 * «تأیید» است نه «تغییر وضعیت» — و برگشت‌پذیر نیست.
 */
const FLOW = ['PLACED', 'CONFIRMED', 'PREPARING', 'SHIPPED', 'DELIVERED'] as const;

const STATUS_LABEL: Record<string, string> = {
  PLACED: 'ordPlaced',
  CONFIRMED: 'ordConfirmed',
  PREPARING: 'ordPreparing',
  SHIPPED: 'ordShipped',
  DELIVERED: 'ordDelivered',
  CANCELLED: 'ordCancelled',
};

const STATUS_COLOR: Record<string, string> = {
  PLACED: 'var(--warning)',
  CONFIRMED: 'var(--primary)',
  PREPARING: 'var(--primary)',
  SHIPPED: 'var(--primary)',
  DELIVERED: 'var(--success)',
  CANCELLED: 'var(--danger)',
};

export default function OnlineOrdersPage() {
  const { t, locale } = useI18n();

  const [orders, setOrders] = useState<Order[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [filter, setFilter] = useState('');
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const fa = useCallback(
    (value: unknown) => Number(value ?? 0).toLocaleString(locale),
    [locale],
  );

  const load = useCallback(async () => {
    try {
      const query = filter ? `?status=${filter}` : '';
      const [list, summary] = await Promise.all([
        api<Order[]>(`/shop-admin/orders${query}`),
        api<Stats>('/shop-admin/stats'),
      ]);

      setOrders(Array.isArray(list) ? list : []);
      setStats(summary);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('fetchError'));
    } finally {
      setLoading(false);
    }
  }, [filter, t]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * سفارش تازه باید دیده شود بی‌آنکه کسی صفحه را تازه کند.
   *
   * فروشگاه این صفحه را تمام روز باز نگه می‌دارد؛ سفارشی که نیم ساعت
   * دیده نشود، مشتری‌ای است که رفته.
   */
  useEffect(() => {
    const timer = setInterval(() => void load(), 60_000);
    return () => clearInterval(timer);
  }, [load]);

  async function open(id: string) {
    try {
      setDetail(await api<Detail>(`/shop-admin/orders/${id}`));
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('fetchError'));
    }
  }

  async function confirm(id: string) {
    setBusy(id);
    setError('');

    try {
      await api(`/shop-admin/orders/${id}/confirm`, { method: 'POST' });
      await load();
      if (detail?.id === id) await open(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('saveError'));
    } finally {
      setBusy('');
    }
  }

  async function advance(id: string, status: string) {
    setBusy(id);
    setError('');

    try {
      await api(`/shop-admin/orders/${id}/status`, {
        method: 'PATCH',
        body: { status },
      });
      await load();
      if (detail?.id === id) await open(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('saveError'));
    } finally {
      setBusy('');
    }
  }

  /** وضعیت بعدی در زنجیره؛ `null` یعنی کار سفارش تمام است. */
  function nextStatus(status: string): string | null {
    const index = FLOW.indexOf(status as (typeof FLOW)[number]);
    if (index < 0 || index >= FLOW.length - 1) return null;
    return FLOW[index + 1];
  }

  return (
    <AppShell
      title={t('onlineOrdersTitle')}
      subtitle={t('onlineOrdersSubtitle')}
      actions={
        <button type="button" className="btn-sm" onClick={() => void load()}>
          {t('refresh')}
        </button>
      }
    >
      {error ? <div className="error">{error}</div> : null}

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon">
            <Icon name="inbox" size={22} />
          </div>
          <div className="stat-label">{t('newOrders')}</div>
          <div className="stat-value">{fa(stats?.newOrders)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">
            <Icon name="clock" size={22} />
          </div>
          <div className="stat-label">{t('openOrders')}</div>
          <div className="stat-value">{fa(stats?.openOrders)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">
            <Icon name="chart" size={22} />
          </div>
          <div className="stat-label">{t('monthSales')}</div>
          <div className="stat-value">{fa(stats?.monthSales)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">
            <Icon name="package" size={22} />
          </div>
          <div className="stat-label">{t('onlineProducts')}</div>
          <div className="stat-value">{fa(stats?.onlineProducts)}</div>
        </div>
      </div>

      <div className="card">
        <select
          style={TOUCH}
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          aria-label={t('status')}
        >
          <option value="">{t('allStatuses')}</option>
          {[...FLOW, 'CANCELLED'].map((status) => (
            <option key={status} value={status}>
              {t(STATUS_LABEL[status])}
            </option>
          ))}
        </select>
      </div>

      <DataTable
        headers={[
          t('orderNo'),
          t('customer'),
          t('items'),
          t('total'),
          t('status'),
          t('actions'),
        ]}
        empty={t('noOrders')}
        loading={loading}
        loadingLabel={t('loading')}
        rows={orders.length}
      >
        {orders.map((order) => {
          const next = nextStatus(order.status);
          const working = busy === order.id;

          return (
            <tr key={order.id} style={ROW}>
              <td style={TD}>
                <button
                  type="button"
                  className="link"
                  onClick={() => void open(order.id)}
                >
                  {order.orderNo}
                </button>
                <div className="muted">
                  {new Date(order.placedAt).toLocaleString(locale)}
                </div>
              </td>
              <td style={TD}>
                {order.receiverName ?? order.customerName ?? '—'}
                <div className="muted">{order.receiverPhone ?? ''}</div>
              </td>
              <td style={{ ...TD, ...NUM }}>{fa(order.itemCount)}</td>
              <td style={{ ...TD, ...NUM }}>{fa(order.total)}</td>
              <td style={TD}>
                <span style={{ color: STATUS_COLOR[order.status], fontWeight: 700 }}>
                  {t(STATUS_LABEL[order.status] ?? 'unknown')}
                </span>
              </td>
              <td style={TD}>
                {/* تأیید مسیر جدایی دارد: سفارش فروش می‌سازد، پس با
                    «مرحلهٔ بعد» یکی نیست. */}
                {order.status === 'PLACED' ? (
                  <button
                    type="button"
                    className="btn-sm"
                    disabled={working}
                    onClick={() => void confirm(order.id)}
                  >
                    {working ? '…' : t('confirmOrder')}
                  </button>
                ) : next ? (
                  <button
                    type="button"
                    className="btn-sm"
                    disabled={working}
                    onClick={() => void advance(order.id, next)}
                  >
                    {working ? '…' : t(STATUS_LABEL[next])}
                  </button>
                ) : null}

                {order.status !== 'DELIVERED' && order.status !== 'CANCELLED' ? (
                  <button
                    type="button"
                    className="btn-sm ghost"
                    disabled={working}
                    onClick={() => void advance(order.id, 'CANCELLED')}
                  >
                    {t('cancel')}
                  </button>
                ) : null}
              </td>
            </tr>
          );
        })}
      </DataTable>

      {/* جزئیات: نشانی و اقلام، چیزی که برای بسته‌بندی و ارسال لازم است. */}
      {detail ? (
        <div className="card">
          <div className="row-between">
            <h3>
              {t('orderNo')} {detail.orderNo}
            </h3>
            <button type="button" className="btn-sm ghost" onClick={() => setDetail(null)}>
              {t('close')}
            </button>
          </div>

          <p>
            <strong>{detail.receiverName ?? detail.customerName ?? '—'}</strong>
            {detail.receiverPhone ? (
              // تماس با یک لمس: هنگام تحویل، صندوق‌دار شماره را دستی
              // یادداشت نمی‌کند.
              <>
                {' — '}
                <a href={`tel:${detail.receiverPhone}`}>{detail.receiverPhone}</a>
              </>
            ) : null}
          </p>
          {detail.shipAddress ? <p className="muted">{detail.shipAddress}</p> : null}
          {detail.note ? <p className="muted">{detail.note}</p> : null}

          <table className="table">
            <thead>
              <tr>
                <th>{t('product')}</th>
                <th>{t('quantity')}</th>
                <th>{t('price')}</th>
                <th>{t('total')}</th>
              </tr>
            </thead>
            <tbody>
              {detail.items?.map((item) => (
                <tr key={item.id}>
                  <td style={TD}>
                    {item.name}
                    <span className="muted"> {item.unit ?? ''}</span>
                  </td>
                  <td style={{ ...TD, ...NUM }}>{fa(item.qty)}</td>
                  <td style={{ ...TD, ...NUM }}>{fa(item.price)}</td>
                  <td style={{ ...TD, ...NUM }}>{fa(item.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="row-between">
            <span>{t('shippingFee')}</span>
            <strong>{fa(detail.shippingFee)}</strong>
          </div>
          <div className="row-between grand">
            <span>{t('total')}</span>
            <strong>{fa(detail.total)}</strong>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}

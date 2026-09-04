'use client';

import { useCallback, useEffect, useState } from 'react';

import AppShell from '../../components/AppShell';
import { api } from '../../lib/api';
import { useI18n } from '../../lib/i18n-context';

type Stats = {
  openQuotations?: number;
  openOrders?: number;
  openOrdersValue?: string | number;
  openShipments?: number;
};

type Quotation = {
  id: string;
  quoteNo: string;
  status: string;
  totalAmount: string | number;
  validUntil: string | null;
  customerName?: string | null;
};

type OrderItem = {
  id: string;
  name: string;
  qty: string | number;
  shippedQty: string | number;
  unitPrice: string | number;
};

type SalesOrder = {
  id: string;
  orderNo: string;
  status: string;
  totalAmount: string | number;
  quoteNo?: string | null;
  customerName?: string | null;
  items?: OrderItem[];
};

type Shipment = {
  id: string;
  trackingNo: string;
  status: string;
  carrier: string | null;
  deliveredAt: string | null;
};

const TABS = [
  { key: 'quotations', label: 'tabQuotations' },
  { key: 'orders', label: 'tabSalesOrders' },
  { key: 'shipments', label: 'tabShipments' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

const STAT_CARDS: Array<{ key: keyof Stats; label: string; icon: string }> = [
  { key: 'openQuotations', label: 'statOpenQuotations', icon: '📄' },
  { key: 'openOrders', label: 'statOpenOrdersC', icon: '📋' },
  { key: 'openOrdersValue', label: 'statOpenValue', icon: '💰' },
  { key: 'openShipments', label: 'statOpenShipments', icon: '🚚' },
];

// رنگ وضعیت: سبز = تمام‌شده، کهربایی = در جریان، قرمز = متوقف.  همان
// معناشناسی رنگی که در صفحهٔ رستوران هم استفاده شده تا کاربر یک زبان رنگی
// در کل برنامه یاد بگیرد.
const STATUS_COLOR: Record<string, string> = {
  DRAFT: 'var(--text-dim)',
  SENT: 'var(--warning)',
  ACCEPTED: 'var(--success)',
  REJECTED: 'var(--danger)',
  EXPIRED: 'var(--danger)',
  CONVERTED: 'var(--accent)',
  PENDING: 'var(--warning)',
  CONFIRMED: 'var(--accent)',
  PARTIALLY_SHIPPED: 'var(--warning)',
  SHIPPED: 'var(--accent)',
  INVOICED: 'var(--success)',
  IN_TRANSIT: 'var(--warning)',
  DELIVERED: 'var(--success)',
  RETURNED: 'var(--danger)',
  CANCELLED: 'var(--danger)',
};

/** دکمه‌ها روی تبلت لمس می‌شوند؛ کمتر از ۴۴ پیکسل قابل اتکا نیست. */
const TOUCH: React.CSSProperties = {
  minHeight: 44,
  minWidth: 44,
  padding: '10px 16px',
};

export default function SalesChainPage() {
  const { t, locale } = useI18n();

  const [tab, setTab] = useState<TabKey>('quotations');
  const [stats, setStats] = useState<Stats | null>(null);
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [openOrder, setOpenOrder] = useState<SalesOrder | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const fa = useCallback(
    (value: unknown) => Number(value ?? 0).toLocaleString(locale),
    [locale],
  );

  const load = useCallback(async () => {
    try {
      const [s, q, o, sh] = await Promise.all([
        api<Stats>('/sales-chain/stats'),
        api<Quotation[]>('/quotations'),
        api<SalesOrder[]>('/sales-orders'),
        api<Shipment[]>('/shipments'),
      ]);

      setStats(s);
      setQuotations(q ?? []);
      setOrders(o ?? []);
      setShipments(sh ?? []);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('fetchError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  /** هر عملیات زنجیره: اجرا، سپس بارگذاری دوباره تا وضعیت‌ها تازه شوند. */
  async function act(path: string, body?: unknown) {
    setBusy(true);
    try {
      await api(path, { method: 'POST', body: body ?? {} });
      await load();
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('actionError'));
    } finally {
      setBusy(false);
    }
  }

  async function showOrder(id: string) {
    try {
      setOpenOrder(await api<SalesOrder>(`/sales-chain/orders/${id}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('actionError'));
    }
  }

  /**
   * ثبت ارسال: برای هر قلمِ باقی‌مانده مقدار پرسیده می‌شود.  عمداً ساده نگه
   * داشته شده — مقدار پیش‌فرض همان باقی‌ماندهٔ کامل است، چون در عمل بیشتر
   * ارسال‌ها کامل‌اند و انبار‌دار نباید برای حالت رایج چیزی تایپ کند.
   */
  async function ship(order: SalesOrder) {
    const lines: Array<{ orderItemId: string; qty: number }> = [];

    for (const item of order.items ?? []) {
      const left = Number(item.qty) - Number(item.shippedQty);
      if (left <= 0) continue;

      const answer = window.prompt(
        `${item.name} — ${t('remaining')}: ${fa(left)}`,
        String(left),
      );
      if (answer === null) return;

      const qty = Number(answer);
      if (qty > 0) lines.push({ orderItemId: item.id, qty });
    }

    if (!lines.length) return;

    await act('/sales-chain/shipments', {
      salesOrderId: order.id,
      items: lines,
    });
    setOpenOrder(null);
  }

  function badge(status: string, prefix: string) {
    return (
      <span
        style={{
          color: STATUS_COLOR[status] ?? 'var(--text-dim)',
          fontWeight: 600,
        }}
      >
        {t(`${prefix}${status}`)}
      </span>
    );
  }

  return (
    <AppShell
      title={t('chainTitle')}
      subtitle={t('chainSubtitle')}
      actions={
        <button type="button" className="btn-sm" onClick={() => void load()}>
          {t('refresh')}
        </button>
      }
    >
      {error ? <div className="error">{error}</div> : null}

      <div className="stats-grid">
        {loading && !stats
          ? STAT_CARDS.map((c) => <div key={c.key} className="skeleton" />)
          : STAT_CARDS.map((c) => (
              <div key={c.key} className="stat-card">
                <div className="stat-icon">{c.icon}</div>
                <div className="stat-label">{t(c.label)}</div>
                <div className="stat-value">{fa(stats?.[c.key])}</div>
              </div>
            ))}
      </div>

      <div className="lang-pills" style={{ margin: '18px 0' }}>
        {TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`lang-pill${tab === item.key ? ' active' : ''}`}
            onClick={() => setTab(item.key)}
          >
            {t(item.label)}
          </button>
        ))}
      </div>

      {/* پیش‌فاکتورها */}
      {tab === 'quotations' ? (
        <div className="card">
          <h3 style={{ marginBottom: 12 }}>{t('tabQuotations')}</h3>

          {quotations.length === 0 ? (
            <p className="muted">{t('noQuotations')}</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr style={{ textAlign: 'right', color: 'var(--text-dim)' }}>
                    <th style={{ padding: 8 }}>{t('quoteNo')}</th>
                    <th style={{ padding: 8 }}>{t('customer')}</th>
                    <th style={{ padding: 8 }}>{t('colAmount')}</th>
                    <th style={{ padding: 8 }}>{t('validUntil')}</th>
                    <th style={{ padding: 8 }}>{t('status')}</th>
                    <th style={{ padding: 8 }}>{t('actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {quotations.map((q) => (
                    <tr key={q.id} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: 8 }}>{q.quoteNo}</td>
                      <td style={{ padding: 8 }}>{q.customerName ?? '—'}</td>
                      <td style={{ padding: 8 }}>{fa(q.totalAmount)}</td>
                      <td style={{ padding: 8 }}>
                        {q.validUntil
                          ? new Date(q.validUntil).toLocaleDateString(locale)
                          : '—'}
                      </td>
                      <td style={{ padding: 8 }}>{badge(q.status, 'qStatus')}</td>
                      <td style={{ padding: 8 }}>
                        {['DRAFT', 'SENT', 'ACCEPTED'].includes(q.status) ? (
                          <button
                            type="button"
                            style={TOUCH}
                            disabled={busy}
                            onClick={() =>
                              void act(`/sales-chain/quotations/${q.id}/convert`)
                            }
                          >
                            {t('convertToOrder')}
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}

      {/* سفارش‌های فروش */}
      {tab === 'orders' ? (
        <div className="card">
          <h3 style={{ marginBottom: 12 }}>{t('tabSalesOrders')}</h3>

          {orders.length === 0 ? (
            <p className="muted">{t('noOrders')}</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr style={{ textAlign: 'right', color: 'var(--text-dim)' }}>
                    <th style={{ padding: 8 }}>{t('orderNoCol')}</th>
                    <th style={{ padding: 8 }}>{t('customer')}</th>
                    <th style={{ padding: 8 }}>{t('colAmount')}</th>
                    <th style={{ padding: 8 }}>{t('status')}</th>
                    <th style={{ padding: 8 }}>{t('actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={o.id} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: 8 }}>{o.orderNo}</td>
                      <td style={{ padding: 8 }}>{o.customerName ?? '—'}</td>
                      <td style={{ padding: 8 }}>{fa(o.totalAmount)}</td>
                      <td style={{ padding: 8 }}>{badge(o.status, 'oStatus')}</td>
                      <td
                        style={{
                          padding: 8,
                          display: 'flex',
                          gap: 8,
                          flexWrap: 'wrap',
                        }}
                      >
                        <button
                          type="button"
                          style={TOUCH}
                          onClick={() => void showOrder(o.id)}
                        >
                          {t('shipItems')}
                        </button>
                        {!['INVOICED', 'CANCELLED'].includes(o.status) ? (
                          <button
                            type="button"
                            style={TOUCH}
                            disabled={busy}
                            onClick={() =>
                              void act(`/sales-chain/orders/${o.id}/invoice`)
                            }
                          >
                            {t('issueInvoice')}
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* جزئیات سفارش انتخاب‌شده — سفارش/ارسال‌شده/باقی‌مانده */}
          {openOrder ? (
            <div
              className="card"
              style={{ marginTop: 16, borderColor: 'var(--primary)' }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 10,
                }}
              >
                <strong>{openOrder.orderNo}</strong>
                <button
                  type="button"
                  className="ghost"
                  style={TOUCH}
                  onClick={() => setOpenOrder(null)}
                >
                  {t('close')}
                </button>
              </div>

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr style={{ textAlign: 'right', color: 'var(--text-dim)' }}>
                      <th style={{ padding: 8 }}>{t('itemName')}</th>
                      <th style={{ padding: 8 }}>{t('ordered')}</th>
                      <th style={{ padding: 8 }}>{t('shipped')}</th>
                      <th style={{ padding: 8 }}>{t('remaining')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(openOrder.items ?? []).map((item) => {
                      const left = Number(item.qty) - Number(item.shippedQty);

                      return (
                        <tr
                          key={item.id}
                          style={{ borderTop: '1px solid var(--border)' }}
                        >
                          <td style={{ padding: 8 }}>{item.name}</td>
                          <td style={{ padding: 8 }}>{fa(item.qty)}</td>
                          <td style={{ padding: 8 }}>{fa(item.shippedQty)}</td>
                          <td
                            style={{
                              padding: 8,
                              color: left > 0 ? 'var(--warning)' : 'var(--success)',
                            }}
                          >
                            {fa(left)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <button
                type="button"
                style={{ ...TOUCH, marginTop: 12 }}
                disabled={busy}
                onClick={() => void ship(openOrder)}
              >
                {t('shipItems')}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* حواله‌ها */}
      {tab === 'shipments' ? (
        <div className="card">
          <h3 style={{ marginBottom: 12 }}>{t('tabShipments')}</h3>

          {shipments.length === 0 ? (
            <p className="muted">{t('noShipments')}</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr style={{ textAlign: 'right', color: 'var(--text-dim)' }}>
                    <th style={{ padding: 8 }}>{t('trackingNo')}</th>
                    <th style={{ padding: 8 }}>{t('status')}</th>
                    <th style={{ padding: 8 }}>{t('date')}</th>
                    <th style={{ padding: 8 }}>{t('actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {shipments.map((sh) => (
                    <tr key={sh.id} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: 8 }}>{sh.trackingNo}</td>
                      <td style={{ padding: 8 }}>{badge(sh.status, 'sStatus')}</td>
                      <td style={{ padding: 8 }}>
                        {sh.deliveredAt
                          ? new Date(sh.deliveredAt).toLocaleDateString(locale)
                          : '—'}
                      </td>
                      <td style={{ padding: 8 }}>
                        {!['DELIVERED', 'CANCELLED'].includes(sh.status) ? (
                          <button
                            type="button"
                            style={TOUCH}
                            disabled={busy}
                            onClick={() =>
                              void act(`/sales-chain/shipments/${sh.id}/deliver`)
                            }
                          >
                            {t('markDelivered')}
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}
    </AppShell>
  );
}

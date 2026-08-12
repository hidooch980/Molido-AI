'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { API_URL, api, getToken } from '../../lib/api';
import AppShell from '../../components/AppShell';
import { useI18n } from '../../lib/i18n-context';

type Stats = {
  openOrders?: number;
  todayOrders?: number;
  todaySales?: number;
  avgTicket?: number;
  guests?: number;
  tables?: number;
  freeTables?: number;
  occupancyRate?: number;
  menuCount?: number;
  unavailableItems?: number;
  todayReservations?: number;
};

type Table = {
  id: string;
  tableNo: string;
  capacity: number;
  status: string;
  area?: { id: string; name: string } | null;
  orders?: Array<{ id: string; orderNo: string; total: string | number }>;
};

type MenuItem = {
  id: string;
  name: string;
  price: string | number;
  station: string;
  isAvailable: boolean;
};

type MenuGroup = {
  id: string | null;
  name: string;
  items: MenuItem[];
};

type OrderItem = {
  id: string;
  name: string;
  qty: string | number;
  status: string;
  station: string;
  note?: string | null;
  waitingMinutes?: number;
  order?: {
    id: string;
    orderNo: string;
    type: string;
    table?: { tableNo: string } | null;
  };
};

type Order = {
  id: string;
  orderNo: string;
  type: string;
  status: string;
  total: string | number;
  guestCount: number;
  openedAt: string;
  table?: { tableNo: string } | null;
  items?: OrderItem[];
};

// برچسب‌ها کلید ترجمه‌اند، نه متن آماده — متن در زمان رندر و با زبان فعال
// ساخته می‌شود.
const TABLE_STATUS: Record<string, { key: string; color: string }> = {
  FREE: { key: 'tableFree', color: '#34d399' },
  OCCUPIED: { key: 'tableOccupied', color: '#f87171' },
  RESERVED: { key: 'tableReserved', color: '#fbbf24' },
  CLEANING: { key: 'tableCleaning', color: '#22d3ee' },
  OUT_OF_SERVICE: { key: 'tableOutOfService', color: '#96a2c0' },
};

const ORDER_STATUS: Record<string, string> = {
  OPEN: 'orderOpen',
  IN_KITCHEN: 'orderInKitchen',
  READY: 'ready',
  SERVED: 'served',
  PAID: 'orderPaid',
  CANCELLED: 'cancelled',
};

const ITEM_STATUS: Record<string, string> = {
  PENDING: 'itemPending',
  PREPARING: 'preparing',
  READY: 'ready',
  SERVED: 'served',
  CANCELLED: 'cancelled',
};

const TABS = [
  { key: 'tables', label: 'tabTables' },
  { key: 'orders', label: 'tabOrders' },
  { key: 'kitchen', label: 'tabKitchen' },
  { key: 'menu', label: 'tabMenu' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

const STAT_CARDS: Array<{ key: keyof Stats; label: string; icon: string; money?: boolean }> = [
  { key: 'todaySales', label: 'statTodaySales', icon: '💰', money: true },
  { key: 'todayOrders', label: 'statTodayOrders', icon: '🧾' },
  { key: 'openOrders', label: 'statOpenOrders', icon: '⏳' },
  { key: 'avgTicket', label: 'statAvgTicket', icon: '📊', money: true },
  { key: 'freeTables', label: 'statFreeTables', icon: '🪑' },
  { key: 'occupancyRate', label: 'statOccupancy', icon: '📈' },
  { key: 'guests', label: 'statGuestsToday', icon: '👥' },
  { key: 'todayReservations', label: 'statReservations', icon: '📅' },
];

export default function RestaurantPage() {
  const { t, locale } = useI18n();
  const [tab, setTab] = useState<TabKey>('tables');
  const [stats, setStats] = useState<Stats | null>(null);
  const [tables, setTables] = useState<Table[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [kitchen, setKitchen] = useState<OrderItem[]>([]);
  const [menu, setMenu] = useState<MenuGroup[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  // عدد با زبان فعال قالب‌بندی می‌شود؛ پیش از این همیشه فارسی بود و در
  // نمای انگلیسی ارقام فارسی نشان داده می‌شد.
  const fa = useCallback(
    (value: unknown) => Number(value ?? 0).toLocaleString(locale),
    [locale],
  );

  const load = useCallback(async () => {
    try {
      const [s, t, o, k, m] = await Promise.all([
        api<Stats>('/restaurant/stats'),
        api<Table[]>('/restaurant/tables'),
        api<Order[]>('/restaurant/orders?open=true'),
        api<OrderItem[]>('/restaurant/kitchen'),
        api<MenuGroup[]>('/restaurant/menu?all=1'),
      ]);

      setStats(s);
      setTables(t);
      setOrders(o);
      setKitchen(k);
      setMenu(m);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('fetchError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();

    // به‌روزرسانی خودکار برای صفحه آشپزخانه
    const timer = setInterval(() => void load(), 30_000);

    return () => clearInterval(timer);
  }, [load]);

  async function act(path: string, body?: unknown) {
    try {
      await api(path, { method: 'POST', body });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('actionError'));
    }
  }

  /** رسید با توکن گرفته می‌شود و در پنجره جدید باز می‌شود */
  async function openReceipt(orderId: string) {
    try {
      const response = await fetch(
        `${API_URL}/restaurant/orders/${orderId}/receipt`,
        { headers: { Authorization: `Bearer ${getToken() ?? ''}` } },
      );

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const html = await response.text();
      const win = window.open('', '_blank');

      if (win) {
        win.document.write(html);
        win.document.close();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('receiptError'));
    }
  }

  async function patch(path: string, body: unknown) {
    try {
      await api(path, { method: 'PATCH', body });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('actionError'));
    }
  }

  const kitchenByStation = useMemo(() => {
    const groups = new Map<string, OrderItem[]>();

    kitchen.forEach((item) => {
      const list = groups.get(item.station) ?? [];
      list.push(item);
      groups.set(item.station, list);
    });

    return Array.from(groups.entries());
  }, [kitchen]);

  return (
    <AppShell
      title={t('restaurantTitle')}
      subtitle={t('restaurantSubtitle')}
      actions={
        <button type="button" className="btn-sm" onClick={() => void load()}>
          {t('refresh')}
        </button>
      }
    >
      {error ? <div className="error">{error}</div> : null}

      {/* آمار */}
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

      {/* تب‌ها */}
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

      {/* میزها */}
      {tab === 'tables' ? (
        <div className="card">
          <h3 style={{ marginBottom: 12 }}>{t('floorMap')}</h3>

          {tables.length === 0 ? (
            <p className="muted">{t('noTables')}</p>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
                gap: 12,
              }}
            >
              {tables.map((table) => {
                const meta = TABLE_STATUS[table.status] ?? {
                  key: table.status,
                  color: '#96a2c0',
                };

                const openOrder = table.orders?.[0];

                return (
                  <div
                    key={table.id}
                    className="stat-card"
                    style={{ borderTop: `3px solid ${meta.color}` }}
                  >
                    <div style={{ fontWeight: 800, fontSize: 18 }}>
                      {t('table')} {table.tableNo}
                    </div>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {table.area?.name ?? t('noArea')} • {fa(table.capacity)}{' '}
                      {t('seats')}
                    </div>
                    <div style={{ color: meta.color, marginTop: 6, fontWeight: 600 }}>
                      {t(meta.key)}
                    </div>
                    {openOrder ? (
                      <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                        {openOrder.orderNo} — {fa(openOrder.total)}
                      </div>
                    ) : null}
                    {table.status === 'CLEANING' ? (
                      <button
                        type="button"
                        style={{ marginTop: 8, padding: '6px 12px', fontSize: 13 }}
                        onClick={() =>
                          void patch(`/restaurant/tables/${table.id}`, {
                            status: 'FREE',
                          })
                        }
                      >
                        {t('tableReady')}
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : null}

      {/* سفارش‌ها */}
      {tab === 'orders' ? (
        <div className="card">
          <h3 style={{ marginBottom: 12 }}>{t('openOrdersTitle')}</h3>

          {orders.length === 0 ? (
            <p className="muted">{t('noOpenOrders')}</p>
          ) : (
            <div className="table-wrap">
            <table>
              <thead>
                <tr style={{ textAlign: 'right', color: 'var(--text-dim)' }}>
                  <th style={{ padding: 8 }}>{t('colNumber')}</th>
                  <th style={{ padding: 8 }}>{t('colTableType')}</th>
                  <th style={{ padding: 8 }}>{t('colItems')}</th>
                  <th style={{ padding: 8 }}>{t('colAmount')}</th>
                  <th style={{ padding: 8 }}>{t('status')}</th>
                  <th style={{ padding: 8 }}>{t('actions')}</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: 8 }}>{order.orderNo}</td>
                    <td style={{ padding: 8 }}>
                      {order.table
                        ? `${t('table')} ${order.table.tableNo}`
                        : order.type}
                    </td>
                    <td style={{ padding: 8 }}>{fa(order.items?.length ?? 0)}</td>
                    <td style={{ padding: 8 }}>{fa(order.total)}</td>
                    <td style={{ padding: 8 }}>
                      {ORDER_STATUS[order.status]
                        ? t(ORDER_STATUS[order.status])
                        : order.status}
                    </td>
                    <td style={{ padding: 8, display: 'flex', gap: 6 }}>
                      {order.status === 'OPEN' ? (
                        <button
                          type="button"
                          style={{ padding: '6px 12px', fontSize: 13 }}
                          onClick={() =>
                            void act(`/restaurant/orders/${order.id}/send-to-kitchen`)
                          }
                        >
                          {t('toKitchen')}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        style={{ padding: '6px 12px', fontSize: 13 }}
                        onClick={() => void openReceipt(order.id)}
                      >
                        {t('receipt')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </div>
      ) : null}

      {/* آشپزخانه */}
      {tab === 'kitchen' ? (
        <div className="card">
          <h3 style={{ marginBottom: 12 }}>
            {t('kitchenScreen')}{' '}
            <span className="muted" style={{ fontSize: 12 }}>
              {t('autoRefresh30')}
            </span>
          </h3>

          {kitchen.length === 0 ? (
            <p className="muted">{t('nothingPreparing')} 🎉</p>
          ) : (
            kitchenByStation.map(([station, items]) => (
              <div key={station} style={{ marginBottom: 18 }}>
                <div style={{ fontWeight: 700, marginBottom: 8 }}>{station}</div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                    gap: 12,
                  }}
                >
                  {items.map((item) => {
                    const late = (item.waitingMinutes ?? 0) > 15;

                    return (
                      <div
                        key={item.id}
                        className="stat-card"
                        style={{
                          borderTop: `3px solid ${late ? '#f87171' : '#34d399'}`,
                        }}
                      >
                        <div style={{ fontWeight: 700 }}>{item.name}</div>
                        <div className="muted" style={{ fontSize: 12 }}>
                          {item.order?.table
                            ? `${t('table')} ${item.order.table.tableNo}`
                            : item.order?.type}{' '}
                          • {item.order?.orderNo}
                        </div>
                        <div style={{ margin: '6px 0' }}>
                          {t('quantity')}: {fa(item.qty)} •{' '}
                          <span style={{ color: late ? '#f87171' : undefined }}>
                            {fa(item.waitingMinutes)} {t('minutes')}
                          </span>
                        </div>
                        {item.note ? (
                          <div className="muted" style={{ fontSize: 12 }}>
                            📝 {item.note}
                          </div>
                        ) : null}
                        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                          {item.status === 'PREPARING' ? (
                            <button
                              type="button"
                              style={{ padding: '6px 12px', fontSize: 13 }}
                              onClick={() =>
                                void patch(`/restaurant/kitchen/items/${item.id}`, {
                                  status: 'READY',
                                })
                              }
                            >
                              {t('markReady')}
                            </button>
                          ) : (
                            <button
                              type="button"
                              style={{ padding: '6px 12px', fontSize: 13 }}
                              onClick={() =>
                                void patch(`/restaurant/kitchen/items/${item.id}`, {
                                  status: 'SERVED',
                                })
                              }
                            >
                              {t('markServed')}
                            </button>
                          )}
                          <span className="muted" style={{ alignSelf: 'center', fontSize: 12 }}>
                            {ITEM_STATUS[item.status]
                              ? t(ITEM_STATUS[item.status])
                              : item.status}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      ) : null}

      {/* منو */}
      {tab === 'menu' ? (
        <div className="card">
          <h3 style={{ marginBottom: 12 }}>{t('tabMenu')}</h3>

          {menu.length === 0 ? (
            <p className="muted">{t('menuEmpty')}</p>
          ) : (
            menu.map((group) => (
              <div key={group.id ?? 'none'} style={{ marginBottom: 18 }}>
                <div style={{ fontWeight: 700, marginBottom: 8 }}>
                  {group.name}
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                    gap: 10,
                  }}
                >
                  {group.items.map((item) => (
                    <div
                      key={item.id}
                      className="stat-card"
                      style={{ opacity: item.isAvailable ? 1 : 0.45 }}
                    >
                      <div style={{ fontWeight: 700 }}>{item.name}</div>
                      <div className="muted" style={{ fontSize: 12 }}>
                        {item.station}
                      </div>
                      <div style={{ margin: '6px 0', fontWeight: 600 }}>
                        {fa(item.price)}
                      </div>
                      <button
                        type="button"
                        style={{ padding: '6px 12px', fontSize: 13 }}
                        onClick={() =>
                          void patch(`/restaurant/menu-items/${item.id}/toggle`, {})
                        }
                      >
                        {item.isAvailable ? t('soldOut') : t('backInStock')}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      ) : null}
    </AppShell>
  );
}

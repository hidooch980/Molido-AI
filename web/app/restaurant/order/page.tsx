'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';

import AppShell from '../../../components/AppShell';
import { Icon } from '../../../components/icons';
import { NUM, ROW, TD, TOUCH } from '../../../components/ui';
import { api } from '../../../lib/api';
import { useI18n } from '../../../lib/i18n-context';

type MenuItem = {
  id: string;
  name: string;
  price: string | number;
  station: string;
  isAvailable: boolean;
};

type MenuGroup = { id: string | null; name: string; items: MenuItem[] };

type Table = { id: string; tableNo: string; capacity: number; status: string };

type OpenOrder = { id: string; orderNo: string; table?: { tableNo: string } | null };

type Line = {
  menuItemId: string;
  name: string;
  qty: number;
  unitPrice: number;
  note?: string;
};

const TYPES = ['DINE_IN', 'TAKEAWAY', 'DELIVERY'] as const;

function OrderTaking() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const params = useSearchParams();

  // میز از صفحهٔ نقشهٔ سالن می‌آید؛ اگر نیامده، کاربر خودش انتخاب می‌کند.
  const tableFromUrl = params.get('tableId') ?? '';
  const orderFromUrl = params.get('orderId') ?? '';

  const [menu, setMenu] = useState<MenuGroup[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [openOrders, setOpenOrders] = useState<OpenOrder[]>([]);
  const [tableId, setTableId] = useState(tableFromUrl);
  const [orderId, setOrderId] = useState(orderFromUrl);
  const [type, setType] = useState<(typeof TYPES)[number]>('DINE_IN');
  const [guests, setGuests] = useState('2');
  const [search, setSearch] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const fa = useCallback(
    (value: unknown) => Number(value ?? 0).toLocaleString(locale),
    [locale],
  );

  const load = useCallback(async () => {
    try {
      const [m, tb, orders] = await Promise.all([
        api<MenuGroup[]>('/restaurant/menu'),
        api<Table[]>('/restaurant/tables'),
        api<OpenOrder[]>('/restaurant/orders?open=true'),
      ]);

      setMenu(Array.isArray(m) ? m : []);
      setTables(Array.isArray(tb) ? tb : []);
      setOpenOrders(Array.isArray(orders) ? orders : []);
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

  /** منوی فیلترشده — گارسون در ساعت شلوغ تایپ می‌کند، اسکرول نمی‌کند. */
  const visibleMenu = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return menu;

    return menu
      .map((group) => ({
        ...group,
        items: group.items.filter((item) =>
          item.name.toLowerCase().includes(needle),
        ),
      }))
      .filter((group) => group.items.length > 0);
  }, [menu, search]);

  function addItem(item: MenuItem) {
    setLines((prev) => {
      const found = prev.find((line) => line.menuItemId === item.id);

      // ضربهٔ دوم روی همان آیتم = دو پرس، نه دو ردیف.  گارسون سریع پشت سر
      // هم می‌زند و ردیف‌های تکراری خواندن سفارش را سخت می‌کند.
      if (found) {
        return prev.map((line) =>
          line.menuItemId === item.id ? { ...line, qty: line.qty + 1 } : line,
        );
      }

      return [
        ...prev,
        {
          menuItemId: item.id,
          name: item.name,
          qty: 1,
          unitPrice: Number(item.price),
        },
      ];
    });
  }

  function changeQty(menuItemId: string, delta: number) {
    setLines((prev) =>
      prev
        .map((line) =>
          line.menuItemId === menuItemId
            ? { ...line, qty: line.qty + delta }
            : line,
        )
        .filter((line) => line.qty > 0),
    );
  }

  function setNote(menuItemId: string) {
    const line = lines.find((item) => item.menuItemId === menuItemId);
    const answer = window.prompt(t('itemNote'), line?.note ?? '');
    if (answer === null) return;

    setLines((prev) =>
      prev.map((item) =>
        item.menuItemId === menuItemId
          ? { ...item, note: answer.trim() || undefined }
          : item,
      ),
    );
  }

  async function submit(sendToKitchen: boolean) {
    if (!lines.length) return;
    if (type === 'DINE_IN' && !tableId && !orderId) {
      setError(t('table'));
      return;
    }

    setBusy(true);
    try {
      const items = lines.map((line) => ({
        menuItemId: line.menuItemId,
        qty: line.qty,
        note: line.note,
      }));

      // افزودن به سفارش باز، یا ساخت سفارش تازه.  میزی که مهمانش وسط غذا
      // چیز دیگری می‌خواهد، نباید سفارش دوم بگیرد.
      const target = orderId
        ? await api<{ id: string }>(`/restaurant/orders/${orderId}/items`, {
            method: 'POST',
            body: { items },
          })
        : await api<{ id: string }>('/restaurant/orders', {
            method: 'POST',
            body: {
              type,
              tableId: type === 'DINE_IN' ? tableId : undefined,
              guestCount: Number(guests) || 1,
              items,
            },
          });

      const id = orderId || target.id;

      if (sendToKitchen && id) {
        await api(`/restaurant/orders/${id}/send-to-kitchen`, {
          method: 'POST',
          body: {},
        });
      }

      router.push('/restaurant');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('actionError'));
      setBusy(false);
    }
  }

  const total = lines.reduce((sum, line) => sum + line.qty * line.unitPrice, 0);
  const freeTables = tables.filter((table) =>
    ['FREE', 'RESERVED'].includes(table.status),
  );

  return (
    <AppShell
      title={t('takeOrder')}
      subtitle={t('restaurantSubtitle')}
      actions={
        <button
          type="button"
          className="btn-sm"
          onClick={() => router.push('/restaurant')}
        >
          {t('backToTables')}
        </button>
      }
    >
      {error ? <div className="error">{error}</div> : null}

      {/* سربرگ سفارش */}
      <div
        className="card"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 12,
        }}
      >
        <label>
          <div className="muted" style={{ marginBottom: 4 }}>
            {t('addToExisting')}
          </div>
          <select
            value={orderId}
            onChange={(e) => setOrderId(e.target.value)}
            style={{ ...TOUCH, width: '100%' }}
          >
            <option value="">—</option>
            {openOrders.map((order) => (
              <option key={order.id} value={order.id}>
                {order.orderNo}
                {order.table ? ` — ${t('table')} ${order.table.tableNo}` : ''}
              </option>
            ))}
          </select>
        </label>

        {/* وقتی به سفارش باز افزوده می‌شود، نوع و میز معنا ندارند. */}
        {!orderId ? (
          <>
            <label>
              <div className="muted" style={{ marginBottom: 4 }}>
                {t('orderType')}
              </div>
              <select
                value={type}
                onChange={(e) =>
                  setType(e.target.value as (typeof TYPES)[number])
                }
                style={{ ...TOUCH, width: '100%' }}
              >
                {TYPES.map((item) => (
                  <option key={item} value={item}>
                    {t(`type${item}`)}
                  </option>
                ))}
              </select>
            </label>

            {type === 'DINE_IN' ? (
              <label>
                <div className="muted" style={{ marginBottom: 4 }}>
                  {t('table')}
                </div>
                <select
                  value={tableId}
                  onChange={(e) => setTableId(e.target.value)}
                  style={{ ...TOUCH, width: '100%' }}
                >
                  <option value="">—</option>
                  {freeTables.map((table) => (
                    <option key={table.id} value={table.id}>
                      {t('table')} {table.tableNo} ({fa(table.capacity)}{' '}
                      {t('seats')})
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            <label>
              <div className="muted" style={{ marginBottom: 4 }}>
                {t('guestCount')}
              </div>
              <input
                type="number"
                min={1}
                value={guests}
                onChange={(e) => setGuests(e.target.value)}
                style={{ ...TOUCH, width: '100%' }}
              />
            </label>
          </>
        ) : null}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: 16,
          marginTop: 18,
          alignItems: 'start',
        }}
      >
        {/* منو */}
        <div className="card">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('searchMenu')}
            style={{ ...TOUCH, width: '100%', marginBottom: 12 }}
          />

          {loading ? (
            <p className="muted">{t('loading')}</p>
          ) : visibleMenu.length === 0 ? (
            <p className="muted">{t('menuEmpty')}</p>
          ) : (
            visibleMenu.map((group) => (
              <div key={group.id ?? 'none'} style={{ marginBottom: 16 }}>
                <div style={{ fontWeight: 700, marginBottom: 8 }}>
                  {group.name}
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns:
                      'repeat(auto-fill, minmax(150px, 1fr))',
                    gap: 8,
                  }}
                >
                  {group.items.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      disabled={!item.isAvailable}
                      onClick={() => addItem(item)}
                      style={{
                        ...TOUCH,
                        flexDirection: 'column',
                        alignItems: 'flex-start',
                        gap: 4,
                        padding: 10,
                        height: 'auto',
                        opacity: item.isAvailable ? 1 : 0.45,
                        textAlign: 'start',
                      }}
                    >
                      <span style={{ fontWeight: 600 }}>{item.name}</span>
                      <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {fa(item.price)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        {/* سفارش */}
        <div className="card">
          <h3 style={{ marginBottom: 12 }}>
            {t('newOrder')} ({fa(lines.length)})
          </h3>

          {lines.length === 0 ? (
            <p className="muted">{t('orderEmpty')}</p>
          ) : (
            <>
              <div className="table-wrap">
                <table>
                  <tbody>
                    {lines.map((line) => (
                      <tr key={line.menuItemId} style={ROW}>
                        <td style={TD}>
                          {line.name}
                          {line.note ? (
                            <div
                              className="muted"
                              style={{ fontSize: 12 }}
                            >
                              {line.note}
                            </div>
                          ) : null}
                        </td>

                        <td style={TD}>
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 6,
                            }}
                          >
                            <button
                              type="button"
                              style={{ ...TOUCH, minWidth: 40, padding: 0 }}
                              onClick={() => changeQty(line.menuItemId, -1)}
                              aria-label="کاهش"
                            >
                              −
                            </button>
                            <span
                              style={{
                                minWidth: 28,
                                textAlign: 'center',
                                fontWeight: 700,
                              }}
                            >
                              {fa(line.qty)}
                            </span>
                            <button
                              type="button"
                              style={{ ...TOUCH, minWidth: 40, padding: 0 }}
                              onClick={() => changeQty(line.menuItemId, 1)}
                              aria-label="افزایش"
                            >
                              +
                            </button>
                          </div>
                        </td>

                        <td style={NUM}>{fa(line.qty * line.unitPrice)}</td>

                        <td style={TD}>
                          <button
                            type="button"
                            className="ghost"
                            style={{ ...TOUCH, minWidth: 40, padding: 0 }}
                            onClick={() => setNote(line.menuItemId)}
                            aria-label={t('itemNote')}
                          >
                            <Icon name="clipboard" size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontWeight: 800,
                  fontSize: 18,
                  padding: '12px 0',
                  borderTop: '2px solid var(--primary)',
                  marginTop: 12,
                }}
              >
                <span>{t('total')}</span>
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {fa(total)}
                </span>
              </div>

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  style={TOUCH}
                  disabled={busy}
                  onClick={() => void submit(true)}
                >
                  <Icon name="check" size={18} /> {t('sendToKitchen')}
                </button>

                <button
                  type="button"
                  className="ghost"
                  style={TOUCH}
                  disabled={busy}
                  onClick={() => void submit(false)}
                >
                  {t('submitOrder')}
                </button>
              </div>

              <p className="muted" style={{ marginTop: 8, fontSize: 13 }}>
                {/* تفاوت این دو در عمل مهم است: سفارشی که به آشپزخانه
                    نرفته، هنوز قابل ویرایش است. */}
                «{t('sendToKitchen')}» آیتم‌ها را روی صفحهٔ آشپزخانه می‌فرستد.
              </p>
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}

export default function OrderPage() {
  return (
    <Suspense fallback={null}>
      <OrderTaking />
    </Suspense>
  );
}

'use client';

import { useCallback, useEffect, useState } from 'react';

import AppShell from '../../components/AppShell';
import { DataTable, NUM, ROW, TD, TOUCH } from '../../components/ui';
import { api } from '../../lib/api';
import { useI18n } from '../../lib/i18n-context';

type Warehouse = { id: string; name: string };

type Count = {
  id: string;
  countNo: string;
  status: string;
  warehouseName: string | null;
  lineCount: string | number;
  createdAt: string;
  appliedAt: string | null;
};

type CountLine = {
  id: string;
  productId: string;
  productName?: string | null;
  systemQty: string | number;
  countedQty: string | number | null;
};

type CountDetail = Count & { lines?: CountLine[] };

type Product = { id: string; name: string; sku: string | null };

type Movement = {
  id: string;
  delta: string | number;
  balance: string | number;
  reason: string;
  refType: string | null;
  warehouseName: string | null;
  userName: string | null;
  createdAt: string;
};

const TABS = [
  { key: 'counts', label: 'tabCounts' },
  { key: 'kardex', label: 'tabKardex' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

export default function StockCountPage() {
  const { t, locale } = useI18n();

  const [tab, setTab] = useState<TabKey>('counts');
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [counts, setCounts] = useState<Count[]>([]);
  const [open, setOpen] = useState<CountDetail | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [productId, setProductId] = useState('');
  const [movements, setMovements] = useState<Movement[]>([]);
  const [warehouseId, setWarehouseId] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const fa = useCallback(
    (value: unknown) => Number(value ?? 0).toLocaleString(locale),
    [locale],
  );

  const load = useCallback(async () => {
    try {
      const [w, list, prods] = await Promise.all([
        api<Warehouse[]>('/warehouses'),
        api<Count[]>('/stock-count'),
        api<Product[]>('/products'),
      ]);

      const houses = Array.isArray(w) ? w : [];
      setWarehouses(houses);
      setWarehouseId((current) => current || houses[0]?.id || '');
      setCounts(Array.isArray(list) ? list : []);
      setProducts(Array.isArray(prods) ? prods : []);
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

  /** کاردکس فقط وقتی خوانده می‌شود که کالایی انتخاب شده باشد. */
  useEffect(() => {
    if (!productId) {
      setMovements([]);
      return;
    }

    let cancelled = false;

    api<Movement[]>(`/stock-count/kardex/${productId}?limit=200`)
      .then((rows) => {
        // اگر کاربر پیش از رسیدن پاسخ کالای دیگری انتخاب کند، نتیجهٔ کهنه
        // نباید روی نتیجهٔ تازه بنشیند.
        if (!cancelled) setMovements(Array.isArray(rows) ? rows : []);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : t('fetchError'));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [productId, t]);

  async function openCount() {
    if (!warehouseId) return;

    setBusy(true);
    try {
      const created = await api<CountDetail>('/stock-count', {
        method: 'POST',
        body: { warehouseId },
      });

      await load();
      await showDetail(created.id);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('actionError'));
    } finally {
      setBusy(false);
    }
  }

  async function showDetail(id: string) {
    try {
      setOpen(await api<CountDetail>(`/stock-count/${id}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('fetchError'));
    }
  }

  async function setCounted(lineId: string, value: string) {
    if (!open) return;

    const qty = Number(value);
    if (!Number.isFinite(qty) || qty < 0) return;

    try {
      await api(`/stock-count/${open.id}/lines/${lineId}`, {
        method: 'PATCH',
        body: { countedQty: qty },
      });

      // به‌روزرسانی محلی به‌جای بارگذاری دوباره: انبار‌دار پشت سر هم عدد
      // وارد می‌کند و هر بار رفت‌وبرگشت کامل، کار را کند و پرش‌دار می‌کند.
      setOpen({
        ...open,
        lines: (open.lines ?? []).map((line) =>
          line.id === lineId ? { ...line, countedQty: qty } : line,
        ),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('actionError'));
    }
  }

  async function apply() {
    if (!open || !window.confirm(t('confirmApply'))) return;

    setBusy(true);
    try {
      const result = await api<{ applied?: number; total?: number }>(
        `/stock-count/${open.id}/apply`,
        { method: 'POST', body: {} },
      );

      setMessage(`${t('countApplied')}: ${fa(result?.applied ?? 0)}`);
      setOpen(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('actionError'));
    } finally {
      setBusy(false);
    }
  }

  async function cancelCount(id: string) {
    if (!window.confirm(t('confirmCancelCount'))) return;

    setBusy(true);
    try {
      await api(`/stock-count/${id}/cancel`, { method: 'POST', body: {} });
      setOpen(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('actionError'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell
      title={t('stockCountTitle')}
      subtitle={t('stockCountSubtitle')}
      actions={
        <button type="button" className="btn-sm" onClick={() => void load()}>
          {t('refresh')}
        </button>
      }
    >
      {error ? <div className="error">{error}</div> : null}
      {message ? (
        <div
          className="card"
          style={{ borderInlineStart: '4px solid var(--success)' }}
        >
          {message}
        </div>
      ) : null}

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

      {/* ---------------- شمارش‌ها ---------------- */}
      {tab === 'counts' ? (
        <>
          <div
            className="card"
            style={{
              display: 'flex',
              gap: 10,
              flexWrap: 'wrap',
              alignItems: 'center',
              marginBottom: 18,
            }}
          >
            <select
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value)}
              style={{ ...TOUCH, minWidth: 200 }}
            >
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>

            <button
              type="button"
              style={TOUCH}
              disabled={busy || !warehouseId}
              onClick={() => void openCount()}
            >
              + {t('openCount')}
            </button>
          </div>

          <div className="card">
            <DataTable
              headers={[
                t('countNo'),
                t('warehouse'),
                t('lineCount'),
                t('status'),
                t('date'),
                t('actions'),
              ]}
              empty={t('noCounts')}
              loading={loading}
              loadingLabel={t('loading')}
              rows={counts.length}
            >
              {counts.map((count) => (
                <tr key={count.id} style={ROW}>
                  <td style={TD}>{count.countNo}</td>
                  <td style={TD}>{count.warehouseName ?? '—'}</td>
                  <td style={NUM}>{fa(count.lineCount)}</td>
                  <td
                    style={{
                      ...TD,
                      color:
                        count.status === 'OPEN'
                          ? 'var(--warning)'
                          : count.status === 'APPLIED'
                            ? 'var(--success)'
                            : 'var(--text-dim)',
                    }}
                  >
                    {t(`scStatus${count.status}`)}
                  </td>
                  <td style={TD} className="muted">
                    {new Date(count.createdAt).toLocaleDateString(locale)}
                  </td>
                  <td style={{ ...TD, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      style={TOUCH}
                      onClick={() => void showDetail(count.id)}
                    >
                      {t('edit')}
                    </button>
                    {count.status === 'OPEN' ? (
                      <button
                        type="button"
                        className="ghost"
                        style={TOUCH}
                        disabled={busy}
                        onClick={() => void cancelCount(count.id)}
                      >
                        {t('cancelCount')}
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </DataTable>
          </div>

          {/* جزئیات شمارش باز */}
          {open ? (
            <div
              className="card"
              style={{ marginTop: 18, borderColor: 'var(--primary)' }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 12,
                  flexWrap: 'wrap',
                  gap: 10,
                }}
              >
                <strong>
                  {open.countNo} — {open.warehouseName}
                </strong>
                <div style={{ display: 'flex', gap: 8 }}>
                  {open.status === 'OPEN' ? (
                    <button
                      type="button"
                      style={TOUCH}
                      disabled={busy}
                      onClick={() => void apply()}
                    >
                      ✓ {t('applyCount')}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="ghost"
                    style={TOUCH}
                    onClick={() => setOpen(null)}
                  >
                    {t('close')}
                  </button>
                </div>
              </div>

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr style={{ color: 'var(--text-dim)' }}>
                      <th style={{ padding: 8, textAlign: 'right' }}>
                        {t('colProduct')}
                      </th>
                      <th style={{ padding: 8, textAlign: 'right' }}>
                        {t('systemQty')}
                      </th>
                      <th style={{ padding: 8, textAlign: 'right' }}>
                        {t('countedQty')}
                      </th>
                      <th style={{ padding: 8, textAlign: 'right' }}>
                        {t('difference')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {(open.lines ?? []).map((line) => {
                      const counted =
                        line.countedQty === null ? null : Number(line.countedQty);
                      const diff =
                        counted === null ? null : counted - Number(line.systemQty);

                      return (
                        <tr key={line.id} style={ROW}>
                          <td style={TD}>{line.productName ?? line.productId}</td>
                          <td style={NUM}>{fa(line.systemQty)}</td>
                          <td style={TD}>
                            {open.status === 'OPEN' ? (
                              <input
                                type="number"
                                min={0}
                                step="any"
                                defaultValue={
                                  line.countedQty === null
                                    ? ''
                                    : String(line.countedQty)
                                }
                                // onBlur نه onChange: هر ضربهٔ کلید یک
                                // درخواست PATCH می‌فرستاد.
                                onBlur={(e) =>
                                  void setCounted(line.id, e.target.value)
                                }
                                style={{ ...TOUCH, width: 120 }}
                              />
                            ) : (
                              fa(line.countedQty)
                            )}
                          </td>
                          <td
                            style={{
                              ...NUM,
                              fontWeight: 700,
                              color:
                                diff === null
                                  ? 'var(--text-dim)'
                                  : diff === 0
                                    ? 'var(--success)'
                                    : diff > 0
                                      ? 'var(--accent)'
                                      : 'var(--danger)',
                            }}
                          >
                            {diff === null
                              ? '—'
                              : `${diff > 0 ? '+' : ''}${fa(diff)}`}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </>
      ) : null}

      {/* ---------------- کاردکس ---------------- */}
      {tab === 'kardex' ? (
        <>
          <div className="card" style={{ marginBottom: 18 }}>
            <select
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              style={{ ...TOUCH, minWidth: 260 }}
            >
              <option value="">{t('pickProduct')}</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}
                  {product.sku ? ` — ${product.sku}` : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="card">
            <DataTable
              headers={[
                t('date'),
                t('movementReason'),
                t('warehouse'),
                t('movementDelta'),
                t('balanceAfter'),
                t('byUser'),
              ]}
              empty={t('noMovements')}
              loading={false}
              loadingLabel={t('loading')}
              rows={movements.length}
            >
              {movements.map((move) => {
                const delta = Number(move.delta);

                return (
                  <tr key={move.id} style={ROW}>
                    <td style={TD} className="muted">
                      {new Date(move.createdAt).toLocaleString(locale)}
                    </td>
                    <td style={TD}>{t(`reason${move.reason}`)}</td>
                    <td style={TD} className="muted">
                      {move.warehouseName ?? '—'}
                    </td>
                    <td
                      style={{
                        ...NUM,
                        fontWeight: 700,
                        color: delta > 0 ? 'var(--success)' : 'var(--danger)',
                      }}
                    >
                      {delta > 0 ? '+' : ''}
                      {fa(delta)}
                    </td>
                    <td style={NUM}>{fa(move.balance)}</td>
                    <td style={TD} className="muted">
                      {move.userName ?? '—'}
                    </td>
                  </tr>
                );
              })}
            </DataTable>
          </div>
        </>
      ) : null}
    </AppShell>
  );
}

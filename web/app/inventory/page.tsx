'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import AppShell from '../../components/AppShell';
import { Icon } from '../../components/icons';
import { api } from '../../lib/api';
import { useI18n } from '../../lib/i18n-context';

type Warehouse = { id: string; name: string; code: string | null };

type Stock = {
  id: string;
  warehouseId: string;
  productId: string;
  quantity: string | number;
  productName: string;
  productSku: string | null;
  productUnit: string | null;
  productMinStock: string | number | null;
  productSalePrice: string | number | null;
  warehouseName: string | null;
};

/** دکمه‌ها در انبار اغلب روی تبلت لمس می‌شوند. */
const TOUCH: React.CSSProperties = {
  minHeight: 44,
  minWidth: 44,
  padding: '10px 16px',
};

export default function InventoryPage() {
  const { t, locale } = useI18n();

  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [rows, setRows] = useState<Stock[]>([]);
  const [warehouseId, setWarehouseId] = useState('');
  const [search, setSearch] = useState('');
  const [lowOnly, setLowOnly] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const fa = useCallback(
    (value: unknown) => Number(value ?? 0).toLocaleString(locale),
    [locale],
  );

  const load = useCallback(async () => {
    try {
      const [w, inv] = await Promise.all([
        api<Warehouse[]>('/warehouses'),
        api<Stock[]>(
          warehouseId ? `/inventory?warehouseId=${warehouseId}` : '/inventory',
        ),
      ]);

      setWarehouses(w ?? []);
      setRows(inv ?? []);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('fetchError'));
    } finally {
      setLoading(false);
    }
  }, [warehouseId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();

    return rows.filter((row) => {
      if (lowOnly) {
        const min = Number(row.productMinStock ?? 0);
        // حد سفارشِ صفر یعنی برای این کالا هشدار تعریف نشده؛ آن را
        // «رو به اتمام» حساب نمی‌کنیم.
        if (!(min > 0 && Number(row.quantity) <= min)) return false;
      }

      if (!needle) return true;

      return (
        row.productName?.toLowerCase().includes(needle) ||
        row.productSku?.toLowerCase().includes(needle)
      );
    });
  }, [rows, search, lowOnly]);

  const stats = useMemo(() => {
    let low = 0;
    let out = 0;
    let value = 0;

    for (const row of rows) {
      const qty = Number(row.quantity);
      const min = Number(row.productMinStock ?? 0);

      if (qty <= 0) out += 1;
      else if (min > 0 && qty <= min) low += 1;

      value += qty * Number(row.productSalePrice ?? 0);
    }

    return { skus: rows.length, low, out, value };
  }, [rows]);

  async function act(path: string, body: unknown) {
    setBusy(true);
    try {
      await api(path, { method: 'POST', body });
      await load();
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('actionError'));
    } finally {
      setBusy(false);
    }
  }

  /** اصلاح موجودی: اختلاف گرفته می‌شود، نه مقدار نهایی — چون بک‌اند دلتا
   *  می‌گیرد و همان‌جا کف صفر را تضمین می‌کند. */
  function adjust(row: Stock) {
    const answer = window.prompt(
      `${row.productName} — ${t('onHand')}: ${fa(row.quantity)}\n${t('adjustPrompt')}`,
      '0',
    );
    if (answer === null) return;

    const delta = Number(answer);
    if (!Number.isFinite(delta) || delta === 0) return;

    void act('/inventory/adjust', {
      productId: row.productId,
      warehouseId: row.warehouseId,
      quantityChange: delta,
    });
  }

  function transfer(row: Stock) {
    const others = warehouses.filter((w) => w.id !== row.warehouseId);
    if (!others.length) {
      setError(t('noOtherWarehouse'));
      return;
    }

    const list = others
      .map((w, index) => `${index + 1}) ${w.name}`)
      .join('\n');

    const pick = window.prompt(`${t('transferToPrompt')}\n${list}`, '1');
    if (pick === null) return;

    const target = others[Number(pick) - 1];
    if (!target) return;

    const qtyAnswer = window.prompt(
      `${row.productName} — ${t('transferQtyPrompt')} (${t('onHand')}: ${fa(row.quantity)})`,
      String(row.quantity),
    );
    if (qtyAnswer === null) return;

    const qty = Number(qtyAnswer);
    if (!Number.isFinite(qty) || qty <= 0) return;

    void act('/inventory/transfer', {
      productId: row.productId,
      fromWarehouseId: row.warehouseId,
      toWarehouseId: target.id,
      quantity: qty,
    });
  }

  return (
    <AppShell
      title={t('inventoryTitle')}
      subtitle={t('inventorySubtitle')}
      actions={
        <button type="button" className="btn-sm" onClick={() => void load()}>
          {t('refresh')}
        </button>
      }
    >
      {error ? <div className="error">{error}</div> : null}

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon"><Icon name="package" size={22} /></div>
          <div className="stat-label">{t('statSkus')}</div>
          <div className="stat-value">{fa(stats.skus)}</div>
        </div>
        <div className="stat-card" style={{ borderTop: '3px solid var(--warning)' }}>
          <div className="stat-icon"><Icon name="alert" size={22} /></div>
          <div className="stat-label">{t('statLowStock')}</div>
          <div className="stat-value">{fa(stats.low)}</div>
        </div>
        <div className="stat-card" style={{ borderTop: '3px solid var(--danger)' }}>
          <div className="stat-icon"><Icon name="x" size={22} /></div>
          <div className="stat-label">{t('statOutOfStock')}</div>
          <div className="stat-value">{fa(stats.out)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon"><Icon name="money" size={22} /></div>
          <div className="stat-label">{t('statStockValue')}</div>
          <div className="stat-value">{fa(stats.value)}</div>
        </div>
      </div>

      <div
        className="card"
        style={{
          margin: '18px 0',
          display: 'flex',
          gap: 10,
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <select
          value={warehouseId}
          onChange={(e) => setWarehouseId(e.target.value)}
          style={{ ...TOUCH, minWidth: 200 }}
        >
          <option value="">{t('allWarehouses')}</option>
          {warehouses.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
              {w.code ? ` (${w.code})` : ''}
            </option>
          ))}
        </select>

        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('searchProducts')}
          style={{ ...TOUCH, flex: 1, minWidth: 200 }}
        />

        <button
          type="button"
          className={lowOnly ? '' : 'ghost'}
          style={TOUCH}
          onClick={() => setLowOnly((v) => !v)}
        >
          {t('lowStockOnly')}
        </button>
      </div>

      <div className="card">
        {loading ? (
          <p className="muted">{t('loading')}</p>
        ) : visible.length === 0 ? (
          <p className="muted">{t('noInventory')}</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr style={{ textAlign: 'right', color: 'var(--text-dim)' }}>
                  <th style={{ padding: 8 }}>{t('colProduct')}</th>
                  <th style={{ padding: 8 }}>{t('sku')}</th>
                  <th style={{ padding: 8 }}>{t('warehouse')}</th>
                  <th style={{ padding: 8 }}>{t('onHand')}</th>
                  <th style={{ padding: 8 }}>{t('minStock')}</th>
                  <th style={{ padding: 8 }}>{t('actions')}</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => {
                  const qty = Number(row.quantity);
                  const min = Number(row.productMinStock ?? 0);

                  // رنگ همان معناشناسی بقیهٔ برنامه: قرمز = متوقف،
                  // کهربایی = نیاز به اقدام، سبز = سالم.
                  const color =
                    qty <= 0
                      ? 'var(--danger)'
                      : min > 0 && qty <= min
                        ? 'var(--warning)'
                        : 'var(--success)';

                  return (
                    <tr
                      key={row.id}
                      style={{ borderTop: '1px solid var(--border)' }}
                    >
                      <td style={{ padding: 8 }}>{row.productName}</td>
                      <td style={{ padding: 8 }}>{row.productSku ?? '—'}</td>
                      <td style={{ padding: 8 }}>{row.warehouseName ?? '—'}</td>
                      <td style={{ padding: 8, color, fontWeight: 700 }}>
                        {fa(qty)}{' '}
                        <span className="muted" style={{ fontWeight: 400 }}>
                          {row.productUnit ?? ''}
                        </span>
                      </td>
                      <td style={{ padding: 8 }} className="muted">
                        {min > 0 ? fa(min) : '—'}
                      </td>
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
                          disabled={busy}
                          onClick={() => adjust(row)}
                        >
                          {t('adjust')}
                        </button>
                        <button
                          type="button"
                          className="ghost"
                          style={TOUCH}
                          disabled={busy}
                          onClick={() => transfer(row)}
                        >
                          {t('transfer')}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  );
}

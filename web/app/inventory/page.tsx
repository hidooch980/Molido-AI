'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import AppShell from '../../components/AppShell';
import { api } from '../../lib/api';

type Warehouse = { id: string; name: string };

type Row = {
  id: string;
  quantity: string | number;
  warehouseId: string;
  productId: string;
  product?: { id: string; name: string; sku: string; unit: string; minStock?: string | number };
  warehouse?: { id: string; name: string };
};

/**
 * انبار و انبارگردانی.
 *
 * «شمارش» اختلاف موجودی شمرده‌شده با سیستم را به عنوان اصلاحیه ثبت می‌کند
 * (API فقط quantityChange می‌پذیرد، نه مقدار مطلق).
 */
export default function InventoryPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [lowStock, setLowStock] = useState<Row[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [warehouseId, setWarehouseId] = useState('');
  const [search, setSearch] = useState('');

  /** مقدار شمرده‌شده برای هر ردیف انبارگردانی */
  const [counted, setCounted] = useState<Record<string, string>>({});

  const [transfer, setTransfer] = useState({
    productId: '',
    fromWarehouseId: '',
    toWarehouseId: '',
    quantity: 0,
  });

  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const fa = (v: unknown) => Number(v ?? 0).toLocaleString('fa-IR');

  const load = useCallback(async () => {
    try {
      const unwrap = <T,>(v: T[] | { data: T[] }): T[] =>
        Array.isArray(v) ? v : (v?.data ?? []);

      const [inv, low, w] = await Promise.all([
        api<Row[] | { data: Row[] }>('/inventory'),
        api<Row[] | { data: Row[] }>('/inventory/low-stock').catch(
          () => [] as Row[],
        ),
        api<Warehouse[] | { data: Warehouse[] }>('/warehouses'),
      ]);

      const whs = unwrap(w);

      setRows(unwrap(inv));
      setLowStock(unwrap(low));
      setWarehouses(whs);
      setWarehouseId((prev) => prev || (whs[0]?.id ?? ''));
      setTransfer((t) => ({
        ...t,
        fromWarehouseId: t.fromWarehouseId || (whs[0]?.id ?? ''),
        toWarehouseId: t.toWarehouseId || (whs[1]?.id ?? ''),
      }));
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در دریافت موجودی');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();

    return rows
      .filter((r) => !warehouseId || r.warehouseId === warehouseId)
      .filter(
        (r) =>
          !q ||
          (r.product?.name ?? '').toLowerCase().includes(q) ||
          (r.product?.sku ?? '').toLowerCase().includes(q),
      );
  }, [rows, warehouseId, search]);

  const totalValue = useMemo(
    () => visible.reduce((s, r) => s + Number(r.quantity), 0),
    [visible],
  );

  /** ثبت اصلاحیه انبارگردانی برای یک ردیف. */
  async function applyCount(row: Row) {
    const raw = counted[row.id];

    if (raw === undefined || raw === '') return;

    const actual = Number(raw);
    const system = Number(row.quantity);
    const diff = actual - system;

    if (diff === 0) {
      setMessage('اختلافی وجود ندارد.');
      return;
    }

    setBusy(true);
    setError('');
    setMessage('');

    try {
      await api('/inventory/adjust', {
        method: 'POST',
        body: {
          productId: row.productId,
          warehouseId: row.warehouseId,
          quantityChange: diff,
        },
      });

      setMessage(
        `«${row.product?.name}» اصلاح شد: ${diff > 0 ? '+' : ''}${fa(diff)}`,
      );
      setCounted((c) => ({ ...c, [row.id]: '' }));
      void load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در ثبت اصلاحیه');
    } finally {
      setBusy(false);
    }
  }

  async function doTransfer() {
    if (!transfer.productId || transfer.quantity <= 0) {
      setError('کالا و مقدار انتقال را مشخص کنید');
      return;
    }

    if (transfer.fromWarehouseId === transfer.toWarehouseId) {
      setError('انبار مبدأ و مقصد نباید یکی باشند');
      return;
    }

    setBusy(true);
    setError('');
    setMessage('');

    try {
      await api('/inventory/transfer', { method: 'POST', body: transfer });
      setMessage('انتقال بین انبارها انجام شد ✅');
      setTransfer((t) => ({ ...t, productId: '', quantity: 0 }));
      void load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در انتقال');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell title="انبار" subtitle="موجودی، انبارگردانی و انتقال">
      {error ? <div className="error">{error}</div> : null}
      {message ? <div className="ok">{message}</div> : null}

      <div className="stats-grid">
        <div className="stat-card">
          <span className="stat-icon">📦</span>
          <span className="stat-label">اقلام انبار</span>
          <span className="stat-value">{fa(visible.length)}</span>
        </div>
        <div className="stat-card">
          <span className="stat-icon">🔢</span>
          <span className="stat-label">مجموع موجودی</span>
          <span className="stat-value">{fa(totalValue)}</span>
        </div>
        <div className="stat-card">
          <span className="stat-icon">⚠️</span>
          <span className="stat-label">زیر حد سفارش</span>
          <span className="stat-value">{fa(lowStock.length)}</span>
        </div>
      </div>

      {lowStock.length > 0 ? (
        <div className="card">
          <h3>⚠️ کالاهای زیر حد سفارش</h3>
          <div className="grid-auto">
            {lowStock.slice(0, 12).map((r) => (
              <div key={r.id} className="prod out" style={{ cursor: 'default' }}>
                <span className="p-name">{r.product?.name}</span>
                <span className="p-price">{fa(r.quantity)} {r.product?.unit}</span>
                <span className="muted p-stock">
                  حد سفارش: {fa(r.product?.minStock)}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* ---------- انتقال بین انبار ---------- */}
      {warehouses.length > 1 ? (
        <div className="card">
          <h3>🔄 انتقال بین انبارها</h3>
          <div className="pos-settings" style={{ marginBottom: 0 }}>
            <label>
              <span className="muted">کالا</span>
              <select
                value={transfer.productId}
                onChange={(e) =>
                  setTransfer((t) => ({ ...t, productId: e.target.value }))
                }
              >
                <option value="">انتخاب کنید…</option>
                {visible.map((r) => (
                  <option key={r.productId} value={r.productId}>
                    {r.product?.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="muted">از انبار</span>
              <select
                value={transfer.fromWarehouseId}
                onChange={(e) =>
                  setTransfer((t) => ({ ...t, fromWarehouseId: e.target.value }))
                }
              >
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            </label>
            <label>
              <span className="muted">به انبار</span>
              <select
                value={transfer.toWarehouseId}
                onChange={(e) =>
                  setTransfer((t) => ({ ...t, toWarehouseId: e.target.value }))
                }
              >
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            </label>
            <label>
              <span className="muted">مقدار</span>
              <input
                type="number"
                min={0}
                value={transfer.quantity}
                onChange={(e) =>
                  setTransfer((t) => ({
                    ...t,
                    quantity: Number(e.target.value) || 0,
                  }))
                }
              />
            </label>
          </div>
          <button
            type="button"
            className="btn-sm"
            style={{ marginTop: 12 }}
            disabled={busy}
            onClick={() => void doTransfer()}
          >
            انجام انتقال
          </button>
        </div>
      ) : null}

      {/* ---------- انبارگردانی ---------- */}
      <div className="card pos-settings">
        <label>
          <span className="muted">انبار</span>
          <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="muted">جستجو</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="نام یا کد کالا"
          />
        </label>
      </div>

      <div className="card">
        <h3>📋 انبارگردانی</h3>
        <p className="muted" style={{ marginBottom: 12, fontSize: 13 }}>
          مقدار شمرده‌شده را وارد کنید؛ اختلاف با موجودی سیستم به عنوان
          اصلاحیه ثبت می‌شود.
        </p>

        {visible.length === 0 ? (
          <p className="muted empty">موجودی‌ای یافت نشد.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>کالا</th>
                  <th>کد</th>
                  <th>موجودی سیستم</th>
                  <th>شمارش شد</th>
                  <th>اختلاف</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => {
                  const raw = counted[r.id];
                  const diff =
                    raw === undefined || raw === ''
                      ? null
                      : Number(raw) - Number(r.quantity);

                  return (
                    <tr key={r.id}>
                      <td>{r.product?.name ?? '—'}</td>
                      <td className="muted">{r.product?.sku ?? '—'}</td>
                      <td>
                        <strong>{fa(r.quantity)}</strong>{' '}
                        <span className="muted">{r.product?.unit}</span>
                      </td>
                      <td>
                        <input
                          type="number"
                          min={0}
                          step="0.001"
                          className="disc-input"
                          value={raw ?? ''}
                          onChange={(e) =>
                            setCounted((c) => ({ ...c, [r.id]: e.target.value }))
                          }
                        />
                      </td>
                      <td>
                        {diff === null ? (
                          <span className="muted">—</span>
                        ) : (
                          <strong
                            style={{
                              color:
                                diff === 0
                                  ? undefined
                                  : diff > 0
                                    ? '#a7f3d0'
                                    : '#fecaca',
                            }}
                          >
                            {diff > 0 ? '+' : ''}
                            {fa(diff)}
                          </strong>
                        )}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn-sm"
                          disabled={busy || diff === null || diff === 0}
                          onClick={() => void applyCount(r)}
                        >
                          ثبت اصلاح
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

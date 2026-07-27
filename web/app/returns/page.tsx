'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import AppShell from '../../components/AppShell';
import { api } from '../../lib/api';

type Product = { id: string; name: string; sku: string; barcode?: string | null; salePrice: string | number };
type Warehouse = { id: string; name: string };
type CashBox = { id: string; name: string };

type ReturnItem = { id: string; productId?: string | null; name: string; qty: string | number; unitPrice: string | number };

type ProductReturn = {
  id: string;
  returnNo: string;
  reason: string;
  status: string;
  totalAmount: string | number;
  note?: string | null;
  createdAt: string;
  items?: ReturnItem[];
};

const REASONS = [
  { value: 'DEFECTIVE', label: 'معیوب' },
  { value: 'WRONG_ITEM', label: 'کالای اشتباه' },
  { value: 'CUSTOMER_CHANGE', label: 'انصراف مشتری' },
  { value: 'EXCESS', label: 'مازاد' },
  { value: 'OTHER', label: 'سایر' },
];

const STATUS_FA: Record<string, string> = {
  PENDING: 'در انتظار',
  APPROVED: 'تأیید شده',
  REJECTED: 'رد شده',
  RESTOCKED: 'بازگشت به انبار',
  REFUNDED: 'وجه بازپرداخت شد',
};

type Line = { productId: string; name: string; qty: number; unitPrice: number };

/**
 * مرجوعی کالا.
 *
 * ثبت مرجوعی فقط سند می‌سازد؛ موجودی تنها با «بازگشت به انبار» زیاد
 * می‌شود تا کالای معیوب دوباره قابل فروش نشود.
 */
export default function ReturnsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [cashBoxes, setCashBoxes] = useState<CashBox[]>([]);
  const [list, setList] = useState<ProductReturn[]>([]);

  const [lines, setLines] = useState<Line[]>([]);
  const [search, setSearch] = useState('');
  const [reason, setReason] = useState('DEFECTIVE');
  const [note, setNote] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [cashBoxId, setCashBoxId] = useState('');

  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const fa = (v: unknown) => Number(v ?? 0).toLocaleString('fa-IR');

  const load = useCallback(async () => {
    try {
      const unwrap = <T,>(v: T[] | { data: T[] }): T[] =>
        Array.isArray(v) ? v : (v?.data ?? []);

      const [p, w, cb, r] = await Promise.all([
        api<Product[] | { data: Product[] }>('/products?limit=200'),
        api<Warehouse[] | { data: Warehouse[] }>('/warehouses'),
        api<CashBox[] | { data: CashBox[] }>('/cashbox').catch(() => [] as CashBox[]),
        api<ProductReturn[] | { data: ProductReturn[] }>('/returns'),
      ]);

      const whs = unwrap(w);
      const boxes = unwrap(cb);

      setProducts(unwrap(p));
      setWarehouses(whs);
      setCashBoxes(boxes);
      setList(unwrap(r));
      setWarehouseId((prev) => prev || (whs[0]?.id ?? ''));
      setCashBoxId((prev) => prev || (boxes[0]?.id ?? ''));
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در دریافت اطلاعات');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const total = useMemo(
    () => lines.reduce((s, l) => s + l.qty * l.unitPrice, 0),
    [lines],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();

    if (!q) return [];

    return products
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          (p.barcode ?? '').includes(q),
      )
      .slice(0, 8);
  }, [products, search]);

  function addLine(p: Product) {
    setLines((prev) =>
      prev.find((l) => l.productId === p.id)
        ? prev.map((l) =>
            l.productId === p.id ? { ...l, qty: l.qty + 1 } : l,
          )
        : [
            ...prev,
            {
              productId: p.id,
              name: p.name,
              qty: 1,
              unitPrice: Number(p.salePrice),
            },
          ],
    );
    setSearch('');
  }

  function patchLine(id: string, patch: Partial<Line>) {
    setLines((prev) =>
      prev
        .map((l) => (l.productId === id ? { ...l, ...patch } : l))
        .filter((l) => l.qty > 0),
    );
  }

  async function submit() {
    if (!lines.length || busy) return;

    setBusy(true);
    setError('');
    setMessage('');

    try {
      const created = await api<ProductReturn>('/returns', {
        method: 'POST',
        body: {
          reason,
          note: note || undefined,
          items: lines.map((l) => ({
            productId: l.productId,
            name: l.name,
            qty: l.qty,
            unitPrice: l.unitPrice,
          })),
        },
      });

      setMessage(`مرجوعی ${created.returnNo} ثبت شد ✅`);
      setLines([]);
      setNote('');
      void load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در ثبت مرجوعی');
    } finally {
      setBusy(false);
    }
  }

  async function act(id: string, kind: 'restock' | 'refund') {
    setError('');
    setMessage('');

    try {
      await api(`/returns/${id}/${kind}`, {
        method: 'PATCH',
        body: kind === 'restock' ? { warehouseId } : { cashBoxId },
      });

      setMessage(
        kind === 'restock'
          ? 'کالا به انبار برگشت و موجودی افزایش یافت ✅'
          : 'وجه مرجوعی از صندوق بازپرداخت شد ✅',
      );
      void load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در انجام عملیات');
    }
  }

  return (
    <AppShell title="مرجوعی کالا" subtitle="ثبت مرجوعی، بازگشت به انبار و بازپرداخت">
      {error ? <div className="error">{error}</div> : null}
      {message ? <div className="ok">{message}</div> : null}

      <div className="card pos-settings">
        <label>
          <span className="muted">علت مرجوعی</span>
          <select value={reason} onChange={(e) => setReason(e.target.value)}>
            {REASONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="muted">انبار بازگشت</span>
          <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
        </label>
        {cashBoxes.length > 0 ? (
          <label>
            <span className="muted">صندوق بازپرداخت</span>
            <select value={cashBoxId} onChange={(e) => setCashBoxId(e.target.value)}>
              {cashBoxes.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      <div className="card scan-card">
        <span className="scan-icon">↩️</span>
        <input
          className="scan-input"
          placeholder="بارکد یا نام کالای مرجوعی…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && filtered.length > 0) {
              e.preventDefault();
              addLine(filtered[0]);
            }
          }}
        />
      </div>

      {filtered.length > 0 ? (
        <div className="card">
          <div className="grid-auto">
            {filtered.map((p) => (
              <button key={p.id} type="button" className="prod" onClick={() => addLine(p)}>
                <span className="p-name">{p.name}</span>
                <span className="p-price">{fa(p.salePrice)}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="pos-layout">
        <div className="card">
          <h3>↩️ اقلام مرجوعی</h3>

          {lines.length === 0 ? (
            <p className="muted empty">کالایی اضافه نشده است.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>کالا</th>
                    <th>تعداد</th>
                    <th>قیمت واحد</th>
                    <th>جمع</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l) => (
                    <tr key={l.productId}>
                      <td>{l.name}</td>
                      <td>
                        <input
                          type="number"
                          min={0}
                          step="0.001"
                          className="disc-input"
                          value={l.qty}
                          onChange={(e) =>
                            patchLine(l.productId, { qty: Number(e.target.value) })
                          }
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min={0}
                          className="disc-input"
                          value={l.unitPrice}
                          onChange={(e) =>
                            patchLine(l.productId, {
                              unitPrice: Number(e.target.value) || 0,
                            })
                          }
                        />
                      </td>
                      <td>
                        <strong>{fa(l.qty * l.unitPrice)}</strong>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn-sm"
                          onClick={() => patchLine(l.productId, { qty: 0 })}
                        >
                          حذف
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card pay-card">
          <h3>💵 جمع مرجوعی</h3>

          <div className="sum-row total">
            <span>مبلغ کل</span>
            <span>{fa(total)}</span>
          </div>

          <label className="recv">
            <span className="muted">توضیحات</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="اختیاری" />
          </label>

          <button
            type="button"
            className="pay-btn"
            disabled={!lines.length || busy}
            onClick={() => void submit()}
          >
            {busy ? 'در حال ثبت…' : 'ثبت مرجوعی'}
          </button>
        </div>
      </div>

      <div className="card">
        <h3>📋 مرجوعی‌های ثبت‌شده</h3>

        {list.length === 0 ? (
          <p className="muted empty">مرجوعی‌ای ثبت نشده است.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>شماره</th>
                  <th>علت</th>
                  <th>مبلغ</th>
                  <th>وضعیت</th>
                  <th>عملیات</th>
                </tr>
              </thead>
              <tbody>
                {list.map((r) => (
                  <tr key={r.id}>
                    <td>{r.returnNo}</td>
                    <td>{REASONS.find((x) => x.value === r.reason)?.label ?? r.reason}</td>
                    <td>{fa(r.totalAmount)}</td>
                    <td>
                      <span className="badge">{STATUS_FA[r.status] ?? r.status}</span>
                    </td>
                    <td className="row-actions">
                      {r.status !== 'RESTOCKED' ? (
                        <button
                          type="button"
                          className="btn-sm"
                          onClick={() => void act(r.id, 'restock')}
                        >
                          📦 بازگشت به انبار
                        </button>
                      ) : null}
                      {r.status !== 'REFUNDED' ? (
                        <button
                          type="button"
                          className="btn-sm"
                          onClick={() => void act(r.id, 'refund')}
                        >
                          💵 بازپرداخت
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
    </AppShell>
  );
}

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import AppShell from '../../components/AppShell';
import { api } from '../../lib/api';

type Product = { id: string; name: string; sku: string; barcode?: string | null; purchasePrice: string | number; unit: string };
type Supplier = { id: string; name: string };
type Warehouse = { id: string; name: string };

type Purchase = {
  id: string;
  invoiceNo?: string;
  status: string;
  total: string | number;
  createdAt: string;
  supplier?: { name: string } | null;
};

type Line = { productId: string; name: string; unit: string; price: number; quantity: number };

const STATUS_FA: Record<string, string> = {
  DRAFT: 'پیش‌نویس',
  PENDING: 'در انتظار',
  RECEIVED: 'دریافت‌شده',
  CANCELLED: 'لغو شده',
  PAID: 'پرداخت‌شده',
  PARTIAL: 'پرداخت جزئی',
};

/**
 * ورود کالا — ثبت فاکتور خرید از تأمین‌کننده.
 *
 * موجودی انبار فقط با «تأیید دریافت» افزایش می‌یابد، نه هنگام ثبت سند.
 */
export default function PurchasesPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);

  const [supplierId, setSupplierId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [search, setSearch] = useState('');
  const [discount, setDiscount] = useState(0);
  const [tax, setTax] = useState(0);
  const [note, setNote] = useState('');

  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  const fa = (v: unknown) => Number(v ?? 0).toLocaleString('fa-IR');

  const load = useCallback(async () => {
    try {
      const unwrap = <T,>(v: T[] | { data: T[] }): T[] =>
        Array.isArray(v) ? v : (v?.data ?? []);

      const [p, s, w, pu] = await Promise.all([
        api<Product[] | { data: Product[] }>('/products?limit=200'),
        api<Supplier[] | { data: Supplier[] }>('/suppliers'),
        api<Warehouse[] | { data: Warehouse[] }>('/warehouses'),
        api<Purchase[] | { data: Purchase[] }>('/purchases'),
      ]);

      const sup = unwrap(s);
      const whs = unwrap(w);

      setProducts(unwrap(p));
      setSuppliers(sup);
      setWarehouses(whs);
      setPurchases(unwrap(pu));
      setSupplierId((prev) => prev || (sup[0]?.id ?? ''));
      setWarehouseId((prev) => prev || (whs[0]?.id ?? ''));
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در دریافت اطلاعات');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const subtotal = useMemo(
    () => lines.reduce((s, l) => s + l.price * l.quantity, 0),
    [lines],
  );

  const total = Math.max(0, subtotal - discount + tax);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();

    if (!q) return products.slice(0, 12);

    return products
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          (p.barcode ?? '').includes(q),
      )
      .slice(0, 12);
  }, [products, search]);

  function addLine(p: Product) {
    setLines((prev) => {
      const found = prev.find((l) => l.productId === p.id);

      if (found) {
        return prev.map((l) =>
          l.productId === p.id ? { ...l, quantity: l.quantity + 1 } : l,
        );
      }

      return [
        ...prev,
        {
          productId: p.id,
          name: p.name,
          unit: p.unit,
          price: Number(p.purchasePrice),
          quantity: 1,
        },
      ];
    });
    setSearch('');
  }

  function patchLine(id: string, patch: Partial<Line>) {
    setLines((prev) =>
      prev
        .map((l) => (l.productId === id ? { ...l, ...patch } : l))
        .filter((l) => l.quantity > 0),
    );
  }

  async function submit() {
    if (!lines.length || saving) return;

    if (!supplierId) {
      setError('تأمین‌کننده را انتخاب کنید');
      return;
    }

    if (!warehouseId) {
      setError('انبار را انتخاب کنید');
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');

    try {
      await api('/purchases', {
        method: 'POST',
        body: {
          supplierId,
          warehouseId,
          discount,
          tax,
          note: note || undefined,
          items: lines.map((l) => ({
            productId: l.productId,
            quantity: l.quantity,
            purchasePrice: l.price,
          })),
        },
      });

      setMessage('فاکتور خرید ثبت شد ✅ — برای افزودن به موجودی، «تأیید دریافت» بزنید.');
      setLines([]);
      setDiscount(0);
      setTax(0);
      setNote('');
      void load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در ثبت فاکتور خرید');
    } finally {
      setSaving(false);
    }
  }

  async function receive(id: string) {
    setError('');
    setMessage('');

    try {
      await api(`/purchases/${id}/receive`, { method: 'PATCH' });
      setMessage('کالا دریافت شد و به موجودی انبار اضافه گردید ✅');
      void load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در تأیید دریافت');
    }
  }

  async function cancelPurchase(id: string) {
    setError('');
    setMessage('');

    try {
      await api(`/purchases/${id}/cancel`, { method: 'PATCH' });
      setMessage('فاکتور خرید لغو شد');
      void load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در لغو فاکتور');
    }
  }

  return (
    <AppShell title="ورود کالا" subtitle="ثبت خرید از تأمین‌کننده و افزودن به انبار">
      {error ? <div className="error">{error}</div> : null}
      {message ? <div className="ok">{message}</div> : null}

      <div className="card pos-settings">
        <label>
          <span className="muted">تأمین‌کننده</span>
          <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
            {suppliers.length === 0 ? <option value="">—</option> : null}
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span className="muted">انبار مقصد</span>
          <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
            {warehouses.length === 0 ? <option value="">—</option> : null}
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span className="muted">تخفیف</span>
          <input
            type="number"
            min={0}
            value={discount}
            onChange={(e) => setDiscount(Number(e.target.value) || 0)}
          />
        </label>

        <label>
          <span className="muted">مالیات</span>
          <input
            type="number"
            min={0}
            value={tax}
            onChange={(e) => setTax(Number(e.target.value) || 0)}
          />
        </label>
      </div>

      <div className="card scan-card">
        <span className="scan-icon">🔍</span>
        <input
          className="scan-input"
          placeholder="بارکد یا نام کالا برای افزودن به فاکتور خرید…"
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

      {search ? (
        <div className="card">
          <div className="grid-auto">
            {filtered.map((p) => (
              <button key={p.id} type="button" className="prod" onClick={() => addLine(p)}>
                <span className="p-name">{p.name}</span>
                <span className="p-price">خرید: {fa(p.purchasePrice)}</span>
                <span className="muted p-stock">{p.sku}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="pos-layout">
        <div className="card">
          <h3>📥 اقلام فاکتور — {fa(lines.length)} ردیف</h3>

          {lines.length === 0 ? (
            <p className="muted empty">کالایی اضافه نشده است.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>کالا</th>
                    <th>تعداد</th>
                    <th>قیمت خرید</th>
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
                          value={l.quantity}
                          onChange={(e) =>
                            patchLine(l.productId, {
                              quantity: Number(e.target.value),
                            })
                          }
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min={0}
                          className="disc-input"
                          value={l.price}
                          onChange={(e) =>
                            patchLine(l.productId, {
                              price: Number(e.target.value) || 0,
                            })
                          }
                        />
                      </td>
                      <td>
                        <strong>{fa(l.price * l.quantity)}</strong>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn-sm"
                          onClick={() => patchLine(l.productId, { quantity: 0 })}
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
          <h3>💵 جمع فاکتور</h3>

          <div className="sum-row">
            <span>جمع اقلام</span>
            <span>{fa(subtotal)}</span>
          </div>
          <div className="sum-row">
            <span>تخفیف</span>
            <span>{fa(discount)}</span>
          </div>
          <div className="sum-row">
            <span>مالیات</span>
            <span>{fa(tax)}</span>
          </div>
          <div className="sum-row total">
            <span>مبلغ کل</span>
            <span>{fa(total)}</span>
          </div>

          <label className="recv">
            <span className="muted">توضیحات</span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="اختیاری"
            />
          </label>

          <button
            type="button"
            className="pay-btn"
            disabled={!lines.length || saving}
            onClick={() => void submit()}
          >
            {saving ? 'در حال ثبت…' : 'ثبت فاکتور خرید'}
          </button>
        </div>
      </div>

      <div className="card">
        <h3>📋 فاکتورهای خرید اخیر</h3>

        {purchases.length === 0 ? (
          <p className="muted empty">فاکتوری ثبت نشده است.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>تأمین‌کننده</th>
                  <th>مبلغ</th>
                  <th>وضعیت</th>
                  <th>تاریخ</th>
                  <th>عملیات</th>
                </tr>
              </thead>
              <tbody>
                {purchases.map((p) => (
                  <tr key={p.id}>
                    <td>{p.supplier?.name ?? '—'}</td>
                    <td>{fa(p.total)}</td>
                    <td>
                      <span className="badge">
                        {STATUS_FA[p.status] ?? p.status}
                      </span>
                    </td>
                    <td>{new Date(p.createdAt).toLocaleDateString('fa-IR')}</td>
                    <td className="row-actions">
                      {p.status !== 'RECEIVED' && p.status !== 'CANCELLED' ? (
                        <>
                          <button
                            type="button"
                            className="btn-sm"
                            onClick={() => void receive(p.id)}
                          >
                            ✅ تأیید دریافت
                          </button>
                          <button
                            type="button"
                            className="btn-sm"
                            onClick={() => void cancelPurchase(p.id)}
                          >
                            لغو
                          </button>
                        </>
                      ) : (
                        <span className="muted">—</span>
                      )}
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

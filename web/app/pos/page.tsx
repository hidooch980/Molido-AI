'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import AppShell from '../../components/AppShell';
import { api } from '../../lib/api';

type Product = {
  id: string;
  name: string;
  sku: string;
  salePrice: string | number;
  unit: string;
};

type Warehouse = { id: string; name: string };

type CartLine = {
  productId: string;
  name: string;
  price: number;
  quantity: number;
};

/**
 * صندوق فروش (POS) — بهینه‌شده برای لمس روی موبایل و تبلت
 */
export default function PosPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [warehouseId, setWarehouseId] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  const fa = (v: unknown) => Number(v ?? 0).toLocaleString('fa-IR');

  const load = useCallback(async () => {
    try {
      const [p, w] = await Promise.all([
        api<Product[] | { data: Product[] }>('/products?limit=200'),
        api<Warehouse[] | { data: Warehouse[] }>('/warehouses'),
      ]);

      const list = Array.isArray(p) ? p : (p.data ?? []);
      const whs = Array.isArray(w) ? w : (w.data ?? []);

      setProducts(list);
      setWarehouses(whs);
      setWarehouseId((prev) => prev || (whs[0]?.id ?? ''));
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در دریافت اطلاعات');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();

    if (!q) return products.slice(0, 40);

    return products
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q),
      )
      .slice(0, 40);
  }, [products, search]);

  const total = useMemo(
    () => cart.reduce((sum, line) => sum + line.price * line.quantity, 0),
    [cart],
  );

  function add(product: Product) {
    setCart((prev) => {
      const found = prev.find((line) => line.productId === product.id);

      if (found) {
        return prev.map((line) =>
          line.productId === product.id
            ? { ...line, quantity: line.quantity + 1 }
            : line,
        );
      }

      return [
        ...prev,
        {
          productId: product.id,
          name: product.name,
          price: Number(product.salePrice),
          quantity: 1,
        },
      ];
    });
  }

  function changeQty(productId: string, delta: number) {
    setCart((prev) =>
      prev
        .map((line) =>
          line.productId === productId
            ? { ...line, quantity: line.quantity + delta }
            : line,
        )
        .filter((line) => line.quantity > 0),
    );
  }

  async function checkout() {
    if (!cart.length) return;

    if (!warehouseId) {
      setError('ابتدا انبار را انتخاب کنید');
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');

    try {
      const sale = await api<{ invoiceNo: string }>('/sales', {
        method: 'POST',
        body: {
          warehouseId,
          paidAmount: total,
          paymentMethod: 'CASH',
          items: cart.map((line) => ({
            productId: line.productId,
            quantity: line.quantity,
            price: line.price,
          })),
        },
      });

      setMessage(`فاکتور ${sale.invoiceNo} ثبت شد ✅`);
      setCart([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در ثبت فاکتور');
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell title="صندوق فروش" subtitle="ثبت سریع فاکتور">
      {error ? <div className="error">{error}</div> : null}
      {message ? (
        <div
          className="error"
          style={{
            background: 'rgba(52,211,153,0.12)',
            borderColor: 'rgba(52,211,153,0.35)',
            color: '#a7f3d0',
          }}
        >
          {message}
        </div>
      ) : null}

      {/* سبد خرید */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 12,
            gap: 10,
            flexWrap: 'wrap',
          }}
        >
          <h3>🛒 سبد ({fa(cart.length)})</h3>

          <select
            value={warehouseId}
            onChange={(event) => setWarehouseId(event.target.value)}
            style={{
              padding: '10px 14px',
              borderRadius: 12,
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid var(--border)',
              color: 'var(--text)',
              fontFamily: 'inherit',
            }}
          >
            {warehouses.length === 0 ? <option value="">انبار…</option> : null}
            {warehouses.map((w) => (
              <option key={w.id} value={w.id} style={{ color: '#000' }}>
                {w.name}
              </option>
            ))}
          </select>
        </div>

        {cart.length === 0 ? (
          <p className="muted">کالایی انتخاب نشده — از پایین اضافه کنید.</p>
        ) : (
          <>
            {cart.map((line) => (
              <div
                key={line.productId}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 0',
                  borderBottom: '1px solid var(--border)',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>{line.name}</div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {fa(line.price)} × {fa(line.quantity)} ={' '}
                    {fa(line.price * line.quantity)}
                  </div>
                </div>

                <div className="row-actions">
                  <button
                    type="button"
                    className="btn-sm ghost"
                    onClick={() => changeQty(line.productId, -1)}
                  >
                    −
                  </button>
                  <button
                    type="button"
                    className="btn-sm"
                    onClick={() => changeQty(line.productId, 1)}
                  >
                    +
                  </button>
                </div>
              </div>
            ))}

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginTop: 16,
                gap: 12,
                flexWrap: 'wrap',
              }}
            >
              <div style={{ fontSize: 19, fontWeight: 800 }}>
                جمع: {fa(total)}
              </div>

              <button
                type="button"
                onClick={() => void checkout()}
                disabled={saving}
              >
                {saving ? 'در حال ثبت…' : 'ثبت و پرداخت نقدی'}
              </button>
            </div>
          </>
        )}
      </div>

      {/* انتخاب کالا */}
      <div className="card">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="جستجوی کالا یا بارکد…"
          style={{ marginBottom: 14 }}
        />

        {filtered.length === 0 ? (
          <p className="muted">کالایی یافت نشد.</p>
        ) : (
          <div className="grid-auto">
            {filtered.map((product) => (
              <button
                key={product.id}
                type="button"
                className="stat-card"
                style={{
                  textAlign: 'start',
                  boxShadow: 'none',
                  background: 'var(--panel)',
                  padding: 14,
                }}
                onClick={() => add(product)}
              >
                <div style={{ fontWeight: 700, fontSize: 14 }}>
                  {product.name}
                </div>
                <div
                  className="muted"
                  style={{ fontSize: 12, marginTop: 4 }}
                >
                  {product.sku}
                </div>
                <div style={{ marginTop: 8, fontWeight: 700 }}>
                  {fa(product.salePrice)}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}

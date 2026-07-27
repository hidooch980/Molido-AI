'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AppShell from '../../components/AppShell';
import { api } from '../../lib/api';

type Product = {
  id: string;
  name: string;
  sku: string;
  barcode?: string | null;
  salePrice: string | number;
  unit: string;
  trackInventory?: boolean;
  inventories?: Array<{ warehouseId: string; quantity: string | number }>;
};

type Warehouse = { id: string; name: string };
type CashBox = { id: string; name: string };
type Customer = { id: string; firstName: string; lastName: string };

type CartLine = {
  productId: string;
  name: string;
  unit: string;
  price: number;
  quantity: number;
  /** تخفیف ریالی روی کل ردیف */
  discount: number;
};

const PAYMENT_METHODS = [
  { value: 'CASH', label: 'نقدی', icon: '💵' },
  { value: 'CARD', label: 'کارت‌خوان', icon: '💳' },
  { value: 'BANK_TRANSFER', label: 'انتقال بانکی', icon: '🏦' },
  { value: 'CHEQUE', label: 'چک', icon: '📃' },
] as const;

const QUICK_CASH = [100_000, 200_000, 500_000, 1_000_000, 2_000_000];

/**
 * صندوق فروش سوپرمارکت
 *
 * جریان کار صندوق‌دار کاملاً کیبوردی است: بارکدخوان مثل کیبورد تایپ می‌کند
 * و Enter می‌زند، پس فوکوس همیشه روی فیلد اسکن برمی‌گردد.
 */
export default function PosPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [cashBoxes, setCashBoxes] = useState<CashBox[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);

  const [warehouseId, setWarehouseId] = useState('');
  const [cashBoxId, setCashBoxId] = useState('');
  const [customerId, setCustomerId] = useState('');

  const [cart, setCart] = useState<CartLine[]>([]);
  const [search, setSearch] = useState('');
  const [invoiceDiscount, setInvoiceDiscount] = useState(0);
  const [taxRate, setTaxRate] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<string>('CASH');
  const [received, setReceived] = useState<number | ''>('');

  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [lastSale, setLastSale] = useState<{
    invoiceNo: string;
    lines: CartLine[];
    subtotal: number;
    discount: number;
    tax: number;
    total: number;
    paid: number;
    change: number;
    at: string;
  } | null>(null);

  const scanRef = useRef<HTMLInputElement>(null);

  const fa = (v: unknown) => Number(v ?? 0).toLocaleString('fa-IR');

  // ------------------------------------------------------------ بارگذاری

  const load = useCallback(async () => {
    try {
      const unwrap = <T,>(v: T[] | { data: T[] }): T[] =>
        Array.isArray(v) ? v : (v?.data ?? []);

      const [p, w, c, cb] = await Promise.all([
        api<Product[] | { data: Product[] }>('/products?limit=200'),
        api<Warehouse[] | { data: Warehouse[] }>('/warehouses'),
        api<Customer[] | { data: Customer[] }>('/customers?limit=200').catch(
          () => [] as Customer[],
        ),
        api<CashBox[] | { data: CashBox[] }>('/cashbox').catch(
          () => [] as CashBox[],
        ),
      ]);

      const whs = unwrap(w);
      const boxes = unwrap(cb);

      setProducts(unwrap(p));
      setWarehouses(whs);
      setCustomers(unwrap(c));
      setCashBoxes(boxes);
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

  useEffect(() => {
    scanRef.current?.focus();
  }, [cart.length]);

  // ------------------------------------------------------------ محاسبات

  const subtotal = useMemo(
    () =>
      cart.reduce(
        (sum, line) => sum + line.price * line.quantity - line.discount,
        0,
      ),
    [cart],
  );

  const tax = useMemo(
    () => Math.round(((subtotal - invoiceDiscount) * taxRate) / 100),
    [subtotal, invoiceDiscount, taxRate],
  );

  const total = Math.max(0, subtotal - invoiceDiscount + tax);
  const paid = received === '' ? 0 : Number(received);
  const change = paid > total ? paid - total : 0;
  const itemCount = cart.reduce((n, l) => n + l.quantity, 0);

  /** موجودی کالا در انبار انتخاب‌شده. */
  const stockOf = useCallback(
    (product: Product) => {
      if (product.trackInventory === false) return Infinity;

      const row = product.inventories?.find(
        (i) => i.warehouseId === warehouseId,
      );

      return Number(row?.quantity ?? 0);
    },
    [warehouseId],
  );

  // ------------------------------------------------------------ سبد

  const addProduct = useCallback((product: Product, qty = 1) => {
    setCart((prev) => {
      const found = prev.find((line) => line.productId === product.id);

      if (found) {
        return prev.map((line) =>
          line.productId === product.id
            ? { ...line, quantity: line.quantity + qty }
            : line,
        );
      }

      return [
        ...prev,
        {
          productId: product.id,
          name: product.name,
          unit: product.unit,
          price: Number(product.salePrice),
          quantity: qty,
          discount: 0,
        },
      ];
    });

    setMessage('');
  }, []);

  function setQty(productId: string, quantity: number) {
    setCart((prev) =>
      prev
        .map((line) =>
          line.productId === productId ? { ...line, quantity } : line,
        )
        .filter((line) => line.quantity > 0),
    );
  }

  function setLineDiscount(productId: string, discount: number) {
    setCart((prev) =>
      prev.map((line) =>
        line.productId === productId
          ? { ...line, discount: Math.max(0, discount) }
          : line,
      ),
    );
  }

  function removeLine(productId: string) {
    setCart((prev) => prev.filter((line) => line.productId !== productId));
  }

  const resetSale = useCallback(() => {
    setCart([]);
    setInvoiceDiscount(0);
    setReceived('');
    setCustomerId('');
    setSearch('');
  }, []);

  // ------------------------------------------------------------ بارکد

  /**
   * ابتدا در حافظه محلی جستجو می‌کنیم تا اسکن سریع باشد؛
   * اگر نبود از API می‌پرسیم (کالای تازه‌اضافه‌شده).
   */
  async function handleScan(raw: string) {
    const code = raw.trim();

    if (!code) return;

    const local = products.find(
      (p) => p.barcode === code || p.sku.toLowerCase() === code.toLowerCase(),
    );

    if (local) {
      addProduct(local);
      setSearch('');

      return;
    }

    try {
      const found = await api<Product>(
        `/products/barcode/${encodeURIComponent(code)}`,
      );

      addProduct(found);
      setSearch('');
      setError('');
    } catch {
      setError(`کالایی با بارکد «${code}» یافت نشد`);
      setSearch('');
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();

    if (!q) return products.slice(0, 24);

    return products
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          (p.barcode ?? '').includes(q),
      )
      .slice(0, 24);
  }, [products, search]);

  // ------------------------------------------------------------ ثبت

  const checkout = useCallback(async () => {
    if (!cart.length || saving) return;

    if (!warehouseId) {
      setError('ابتدا انبار را انتخاب کنید');

      return;
    }

    if (paid < total) {
      setError(
        `مبلغ دریافتی کافی نیست — ${fa(total - paid)} ریال باقی مانده است`,
      );

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
          ...(customerId ? { customerId } : {}),
          ...(cashBoxId ? { cashBoxId } : {}),
          discount: invoiceDiscount,
          tax,
          // بیشتر از مبلغ فاکتور ثبت نمی‌شود؛ مازاد، باقی‌مانده نقدی است.
          paidAmount: total,
          paymentMethod,
          items: cart.map((line) => ({
            productId: line.productId,
            quantity: line.quantity,
            price: line.price,
            discount: line.discount,
          })),
        },
      });

      setLastSale({
        invoiceNo: sale.invoiceNo,
        lines: cart,
        subtotal,
        discount: invoiceDiscount,
        tax,
        total,
        paid,
        change,
        at: new Date().toLocaleString('fa-IR'),
      });

      setMessage(`فاکتور ${sale.invoiceNo} ثبت شد ✅`);
      resetSale();
      void load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در ثبت فاکتور');
    } finally {
      setSaving(false);
    }
  }, [
    cart,
    saving,
    warehouseId,
    paid,
    total,
    customerId,
    cashBoxId,
    invoiceDiscount,
    tax,
    paymentMethod,
    subtotal,
    change,
    resetSale,
    load,
  ]);

  // ------------------------------------------------------------ میان‌برها

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'F2') {
        event.preventDefault();
        void checkout();
      } else if (event.key === 'F4') {
        event.preventDefault();
        resetSale();
      } else if (event.key === 'Escape') {
        scanRef.current?.focus();
      }
    }

    window.addEventListener('keydown', onKey);

    return () => window.removeEventListener('keydown', onKey);
  }, [checkout, resetSale]);

  // ------------------------------------------------------------ نمایش

  return (
    <AppShell title="صندوق فروش" subtitle="سوپرمارکت — اسکن بارکد و پرداخت">
      {error ? <div className="error">{error}</div> : null}
      {message ? <div className="ok">{message}</div> : null}

      <div className="card pos-settings">
        <label>
          <span className="muted">انبار</span>
          <select
            value={warehouseId}
            onChange={(e) => setWarehouseId(e.target.value)}
          >
            {warehouses.length === 0 ? <option value="">—</option> : null}
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </label>

        {cashBoxes.length > 0 ? (
          <label>
            <span className="muted">صندوق</span>
            <select
              value={cashBoxId}
              onChange={(e) => setCashBoxId(e.target.value)}
            >
              {cashBoxes.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <label>
          <span className="muted">مشتری</span>
          <select
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
          >
            <option value="">مشتری گذری</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.firstName} {c.lastName}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span className="muted">مالیات ٪</span>
          <input
            type="number"
            min={0}
            max={100}
            value={taxRate}
            onChange={(e) => setTaxRate(Number(e.target.value) || 0)}
          />
        </label>
      </div>

      <div className="card scan-card">
        <span className="scan-icon">📷</span>
        <input
          ref={scanRef}
          className="scan-input"
          placeholder="بارکد را اسکن کنید یا نام کالا را بنویسید…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void handleScan(search);
            }
          }}
          autoFocus
        />
        <span className="muted hint">Enter افزودن • F2 پرداخت • F4 پاک</span>
      </div>

      <div className="pos-layout">
        <div className="card">
          <h3>🛒 سبد خرید — {fa(itemCount)} قلم</h3>

          {cart.length === 0 ? (
            <p className="muted empty">
              سبد خالی است. بارکد کالا را اسکن کنید یا از فهرست پایین انتخاب
              کنید.
            </p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>کالا</th>
                    <th>تعداد</th>
                    <th>قیمت</th>
                    <th>تخفیف</th>
                    <th>جمع</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {cart.map((line) => (
                    <tr key={line.productId}>
                      <td>{line.name}</td>
                      <td>
                        <div className="qty">
                          <button
                            type="button"
                            onClick={() =>
                              setQty(line.productId, line.quantity - 1)
                            }
                          >
                            −
                          </button>
                          <input
                            type="number"
                            min={0}
                            step="0.001"
                            value={line.quantity}
                            onChange={(e) =>
                              setQty(line.productId, Number(e.target.value))
                            }
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setQty(line.productId, line.quantity + 1)
                            }
                          >
                            +
                          </button>
                        </div>
                      </td>
                      <td>{fa(line.price)}</td>
                      <td>
                        <input
                          type="number"
                          min={0}
                          className="disc-input"
                          value={line.discount}
                          onChange={(e) =>
                            setLineDiscount(
                              line.productId,
                              Number(e.target.value) || 0,
                            )
                          }
                        />
                      </td>
                      <td>
                        <strong>
                          {fa(line.price * line.quantity - line.discount)}
                        </strong>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn-sm"
                          onClick={() => removeLine(line.productId)}
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
          <h3>💰 پرداخت</h3>

          <div className="sum-row">
            <span>جمع کل</span>
            <span>{fa(subtotal)}</span>
          </div>

          <div className="sum-row">
            <span>تخفیف فاکتور</span>
            <input
              type="number"
              min={0}
              value={invoiceDiscount}
              onChange={(e) => setInvoiceDiscount(Number(e.target.value) || 0)}
            />
          </div>

          {tax > 0 ? (
            <div className="sum-row">
              <span>مالیات ({fa(taxRate)}٪)</span>
              <span>{fa(tax)}</span>
            </div>
          ) : null}

          <div className="sum-row total">
            <span>قابل پرداخت</span>
            <span>{fa(total)}</span>
          </div>

          <div className="methods">
            {PAYMENT_METHODS.map((m) => (
              <button
                key={m.value}
                type="button"
                className={paymentMethod === m.value ? 'method on' : 'method'}
                onClick={() => setPaymentMethod(m.value)}
              >
                <span>{m.icon}</span>
                {m.label}
              </button>
            ))}
          </div>

          <label className="recv">
            <span className="muted">مبلغ دریافتی</span>
            <input
              type="number"
              min={0}
              value={received}
              placeholder={String(total)}
              onChange={(e) =>
                setReceived(e.target.value === '' ? '' : Number(e.target.value))
              }
            />
          </label>

          <div className="quick">
            <button type="button" onClick={() => setReceived(total)}>
              دقیق
            </button>
            {QUICK_CASH.filter((c) => c >= total)
              .slice(0, 4)
              .map((c) => (
                <button key={c} type="button" onClick={() => setReceived(c)}>
                  {fa(c)}
                </button>
              ))}
          </div>

          <div className={change > 0 ? 'change on' : 'change'}>
            <span>باقی‌مانده مشتری</span>
            <strong>{fa(change)}</strong>
          </div>

          <button
            type="button"
            className="pay-btn"
            disabled={!cart.length || saving}
            onClick={() => void checkout()}
          >
            {saving ? 'در حال ثبت…' : `ثبت فاکتور (F2) — ${fa(total)}`}
          </button>

          <button type="button" className="btn-sm clear" onClick={resetSale}>
            پاک کردن سبد (F4)
          </button>
        </div>
      </div>

      <div className="card">
        <h3>📦 کالاها</h3>
        <div className="grid-auto">
          {filtered.map((p) => {
            const stock = stockOf(p);
            const out = stock <= 0;

            return (
              <button
                key={p.id}
                type="button"
                className={out ? 'prod out' : 'prod'}
                onClick={() => addProduct(p)}
                disabled={out}
              >
                <span className="p-name">{p.name}</span>
                <span className="p-price">{fa(p.salePrice)}</span>
                <span className="muted p-stock">
                  {out
                    ? 'ناموجود'
                    : `موجودی: ${
                        stock === Infinity ? '∞' : fa(stock)
                      } ${p.unit}`}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {lastSale ? (
        <>
          <div className="card receipt-actions">
            <span>آخرین فاکتور: {lastSale.invoiceNo}</span>
            <button type="button" onClick={() => window.print()}>
              🖨️ چاپ رسید
            </button>
          </div>

          <div className="receipt" id="receipt">
            <h2>فروشگاه</h2>
            <p>فاکتور: {lastSale.invoiceNo}</p>
            <p>{lastSale.at}</p>
            <hr />
            {lastSale.lines.map((l) => (
              <div className="r-line" key={l.productId}>
                <span>
                  {l.name} × {fa(l.quantity)}
                </span>
                <span>{fa(l.price * l.quantity - l.discount)}</span>
              </div>
            ))}
            <hr />
            <div className="r-line">
              <span>جمع</span>
              <span>{fa(lastSale.subtotal)}</span>
            </div>
            {lastSale.discount > 0 ? (
              <div className="r-line">
                <span>تخفیف</span>
                <span>{fa(lastSale.discount)}</span>
              </div>
            ) : null}
            {lastSale.tax > 0 ? (
              <div className="r-line">
                <span>مالیات</span>
                <span>{fa(lastSale.tax)}</span>
              </div>
            ) : null}
            <div className="r-line r-total">
              <span>قابل پرداخت</span>
              <span>{fa(lastSale.total)}</span>
            </div>
            <div className="r-line">
              <span>دریافتی</span>
              <span>{fa(lastSale.paid)}</span>
            </div>
            <div className="r-line">
              <span>باقی‌مانده</span>
              <span>{fa(lastSale.change)}</span>
            </div>
            <hr />
            <p className="r-thanks">با تشکر از خرید شما 🙏</p>
          </div>
        </>
      ) : null}
    </AppShell>
  );
}

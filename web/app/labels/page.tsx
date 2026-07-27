'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import AppShell from '../../components/AppShell';
import { api } from '../../lib/api';
import { ean13CheckDigit, ean13Svg, isValidEan13 } from '../../lib/barcode';

type Product = {
  id: string;
  name: string;
  sku: string;
  barcode?: string | null;
  salePrice: string | number;
  unit: string;
};

/** یک برچسب برای چاپ */
type Label = { product: Product; count: number };

/**
 * چاپ برچسب بارکد.
 *
 * بارکد به صورت SVG و کاملاً محلی تولید می‌شود (بدون سرویس بیرونی) تا
 * در نسخه دسکتاپ آفلاین هم کار کند.
 */
export default function LabelsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState('');
  const [labels, setLabels] = useState<Label[]>([]);
  const [error, setError] = useState('');

  const fa = (v: unknown) => Number(v ?? 0).toLocaleString('fa-IR');

  const load = useCallback(async () => {
    try {
      const res = await api<Product[] | { data: Product[] }>('/products?limit=200');

      setProducts(Array.isArray(res) ? res : (res?.data ?? []));
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در دریافت کالاها');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();

    if (!q) return products.slice(0, 16);

    return products
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          (p.barcode ?? '').includes(q),
      )
      .slice(0, 16);
  }, [products, search]);

  const withoutBarcode = useMemo(
    () => products.filter((p) => !p.barcode || !isValidEan13(p.barcode)),
    [products],
  );

  function addLabel(p: Product) {
    setLabels((prev) => {
      const found = prev.find((l) => l.product.id === p.id);

      if (found) {
        return prev.map((l) =>
          l.product.id === p.id ? { ...l, count: l.count + 1 } : l,
        );
      }

      return [...prev, { product: p, count: 1 }];
    });
  }

  function setCount(id: string, count: number) {
    setLabels((prev) =>
      prev
        .map((l) => (l.product.id === id ? { ...l, count } : l))
        .filter((l) => l.count > 0),
    );
  }

  /** فهرست تخت برچسب‌ها برای چاپ (هر تکرار یک برچسب). */
  const printable = useMemo(
    () =>
      labels.flatMap((l) =>
        Array.from({ length: l.count }, (_, i) => ({
          key: `${l.product.id}-${i}`,
          product: l.product,
        })),
      ),
    [labels],
  );

  return (
    <AppShell title="چاپ برچسب" subtitle="برچسب بارکد و قیمت برای قفسه">
      {error ? <div className="error">{error}</div> : null}

      {withoutBarcode.length > 0 ? (
        <div className="error">
          {fa(withoutBarcode.length)} کالا بارکد معتبر EAN-13 ندارد و برچسب آن‌ها
          بدون بارکد چاپ می‌شود. نمونه رقم کنترل صحیح برای
          «{withoutBarcode[0].name}»:{' '}
          {withoutBarcode[0].barcode && /^\d{12,13}$/.test(withoutBarcode[0].barcode)
            ? `${withoutBarcode[0].barcode.slice(0, 12)}${ean13CheckDigit(withoutBarcode[0].barcode.slice(0, 12))}`
            : '— بارکد ثبت نشده'}
        </div>
      ) : null}

      <div className="card scan-card">
        <span className="scan-icon">🏷️</span>
        <input
          className="scan-input"
          placeholder="نام، کد یا بارکد کالا…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="card">
        <h3>📦 انتخاب کالا</h3>
        <div className="grid-auto">
          {filtered.map((p) => (
            <button key={p.id} type="button" className="prod" onClick={() => addLabel(p)}>
              <span className="p-name">{p.name}</span>
              <span className="p-price">{fa(p.salePrice)}</span>
              <span className="muted p-stock">
                {p.barcode && isValidEan13(p.barcode) ? p.barcode : '⚠️ بدون بارکد معتبر'}
              </span>
            </button>
          ))}
        </div>
      </div>

      {labels.length > 0 ? (
        <div className="card">
          <div className="receipt-actions" style={{ marginBottom: 14 }}>
            <span>
              {fa(printable.length)} برچسب آماده چاپ
            </span>
            <button type="button" onClick={() => window.print()}>
              🖨️ چاپ برچسب‌ها
            </button>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>کالا</th>
                  <th>بارکد</th>
                  <th>تعداد برچسب</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {labels.map((l) => (
                  <tr key={l.product.id}>
                    <td>{l.product.name}</td>
                    <td className="muted">{l.product.barcode ?? '—'}</td>
                    <td>
                      <input
                        type="number"
                        min={0}
                        className="disc-input"
                        value={l.count}
                        onChange={(e) =>
                          setCount(l.product.id, Number(e.target.value) || 0)
                        }
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn-sm"
                        onClick={() => setCount(l.product.id, 0)}
                      >
                        حذف
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* پیش‌نمایش */}
          <h3 style={{ marginTop: 20 }}>پیش‌نمایش</h3>
          <div className="label-preview">
            {labels.slice(0, 4).map((l) => (
              <LabelCard key={l.product.id} product={l.product} fa={fa} />
            ))}
          </div>
        </div>
      ) : null}

      {/* صفحه چاپ */}
      <div className="label-sheet">
        {printable.map((item) => (
          <LabelCard key={item.key} product={item.product} fa={fa} />
        ))}
      </div>
    </AppShell>
  );
}

function LabelCard({
  product,
  fa,
}: {
  product: Product;
  fa: (v: unknown) => string;
}) {
  const svg = product.barcode ? ean13Svg(product.barcode, { width: 2, height: 46 }) : null;

  return (
    <div className="label">
      <div className="label-name">{product.name}</div>
      <div className="label-price">{fa(product.salePrice)} ریال</div>
      {svg ? (
        <div
          className="label-barcode"
          // بارکد کاملاً محلی و از روی رقم‌های عددی ساخته می‌شود.
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      ) : (
        <div className="label-nobarcode">{product.sku}</div>
      )}
    </div>
  );
}

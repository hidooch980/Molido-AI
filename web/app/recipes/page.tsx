'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import AppShell from '../../components/AppShell';
import { api } from '../../lib/api';

type MenuItem = {
  id: string;
  name: string;
  code?: string | null;
  price: string | number;
  cost: string | number;
  categoryId?: string | null;
  category?: { id: string; name: string } | null;
};

type Product = {
  id: string;
  name: string;
  sku: string;
  unit: string;
  purchasePrice: string | number;
};

type RecipeLine = {
  id?: string;
  productId: string;
  qty: number;
  unit?: string | null;
  wastePct: number;
  product?: { id: string; name: string; unit: string; sku?: string };
};

/**
 * رسپی آیتم‌های منو — مواد اولیه هر غذا.
 *
 * بدون رسپی، قابلیت «کسر خودکار مواد اولیه از انبار» هنگام تسویه سفارش
 * عملاً غیرفعال است؛ بک‌اند آن را پیاده کرده ولی راهی برای تعریف رسپی
 * وجود نداشت.
 */
export default function RecipesPage() {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selected, setSelected] = useState<MenuItem | null>(null);
  const [lines, setLines] = useState<RecipeLine[]>([]);

  const [itemSearch, setItemSearch] = useState('');
  const [prodSearch, setProdSearch] = useState('');

  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [loadingRecipe, setLoadingRecipe] = useState(false);

  const fa = (v: unknown) => Number(v ?? 0).toLocaleString('fa-IR');

  const load = useCallback(async () => {
    try {
      const unwrap = <T,>(v: T[] | { data: T[] }): T[] =>
        Array.isArray(v) ? v : (v?.data ?? []);

      const [mi, p] = await Promise.all([
        api<MenuItem[] | { data: MenuItem[] }>('/restaurant/menu-items'),
        api<Product[] | { data: Product[] }>('/products?limit=200'),
      ]);

      setItems(unwrap(mi));
      setProducts(unwrap(p));
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در دریافت اطلاعات');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** رسپی آیتم انتخاب‌شده را می‌گیرد. */
  const openItem = useCallback(async (item: MenuItem) => {
    setSelected(item);
    setLines([]);
    setLoadingRecipe(true);
    setError('');
    setMessage('');

    try {
      const recipe = await api<RecipeLine[]>(
        `/restaurant/menu-items/${item.id}/recipe`,
      );

      setLines(
        (Array.isArray(recipe) ? recipe : []).map((r) => ({
          productId: r.productId,
          qty: Number(r.qty),
          unit: r.unit ?? r.product?.unit ?? null,
          wastePct: Number(r.wastePct ?? 0),
          product: r.product,
        })),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در دریافت رسپی');
    } finally {
      setLoadingRecipe(false);
    }
  }, []);

  const filteredItems = useMemo(() => {
    const q = itemSearch.trim().toLowerCase();

    if (!q) return items;

    return items.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        (i.code ?? '').toLowerCase().includes(q),
    );
  }, [items, itemSearch]);

  const filteredProducts = useMemo(() => {
    const q = prodSearch.trim().toLowerCase();

    if (!q) return [];

    const used = new Set(lines.map((l) => l.productId));

    return products
      .filter((p) => !used.has(p.id))
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [products, prodSearch, lines]);

  /**
   * بهای تمام‌شده = مجموع (مقدار × قیمت خرید) با احتساب ضایعات.
   * ضایعات یعنی برای تولید qty واحد، باید qty/(1-waste) مصرف شود.
   */
  const cost = useMemo(
    () =>
      lines.reduce((sum, l) => {
        const p = products.find((x) => x.id === l.productId);

        if (!p) return sum;

        const waste = Math.min(Math.max(l.wastePct, 0), 99) / 100;
        const effective = l.qty / (1 - waste);

        return sum + effective * Number(p.purchasePrice);
      }, 0),
    [lines, products],
  );

  const price = Number(selected?.price ?? 0);
  const margin = price > 0 ? ((price - cost) / price) * 100 : 0;

  function addLine(p: Product) {
    setLines((prev) => [
      ...prev,
      {
        productId: p.id,
        qty: 1,
        unit: p.unit,
        wastePct: 0,
        product: { id: p.id, name: p.name, unit: p.unit, sku: p.sku },
      },
    ]);
    setProdSearch('');
  }

  function patchLine(productId: string, patch: Partial<RecipeLine>) {
    setLines((prev) =>
      prev.map((l) => (l.productId === productId ? { ...l, ...patch } : l)),
    );
  }

  function removeLine(productId: string) {
    setLines((prev) => prev.filter((l) => l.productId !== productId));
  }

  async function save() {
    if (!selected || busy) return;

    setBusy(true);
    setError('');
    setMessage('');

    try {
      await api(`/restaurant/menu-items/${selected.id}/recipe`, {
        method: 'POST',
        body: {
          lines: lines.map((l) => ({
            productId: l.productId,
            qty: l.qty,
            unit: l.unit ?? undefined,
            wastePct: l.wastePct,
          })),
        },
      });

      setMessage(`رسپی «${selected.name}» ذخیره شد ✅`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در ذخیره رسپی');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell
      title="رسپی غذاها"
      subtitle="مواد اولیه هر آیتم منو — پایه کسر خودکار از انبار"
    >
      {error ? <div className="error">{error}</div> : null}
      {message ? <div className="ok">{message}</div> : null}

      <div className="recipe-layout">
        {/* ───────── فهرست آیتم‌های منو ───────── */}
        <div className="card">
          <h3>🍽️ آیتم‌های منو</h3>

          <input
            className="disc-input"
            style={{ width: '100%', marginBottom: 10 }}
            placeholder="جستجوی آیتم…"
            value={itemSearch}
            onChange={(e) => setItemSearch(e.target.value)}
          />

          {filteredItems.length === 0 ? (
            <p className="muted empty">آیتمی یافت نشد.</p>
          ) : (
            <div className="item-list">
              {filteredItems.map((i) => (
                <button
                  key={i.id}
                  type="button"
                  className={
                    selected?.id === i.id ? 'item-row on' : 'item-row'
                  }
                  onClick={() => void openItem(i)}
                >
                  <span className="i-name">{i.name}</span>
                  <span className="muted i-price">{fa(i.price)}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ───────── ویرایش رسپی ───────── */}
        <div className="card">
          {!selected ? (
            <p className="muted empty">
              برای دیدن یا ویرایش رسپی، یک آیتم منو انتخاب کنید.
            </p>
          ) : (
            <>
              <h3>📋 رسپی «{selected.name}»</h3>

              <input
                className="disc-input"
                style={{ width: '100%', margin: '10px 0' }}
                placeholder="افزودن ماده اولیه — نام یا کد کالا…"
                value={prodSearch}
                onChange={(e) => setProdSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && filteredProducts.length > 0) {
                    e.preventDefault();
                    addLine(filteredProducts[0]);
                  }
                }}
              />

              {filteredProducts.length > 0 ? (
                <div className="grid-auto" style={{ marginBottom: 12 }}>
                  {filteredProducts.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className="prod"
                      onClick={() => addLine(p)}
                    >
                      <span className="p-name">{p.name}</span>
                      <span className="muted p-stock">
                        {fa(p.purchasePrice)} / {p.unit}
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}

              {loadingRecipe ? (
                <p className="muted empty">در حال بارگذاری رسپی…</p>
              ) : lines.length === 0 ? (
                <p className="muted empty">
                  رسپی خالی است — هنگام فروش، چیزی از انبار کسر نمی‌شود.
                </p>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>ماده اولیه</th>
                        <th>مقدار</th>
                        <th>واحد</th>
                        <th>ضایعات ٪</th>
                        <th>مصرف واقعی</th>
                        <th>بها</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((l) => {
                        const p = products.find((x) => x.id === l.productId);
                        const waste =
                          Math.min(Math.max(l.wastePct, 0), 99) / 100;
                        const effective = l.qty / (1 - waste);

                        return (
                          <tr key={l.productId}>
                            <td>{l.product?.name ?? p?.name ?? '—'}</td>
                            <td>
                              <input
                                type="number"
                                min={0}
                                step="0.001"
                                className="disc-input"
                                value={l.qty}
                                onChange={(e) =>
                                  patchLine(l.productId, {
                                    qty: Number(e.target.value) || 0,
                                  })
                                }
                              />
                            </td>
                            <td className="muted">
                              {l.unit ?? p?.unit ?? '—'}
                            </td>
                            <td>
                              <input
                                type="number"
                                min={0}
                                max={99}
                                className="disc-input"
                                value={l.wastePct}
                                onChange={(e) =>
                                  patchLine(l.productId, {
                                    wastePct: Number(e.target.value) || 0,
                                  })
                                }
                              />
                            </td>
                            <td>{effective.toLocaleString('fa-IR', {
                              maximumFractionDigits: 3,
                            })}</td>
                            <td>
                              {fa(
                                effective * Number(p?.purchasePrice ?? 0),
                              )}
                            </td>
                            <td>
                              <button
                                type="button"
                                className="btn-sm"
                                onClick={() => removeLine(l.productId)}
                              >
                                حذف
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* خلاصه سودآوری */}
              <div className="margin-box">
                <div className="sum-row">
                  <span>بهای تمام‌شده (با ضایعات)</span>
                  <span>{fa(Math.round(cost))}</span>
                </div>
                <div className="sum-row">
                  <span>قیمت فروش</span>
                  <span>{fa(price)}</span>
                </div>
                <div className="sum-row total">
                  <span>حاشیه سود</span>
                  <span
                    style={{
                      color:
                        margin < 0
                          ? '#fecaca'
                          : margin < 20
                            ? '#fde68a'
                            : '#a7f3d0',
                    }}
                  >
                    {price > 0
                      ? `${margin.toLocaleString('fa-IR', {
                          maximumFractionDigits: 1,
                        })}٪`
                      : '—'}
                  </span>
                </div>

                {margin < 0 && price > 0 ? (
                  <p className="muted" style={{ fontSize: 12.5 }}>
                    ⚠️ بهای مواد از قیمت فروش بیشتر است — این آیتم زیان‌ده است.
                  </p>
                ) : null}
              </div>

              <button
                type="button"
                className="pay-btn"
                disabled={busy}
                onClick={() => void save()}
              >
                {busy ? 'در حال ذخیره…' : 'ذخیره رسپی'}
              </button>
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}

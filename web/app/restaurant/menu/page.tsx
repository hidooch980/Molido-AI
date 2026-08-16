'use client';

/**
 * مدیریت منو.
 *
 * تا امروز افزودن یک غذا فقط با `curl` ممکن بود — یازده مسیر API وجود
 * داشت و هیچ صفحه‌ای صدایشان نمی‌زد.  رستورانی که نتواند غذایش را
 * تعریف کند، بقیهٔ سامانه برایش بی‌معنی است.
 *
 * برخلاف صفحهٔ آشپزخانه، این صفحه پشت اجاق استفاده نمی‌شود بلکه در
 * دفتر و معمولاً یک بار در ابتدای کار و بعد گاه‌به‌گاه.  پس چگالی
 * اطلاعات مهم‌تر از درشتی است: فهرست، نه کارت‌های بزرگ.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import AppShell from '../../../components/AppShell';
import { api } from '../../../lib/api';

type Category = { id: string; name: string; sortOrder?: number };

type Product = {
  id: string;
  name: string;
  sku: string | null;
  unit: string | null;
  purchasePrice: string | number | null;
};

type RecipeLine = {
  id?: string;
  productId: string;
  productName?: string;
  productUnit?: string | null;
  qty: string | number;
  unit: string | null;
  wastePct: string | number | null;
};

type Item = {
  id: string;
  categoryId: string | null;
  categoryName: string | null;
  name: string;
  code: string | null;
  price: string | number;
  cost: string | number | null;
  station: string | null;
  prepMinutes: number | null;
  isAvailable: boolean;
};

/** همان مقادیری که `StationDto` در بک‌اند می‌پذیرد. */
const STATIONS = ['KITCHEN', 'GRILL', 'COLD', 'BAR', 'COFFEE', 'DESSERT'] as const;

const STATION_FA: Record<string, string> = {
  KITCHEN: 'آشپزخانه',
  GRILL: 'گریل',
  COLD: 'سرد',
  BAR: 'بار',
  COFFEE: 'کافی',
  DESSERT: 'دسر',
};

const money = (v: string | number | null | undefined) =>
  v === null || v === undefined || v === ''
    ? '—'
    : Number(v).toLocaleString('fa-IR');

type Draft = {
  name: string;
  price: string;
  cost: string;
  code: string;
  categoryId: string;
  station: string;
  prepMinutes: string;
};

const EMPTY_DRAFT: Draft = {
  name: '',
  price: '',
  cost: '',
  code: '',
  categoryId: '',
  station: '',
  prepMinutes: '',
};

export default function MenuAdminPage() {
  const [cats, setCats] = useState<Category[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [filterCat, setFilterCat] = useState('');
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [editing, setEditing] = useState<string | null>(null);
  const [newCat, setNewCat] = useState('');

  // رسپی: کدام غذا باز است، خطوطش، و فهرست کالاهای انبار برای انتخاب.
  const [recipeFor, setRecipeFor] = useState<Item | null>(null);
  const [lines, setLines] = useState<RecipeLine[]>([]);
  const [products, setProducts] = useState<Product[]>([]);

  /**
   * ⚠️ در مسیر موفق خطا را **پاک نمی‌کند**.
   *
   * نسخهٔ اول اینجا `setError('')` داشت.  نتیجه‌اش این بود که هر
   * عملیاتی که خطا می‌داد و بعد فهرست را تازه می‌کرد، پیام خطایش بی‌صدا
   * محو می‌شد: «سه میز افزوده شد، سه‌تا تکراری بود» کاملاً ناپدید
   * می‌شد و کاربر فقط می‌دید تعداد میزها آن نیست که خواسته بود.
   *
   * پاک کردن خطا کارِ *شروعِ* هر عملیات است، نه کارِ بارگذاری.
   */
  const load = useCallback(async () => {
    try {
      // هر دو با هم: دستهٔ بدون قلم و قلمِ بدون دسته هر دو باید دیده شوند.
      const [c, i] = await Promise.all([
        api<Category[]>('/restaurant/menu-categories'),
        api<Item[]>('/restaurant/menu-items?limit=500'),
      ]);
      setCats(c);
      setItems(i);
    } catch (caught) {
      setError((caught as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * فیلتر در خود صفحه انجام می‌شود، نه با درخواست تازه.
   *
   * منوی یک رستوران چند صد قلم است نه چند صد هزار، و تایپ در جعبهٔ
   * جست‌وجو نباید به ازای هر حرف یک رفت‌وبرگشت شبکه بسازد.
   */
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((it) => {
      if (filterCat && (it.categoryId ?? '') !== filterCat) return false;
      if (!q) return true;
      return (
        it.name.toLowerCase().includes(q) ||
        (it.code ?? '').toLowerCase().includes(q)
      );
    });
  }, [items, filterCat, search]);

  const flash = (message: string) => {
    setNote(message);
    window.setTimeout(() => setNote(''), 2500);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');

    const price = Number(draft.price);
    if (!draft.name.trim()) {
      setError('نام غذا را بنویسید');
      return;
    }
    // بک‌اند هم این را رد می‌کند؛ گرفتنش اینجا فقط رفت‌وبرگشت را حذف
    // می‌کند و خطا را کنار همان میدان نگه می‌دارد.
    if (!Number.isFinite(price) || price < 0) {
      setError('قیمت باید عددی نامنفی باشد');
      return;
    }

    // میدان‌های خالی اصلاً فرستاده نمی‌شوند: `station: ''` را
    // اعتبارسنجی بک‌اند رد می‌کند چون عضو enum نیست.
    const body: Record<string, unknown> = {
      name: draft.name.trim(),
      price,
    };
    if (draft.cost.trim()) body.cost = Number(draft.cost);
    if (draft.code.trim()) body.code = draft.code.trim();
    if (draft.categoryId) body.categoryId = draft.categoryId;
    if (draft.station) body.station = draft.station;
    if (draft.prepMinutes.trim()) body.prepMinutes = Number(draft.prepMinutes);

    setBusy('save');
    try {
      if (editing) {
        await api(`/restaurant/menu-items/${editing}`, { method: 'PATCH', body });
        flash('ویرایش شد');
      } else {
        await api('/restaurant/menu-items', { method: 'POST', body });
        flash('افزوده شد');
      }
      setDraft(EMPTY_DRAFT);
      setEditing(null);
      await load();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const startEdit = (it: Item) => {
    setEditing(it.id);
    setDraft({
      name: it.name,
      price: String(it.price ?? ''),
      cost: it.cost === null || it.cost === undefined ? '' : String(it.cost),
      code: it.code ?? '',
      categoryId: it.categoryId ?? '',
      station: it.station ?? '',
      prepMinutes: it.prepMinutes === null ? '' : String(it.prepMinutes),
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const toggle = async (it: Item) => {
    setError('');
    setBusy(it.id);
    // خوش‌بینانه: «تمام شد» را وسط سرویس می‌زنند و باید فوری اثر کند.
    setItems((prev) =>
      prev.map((x) => (x.id === it.id ? { ...x, isAvailable: !x.isAvailable } : x)),
    );
    try {
      await api(`/restaurant/menu-items/${it.id}/toggle`, { method: 'PATCH' });
    } catch (caught) {
      setError((caught as Error).message);
      await load();
    } finally {
      setBusy(null);
    }
  };

  const remove = async (it: Item) => {
    if (!window.confirm(`«${it.name}» حذف شود؟`)) return;
    setError('');
    setBusy(it.id);
    try {
      await api(`/restaurant/menu-items/${it.id}`, { method: 'DELETE' });
      flash('حذف شد');
      await load();
    } catch (caught) {
      // غذایی که در سفارشی به کار رفته حذف نمی‌شود؛ پیام بک‌اند
      // دقیق‌تر از هر چیزی است که اینجا بنویسیم.
      setError((caught as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const addCategory = async () => {
    const name = newCat.trim();
    if (!name) return;
    setError('');
    setBusy('cat');
    try {
      await api('/restaurant/menu-categories', { method: 'POST', body: { name } });
      setNewCat('');
      flash('دسته افزوده شد');
      await load();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(null);
    }
  };

  /**
   * باز کردن رسپی یک غذا.
   *
   * رسپی همان چیزی است که هنگام تسویه مواد اولیه را از انبار کم می‌کند
   * و بهای واقعی هر پرس را می‌سازد.  سه مسیر API داشت و هیچ صفحه‌ای
   * صدایشان نمی‌زد — یعنی کسر خودکار انبار عملاً خاموش بود.
   */
  const openRecipe = async (it: Item) => {
    setRecipeFor(it);
    setLines([]);
    setError('');
    setBusy(`recipe-${it.id}`);
    try {
      const [r, p] = await Promise.all([
        api<RecipeLine[]>(`/restaurant/menu-items/${it.id}/recipe`),
        // کالاها فقط یک بار گرفته می‌شوند؛ دفعهٔ بعد از حافظه می‌آیند.
        products.length
          ? Promise.resolve({ data: products })
          : api<{ data: Product[] }>('/products?limit=500'),
      ]);
      setLines(r);
      if (!products.length) setProducts((p as { data: Product[] }).data ?? []);
      setError('');
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const addLine = () => {
    const first = products[0];
    if (!first) {
      setError('کالایی در انبار تعریف نشده — اول ماده اولیه بسازید');
      return;
    }
    setLines((prev) => [
      ...prev,
      { productId: first.id, qty: '1', unit: first.unit ?? null, wastePct: '0' },
    ]);
  };

  const saveRecipe = async () => {
    if (!recipeFor) return;

    // خط با مقدار صفر یا منفی بی‌معنی است و بک‌اند هم ردش می‌کند؛
    // گرفتنش اینجا خطا را کنار همان سطر نگه می‌دارد.
    for (const line of lines) {
      const qty = Number(line.qty);
      if (!Number.isFinite(qty) || qty <= 0) {
        setError('مقدار هر ماده باید عددی بزرگ‌تر از صفر باشد');
        return;
      }
    }

    setBusy('recipe-save');
    try {
      await api(`/restaurant/menu-items/${recipeFor.id}/recipe`, {
        method: 'POST',
        body: {
          lines: lines.map((l) => ({
            productId: l.productId,
            qty: Number(l.qty),
            unit: l.unit || undefined,
            wastePct: Number(l.wastePct ?? 0) || 0,
          })),
        },
      });
      flash('رسپی ذخیره شد');
      setRecipeFor(null);
      setLines([]);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(null);
    }
  };

  /**
   * بهای تمام‌شده از روی رسپی.
   *
   * عمداً فقط نمایش داده می‌شود و خودکار ذخیره نمی‌شود: قیمت خرید
   * کالاها تغییر می‌کند و نوشتن بی‌اجازهٔ آن روی بهای غذا، عددی را که
   * مدیر خودش وارد کرده بی‌خبر بازنویسی می‌کند.
   */
  const recipeCost = lines.reduce((sum, l) => {
    const p = products.find((x) => x.id === l.productId);
    const unit = Number(p?.purchasePrice ?? 0);
    const qty = Number(l.qty) || 0;
    const waste = Number(l.wastePct ?? 0) || 0;
    return sum + unit * qty * (1 + waste / 100);
  }, 0);

  const countIn = (id: string) => items.filter((i) => (i.categoryId ?? '') === id).length;

  return (
    <AppShell title="منو">
      <div style={{ display: 'grid', gap: 16 }}>
        {error ? (
          <div role="alert" style={ALERT}>
            {error}
          </div>
        ) : null}
        {note ? (
          <div role="status" style={{ ...ALERT, background: '#04785722', color: '#047857' }}>
            {note}
          </div>
        ) : null}

        {recipeFor ? (
          <section style={{ ...CARD, borderColor: 'var(--accent)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={H2}>رسپی «{recipeFor.name}»</h2>
              <button type="button" style={BTN_SM} onClick={() => setRecipeFor(null)}>
                بستن
              </button>
            </div>

            <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>
              مقدار مصرفی برای <strong>یک پرس</strong>. هنگام تسویهٔ سفارش، همین
              مقدارها از انبار کم می‌شود.
            </p>

            {lines.length === 0 ? (
              <p style={{ color: 'var(--muted)', fontSize: 14, margin: 0 }}>
                هنوز ماده‌ای ثبت نشده
              </p>
            ) : (
              <div style={{ display: 'grid', gap: 8 }}>
                {lines.map((line, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: 'grid',
                      gap: 8,
                      gridTemplateColumns: 'minmax(140px, 2fr) 90px 90px 80px auto',
                      alignItems: 'center',
                    }}
                  >
                    <select
                      value={line.productId}
                      onChange={(e) =>
                        setLines((prev) =>
                          prev.map((l, i) =>
                            i === idx ? { ...l, productId: e.target.value } : l,
                          ),
                        )
                      }
                      style={INPUT}
                    >
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                          {p.sku ? ` · ${p.sku}` : ''}
                        </option>
                      ))}
                    </select>
                    <input
                      value={String(line.qty)}
                      onChange={(e) =>
                        setLines((prev) =>
                          prev.map((l, i) => (i === idx ? { ...l, qty: e.target.value } : l)),
                        )
                      }
                      style={INPUT}
                      inputMode="decimal"
                      aria-label="مقدار"
                    />
                    <input
                      value={line.unit ?? ''}
                      onChange={(e) =>
                        setLines((prev) =>
                          prev.map((l, i) => (i === idx ? { ...l, unit: e.target.value } : l)),
                        )
                      }
                      style={INPUT}
                      placeholder="واحد"
                      aria-label="واحد"
                    />
                    <input
                      value={String(line.wastePct ?? '')}
                      onChange={(e) =>
                        setLines((prev) =>
                          prev.map((l, i) =>
                            i === idx ? { ...l, wastePct: e.target.value } : l,
                          ),
                        )
                      }
                      style={INPUT}
                      inputMode="decimal"
                      placeholder="ضایعات٪"
                      aria-label="درصد ضایعات"
                    />
                    <button
                      type="button"
                      onClick={() => setLines((prev) => prev.filter((_, i) => i !== idx))}
                      style={{ ...BTN_SM, color: '#b91c1c' }}
                    >
                      حذف
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <button type="button" onClick={addLine} style={BTN}>
                افزودن ماده
              </button>
              <button
                type="button"
                onClick={saveRecipe}
                disabled={busy === 'recipe-save'}
                style={BTN_PRIMARY}
              >
                {busy === 'recipe-save' ? '…' : 'ذخیرهٔ رسپی'}
              </button>
              {/* بهای محاسبه‌شده کنار قیمت فروش می‌نشیند تا معلوم شود
                  این پرس اصلاً سود می‌دهد یا نه. */}
              <span style={{ fontSize: 14, color: 'var(--muted)' }}>
                بهای مواد: <strong>{money(Math.round(recipeCost))}</strong> ریال
                {Number(recipeFor.price) > 0 && recipeCost > 0 ? (
                  <>
                    {' · '}حاشیه{' '}
                    <strong>
                      {Math.round(
                        ((Number(recipeFor.price) - recipeCost) / Number(recipeFor.price)) * 100,
                      )}
                      ٪
                    </strong>
                  </>
                ) : null}
              </span>
            </div>
          </section>
        ) : null}

        <section style={CARD}>
          <h2 style={H2}>{editing ? 'ویرایش غذا' : 'افزودن غذا'}</h2>
          <form onSubmit={submit} style={FORM}>
            <Field label="نام">
              <input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                style={INPUT}
                placeholder="چلوکباب کوبیده"
              />
            </Field>
            <Field label="قیمت (ریال)">
              <input
                value={draft.price}
                onChange={(e) => setDraft({ ...draft, price: e.target.value })}
                style={INPUT}
                inputMode="numeric"
                placeholder="850000"
              />
            </Field>
            <Field label="بهای تمام‌شده">
              <input
                value={draft.cost}
                onChange={(e) => setDraft({ ...draft, cost: e.target.value })}
                style={INPUT}
                inputMode="numeric"
              />
            </Field>
            <Field label="دسته">
              <select
                value={draft.categoryId}
                onChange={(e) => setDraft({ ...draft, categoryId: e.target.value })}
                style={INPUT}
              >
                <option value="">— بدون دسته —</option>
                {cats.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="ایستگاه">
              <select
                value={draft.station}
                onChange={(e) => setDraft({ ...draft, station: e.target.value })}
                style={INPUT}
              >
                <option value="">— تعیین‌نشده —</option>
                {STATIONS.map((s) => (
                  <option key={s} value={s}>
                    {STATION_FA[s]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="زمان آماده‌سازی (دقیقه)">
              <input
                value={draft.prepMinutes}
                onChange={(e) => setDraft({ ...draft, prepMinutes: e.target.value })}
                style={INPUT}
                inputMode="numeric"
                placeholder="10"
              />
            </Field>
            <Field label="کد">
              <input
                value={draft.code}
                onChange={(e) => setDraft({ ...draft, code: e.target.value })}
                style={INPUT}
              />
            </Field>

            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <button type="submit" disabled={busy === 'save'} style={BTN_PRIMARY}>
                {busy === 'save' ? '…' : editing ? 'ذخیره' : 'افزودن'}
              </button>
              {editing ? (
                <button
                  type="button"
                  style={BTN}
                  onClick={() => {
                    setEditing(null);
                    setDraft(EMPTY_DRAFT);
                  }}
                >
                  انصراف
                </button>
              ) : null}
            </div>
          </form>
        </section>

        <section style={CARD}>
          <h2 style={H2}>دسته‌ها</h2>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              value={newCat}
              onChange={(e) => setNewCat(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void addCategory();
              }}
              style={{ ...INPUT, minWidth: 200 }}
              placeholder="نام دستهٔ تازه"
            />
            <button type="button" onClick={addCategory} disabled={busy === 'cat'} style={BTN}>
              افزودن دسته
            </button>
            <span style={{ color: 'var(--muted)', fontSize: 13 }}>
              {cats.length} دسته · {items.length} قلم
            </span>
          </div>
        </section>

        <section style={{ display: 'grid', gap: 10 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              type="button"
              onClick={() => setFilterCat('')}
              style={filterCat ? CHIP : CHIP_ON}
            >
              همه ({items.length})
            </button>
            {cats.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setFilterCat(c.id)}
                style={filterCat === c.id ? CHIP_ON : CHIP}
              >
                {c.name} ({countIn(c.id)})
              </button>
            ))}
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="جست‌وجو…"
              style={{ ...INPUT, minWidth: 180, marginInlineStart: 'auto' }}
            />
          </div>

          {visible.length === 0 ? (
            <p style={{ padding: 32, textAlign: 'center', color: 'var(--muted)' }}>
              قلمی یافت نشد
            </p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
                <thead>
                  <tr>
                    {['نام', 'دسته', 'ایستگاه', 'قیمت', 'بها', 'حاشیه', 'وضعیت', ''].map(
                      (h) => (
                        <th key={h} style={TH}>
                          {h}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {visible.map((it) => {
                    // حاشیهٔ سود جایی است که مدیر واقعاً نگاه می‌کند —
                    // و دقیقاً به همین دلیل نباید عددی نشان دهد که
                    // معنایش را نمی‌داند.
                    //
                    // ستون `cost` در دیتابیس `NOT NULL DEFAULT 0` است،
                    // پس «بها وارد نشده» و «بها صفر است» از هم جدا
                    // نیستند.  نسخهٔ اول صفر را واقعی می‌گرفت و برای هر
                    // غذای تازه‌ای «۱۰۰٪ حاشیه» سبز می‌نوشت — یعنی
                    // «تمامش سود است» برای غذایی که هزینه‌اش هنوز ثبت
                    // نشده.  غذایی که بهایش راستی‌راستی صفر باشد وجود
                    // ندارد، پس صفر «نامعلوم» خوانده می‌شود.
                    const price = Number(it.price);
                    const rawCost = it.cost === null ? NaN : Number(it.cost);
                    const cost = Number.isFinite(rawCost) && rawCost > 0 ? rawCost : NaN;
                    const margin =
                      Number.isFinite(cost) && price > 0
                        ? Math.round(((price - cost) / price) * 100)
                        : null;

                    return (
                      <tr key={it.id} style={{ opacity: it.isAvailable ? 1 : 0.5 }}>
                        <td style={TD}>
                          <strong>{it.name}</strong>
                          {it.code ? (
                            <span style={{ color: 'var(--muted)', fontSize: 12 }}>
                              {' '}
                              · {it.code}
                            </span>
                          ) : null}
                        </td>
                        <td style={TD}>{it.categoryName ?? '—'}</td>
                        <td style={TD}>
                          {it.station ? STATION_FA[it.station] ?? it.station : '—'}
                        </td>
                        <td style={{ ...TD, textAlign: 'left' }}>{money(it.price)}</td>
                        <td style={{ ...TD, textAlign: 'left', color: 'var(--muted)' }}>
                          {Number.isFinite(cost) ? money(cost) : '—'}
                        </td>
                        <td
                          style={{
                            ...TD,
                            textAlign: 'left',
                            color:
                              margin === null
                                ? 'var(--muted)'
                                : margin < 20
                                  ? '#b91c1c'
                                  : '#047857',
                          }}
                        >
                          {margin === null ? '—' : `${margin}٪`}
                        </td>
                        <td style={TD}>
                          <button
                            type="button"
                            onClick={() => toggle(it)}
                            disabled={busy === it.id}
                            style={it.isAvailable ? CHIP_ON : CHIP}
                          >
                            {it.isAvailable ? 'موجود' : 'تمام شد'}
                          </button>
                        </td>
                        <td style={{ ...TD, whiteSpace: 'nowrap' }}>
                          <button type="button" onClick={() => startEdit(it)} style={BTN_SM}>
                            ویرایش
                          </button>{' '}
                          <button
                            type="button"
                            onClick={() => openRecipe(it)}
                            disabled={busy === `recipe-${it.id}`}
                            style={BTN_SM}
                          >
                            رسپی
                          </button>{' '}
                          <button
                            type="button"
                            onClick={() => remove(it)}
                            disabled={busy === it.id}
                            style={{ ...BTN_SM, color: '#b91c1c' }}
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
        </section>
      </div>
    </AppShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'grid', gap: 4 }}>
      {/* برچسب همیشه دیده می‌شود، نه فقط placeholder: وقتی کاربر شروع به
          تایپ کند placeholder می‌رود و دیگر معلوم نیست میدان چیست. */}
      <span style={{ fontSize: 13, color: 'var(--muted)' }}>{label}</span>
      {children}
    </label>
  );
}

const CARD: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 12,
  padding: 16,
  display: 'grid',
  gap: 12,
};

const H2: React.CSSProperties = { margin: 0, fontSize: 17 };

const FORM: React.CSSProperties = {
  display: 'grid',
  gap: 12,
  gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
  alignItems: 'end',
};

const INPUT: React.CSSProperties = {
  padding: '9px 11px',
  borderRadius: 9,
  border: '1px solid var(--border)',
  background: 'var(--bg)',
  color: 'var(--text)',
  fontSize: 15,
  fontFamily: 'inherit',
  minHeight: 40,
};

const BTN: React.CSSProperties = {
  padding: '10px 16px',
  borderRadius: 9,
  border: '1px solid var(--border)',
  background: 'var(--surface)',
  color: 'var(--text)',
  cursor: 'pointer',
  fontSize: 15,
  fontFamily: 'inherit',
  minHeight: 40,
};

const BTN_PRIMARY: React.CSSProperties = {
  ...BTN,
  background: 'var(--accent)',
  color: '#fff',
  border: 'none',
  fontWeight: 700,
};

const BTN_SM: React.CSSProperties = {
  ...BTN,
  padding: '6px 10px',
  fontSize: 13,
  minHeight: 32,
};

const CHIP: React.CSSProperties = {
  ...BTN,
  padding: '6px 12px',
  fontSize: 13,
  minHeight: 32,
};

const CHIP_ON: React.CSSProperties = {
  ...CHIP,
  background: 'var(--accent)',
  color: '#fff',
  border: 'none',
  fontWeight: 700,
};

const TH: React.CSSProperties = {
  textAlign: 'start',
  padding: '8px 10px',
  fontSize: 13,
  color: 'var(--muted)',
  borderBottom: '1px solid var(--border)',
  fontWeight: 600,
};

const TD: React.CSSProperties = {
  padding: '9px 10px',
  fontSize: 14,
  borderBottom: '1px solid var(--border)',
};

const ALERT: React.CSSProperties = {
  padding: 12,
  borderRadius: 10,
  background: '#b91c1c22',
  color: '#b91c1c',
};

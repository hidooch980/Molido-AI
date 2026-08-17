'use client';

/**
 * چیدمان کلید سریع صندوق.
 *
 * صفحهٔ مستقل و نه بخشی از تنظیمات: مدیر معمولاً همان تبلت صندوق را
 * برمی‌دارد و چیدمان را همان‌جا می‌سازد — با دیدن دکمه‌ها در همان
 * اندازه‌ای که صندوق‌دار می‌بیند.  گم کردنش لای تنظیمات یعنی کسی
 * پیدایش نمی‌کند.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import AppShell from '../../components/AppShell';
import { Icon } from '../../components/icons';
import { TOUCH } from '../../components/ui';
import { useI18n } from '../../lib/i18n-context';
import { api } from '../../lib/api';
import { amountOnly } from '../../lib/money';

const fa = (value: unknown) => amountOnly(value);

type Key = {
  id: string;
  productId: string;
  label: string | null;
  color: string | null;
  defaultQty: string | number;
  productName: string;
  salePrice: string | number;
  unit: string | null;
};

type Group = {
  id: string;
  name: string;
  color: string | null;
  keys: Key[];
};

type Product = { id: string; name: string; sku: string; salePrice: string | number };

/**
 * رنگ‌های آماده.
 *
 * انتخابگر آزاد هم هست، ولی بیشتر کاربران یکی از این‌ها را می‌خواهند و
 * پیدا کردن «قرمز خوب» در چرخ رنگ، وقت‌گیر است.
 */
const PALETTE = [
  { hex: '#1f5eff', name: 'آبی' },
  { hex: '#047857', name: 'سبز' },
  { hex: '#b45309', name: 'نارنجی' },
  { hex: '#b91c1c', name: 'قرمز' },
  { hex: '#6d28d9', name: 'بنفش' },
  { hex: '#0f766e', name: 'فیروزه‌ای' },
];

/** روشن یا تیره کردن رنگ — عمق دکمه از تفاوت سه رنگ می‌آید. */
function shade(hex: string, amount: number): string {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return hex;

  const channels = [0, 2, 4].map((i) => {
    const value = parseInt(clean.slice(i, i + 2), 16);
    return Math.max(0, Math.min(255, value + amount));
  });

  return `#${channels.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

export default function QuickKeysPage() {
  const { t } = useI18n();
  const [groups, setGroups] = useState<Group[]>([]);
  const [activeGroup, setActiveGroup] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // ---------- گروه تازه ----------
  const [groupName, setGroupName] = useState('');
  const [groupColor, setGroupColor] = useState(PALETTE[0].hex);

  // ---------- کلید تازه ----------
  const [search, setSearch] = useState('');
  const [hits, setHits] = useState<Product[]>([]);
  const [label, setLabel] = useState('');
  const [qty, setQty] = useState('1');
  const [color, setColor] = useState(PALETTE[0].hex);
  const [product, setProduct] = useState<Product | null>(null);

  const load = useCallback(async () => {
    try {
      const list = await api<Group[]>('/retail/quick-keys');
      setGroups(list);
      setActiveGroup((prev) => prev || list[0]?.id || '');
    } catch {
      setError('بارگذاری چیدمان ناموفق بود');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // جست‌وجوی کالا با مهلت کوتاه — هر حرف یک درخواست نزند.
  useEffect(() => {
    const term = search.trim();
    if (term.length < 2) {
      setHits([]);
      return;
    }

    const timer = setTimeout(() => {
      api<Product[]>(`/retail/search?q=${encodeURIComponent(term)}&limit=8`)
        .then(setHits)
        .catch(() => setHits([]));
    }, 250);

    return () => clearTimeout(timer);
  }, [search]);

  const current = useMemo(
    () => groups.find((g) => g.id === activeGroup) ?? null,
    [groups, activeGroup],
  );

  async function addGroup() {
    if (!groupName.trim()) {
      setError('نام گروه را وارد کنید');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const created = await api<Group>('/retail/quick-keys/groups', {
        method: 'POST',
        body: { name: groupName.trim(), color: groupColor, sortOrder: groups.length },
      });
      setGroupName('');
      await load();
      setActiveGroup(created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ساخت گروه ناموفق بود');
    } finally {
      setBusy(false);
    }
  }

  async function addKey() {
    if (!product || !activeGroup) return;

    setBusy(true);
    setError('');
    try {
      await api('/retail/quick-keys', {
        method: 'POST',
        body: {
          groupId: activeGroup,
          productId: product.id,
          label: label.trim() || undefined,
          color,
          defaultQty: Number(qty) || 1,
          sortOrder: current?.keys.length ?? 0,
        },
      });
      setProduct(null);
      setSearch('');
      setLabel('');
      setQty('1');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'افزودن کلید ناموفق بود');
    } finally {
      setBusy(false);
    }
  }

  async function removeKey(id: string) {
    try {
      await api(`/retail/quick-keys/${id}`, { method: 'DELETE' });
      await load();
    } catch {
      setError('حذف کلید ناموفق بود');
    }
  }

  async function removeGroup(id: string) {
    try {
      await api(`/retail/quick-keys/groups/${id}`, { method: 'DELETE' });
      setActiveGroup('');
      await load();
    } catch {
      setError('حذف گروه ناموفق بود');
    }
  }

  /** جابه‌جایی کلید — یکجا ذخیره می‌شود، نه با هر حرکت. */
  async function move(index: number, delta: number) {
    if (!current) return;

    const list = [...current.keys];
    const target = index + delta;
    if (target < 0 || target >= list.length) return;

    [list[index], list[target]] = [list[target], list[index]];

    setBusy(true);
    try {
      await api('/retail/quick-keys/reorder', {
        method: 'POST',
        body: { items: list.map((k, i) => ({ id: k.id, sortOrder: i })) },
      });
      await load();
    } catch {
      setError('ذخیرهٔ ترتیب ناموفق بود');
    } finally {
      setBusy(false);
    }
  }

  const field: React.CSSProperties = {
    ...TOUCH,
    width: '100%',
    padding: '8px 10px',
    border: '1px solid var(--border)',
    borderRadius: 8,
    background: 'var(--bg)',
    color: 'var(--text)',
    fontSize: 13,
  };

  return (
    <AppShell
      title="چیدمان کلید سریع"
      subtitle="کالای فله بارکد ندارد و پرفروش با یک لمس سریع‌تر از اسکن است"
      actions={
        <button type="button" className="btn-sm" onClick={() => void load()}>
          {t('qkRefresh')}
        </button>
      }
    >
      {error ? <div className="error">{error}</div> : null}

      {/* ---------- گروه‌ها ---------- */}
      <div className="card">
        <h3>{t('qkGroups')}</h3>
        <p className="muted">
          هر گروه یک زبانه در صندوق است. بیش از بیست کلید روی یک صفحه گم می‌شود.
        </p>

        <div className="lang-pills" style={{ margin: '12px 0' }}>
          {groups.map((g) => (
            <button
              key={g.id}
              type="button"
              className={`lang-pill${activeGroup === g.id ? ' active' : ''}`}
              onClick={() => setActiveGroup(g.id)}
            >
              {g.name} ({fa(g.keys.length)})
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: '1 1 180px' }}>
            <label htmlFor="gname">{t('qkNewGroup')}</label>
            <input
              id="gname"
              style={field}
              placeholder="مثلاً «میوه» یا «پرفروش‌ها»"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
            />
          </div>
          <div style={{ display: 'flex', gap: 5 }}>
            {PALETTE.map((c) => (
              <button
                key={c.hex}
                type="button"
                aria-label={c.name}
                title={c.name}
                onClick={() => setGroupColor(c.hex)}
                style={{
                  ...TOUCH,
                  width: 34,
                  minWidth: 34,
                  height: 34,
                  padding: 0,
                  borderRadius: 8,
                  background: c.hex,
                  border: groupColor === c.hex ? '3px solid var(--text)' : '1px solid var(--border)',
                  boxShadow: 'none',
                }}
              />
            ))}
          </div>
          <button type="button" onClick={() => void addGroup()} disabled={busy}>
            {t('qkAddGroup')}
          </button>
          {current && (
            <button
              type="button"
              className="danger btn-sm"
              onClick={() => void removeGroup(current.id)}
            >
              حذف «{current.name}»
            </button>
          )}
        </div>
      </div>

      {/* ---------- افزودن کلید ---------- */}
      {current && (
        <div className="card">
          <h3>افزودن کلید به «{current.name}»</h3>

          <div style={{ position: 'relative', marginTop: 10 }}>
            <label htmlFor="qk-search">{t('qkProduct')}</label>
            <input
              id="qk-search"
              style={field}
              placeholder="نام یا بارکد کالا"
              value={product ? product.name : search}
              onChange={(e) => {
                setProduct(null);
                setSearch(e.target.value);
              }}
              autoComplete="off"
            />

            {hits.length > 0 && !product && (
              <ul
                style={{
                  position: 'absolute',
                  insetInlineStart: 0,
                  insetInlineEnd: 0,
                  zIndex: 20,
                  marginTop: 3,
                  padding: 4,
                  listStyle: 'none',
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  maxHeight: 220,
                  overflowY: 'auto',
                }}
              >
                {hits.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setProduct(p);
                        setHits([]);
                        // برچسب پیش‌فرض از نام کالا، کوتاه‌شده: نام کامل
                        // روی دکمهٔ ۱۱۰ پیکسلی جا نمی‌شود.
                        setLabel(p.name.slice(0, 20));
                      }}
                      style={{
                        ...TOUCH,
                        width: '100%',
                        textAlign: 'right',
                        background: 'transparent',
                        border: 0,
                        color: 'var(--text)',
                        padding: '7px 8px',
                        borderRadius: 6,
                        cursor: 'pointer',
                        fontSize: 13,
                      }}
                    >
                      {p.name} · {fa(p.salePrice)}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {product && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                gap: 10,
                marginTop: 12,
                alignItems: 'flex-end',
              }}
            >
              <div>
                <label htmlFor="qk-label">{t('qkButtonLabel')}</label>
                <input
                  id="qk-label"
                  style={field}
                  maxLength={24}
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="qk-qty">{t('qkDefaultQty')}</label>
                <input
                  id="qk-qty"
                  type="number"
                  min="0.001"
                  step="0.001"
                  style={{ ...field, fontVariantNumeric: 'tabular-nums' }}
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                />
              </div>
              <div>
                <span id="grp-qk-color">{t('qkColor')}</span>
                <div role="group" aria-labelledby="grp-qk-color" style={{ display: 'flex', gap: 5, marginTop: 4 }}>
                  {PALETTE.map((c) => (
                    <button
                      key={c.hex}
                      type="button"
                      aria-label={c.name}
                      onClick={() => setColor(c.hex)}
                      style={{
                        ...TOUCH,
                        width: 32,
                        minWidth: 32,
                        height: 32,
                        padding: 0,
                        borderRadius: 8,
                        background: c.hex,
                        border: color === c.hex ? '3px solid var(--text)' : '1px solid var(--border)',
                        boxShadow: 'none',
                      }}
                    />
                  ))}
                </div>
              </div>
              <button type="button" onClick={() => void addKey()} disabled={busy}>
                {t('add')}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ---------- پیش‌نمایش ---------- */}
      {current && (
        <div className="card">
          <h3>{t('qkPreview')}</h3>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))',
              gap: 8,
              marginTop: 12,
            }}
          >
            {current.keys.map((key, index) => (
              <div key={key.id} style={{ display: 'grid', gap: 4 }}>
                <button
                  type="button"
                  className="quick-key"
                  style={
                    key.color
                      ? ({
                          '--qk-top': shade(key.color, 14),
                          '--qk-bottom': key.color,
                          '--qk-edge': shade(key.color, -32),
                        } as React.CSSProperties)
                      : undefined
                  }
                >
                  <span className="qk-name">{key.label ?? key.productName}</span>
                  <span className="qk-price">
                    {fa(key.salePrice)}
                    {Number(key.defaultQty) !== 1 ? ` × ${fa(key.defaultQty)}` : ''}
                  </span>
                </button>

                <div style={{ display: 'flex', gap: 3, justifyContent: 'center' }}>
                  <button
                    type="button"
                    className="btn-sm ghost"
                    aria-label="جابه‌جایی به راست"
                    onClick={() => void move(index, -1)}
                    disabled={busy || index === 0}
                    style={{ minWidth: 32, padding: 4 }}
                  >
                    ›
                  </button>
                  <button
                    type="button"
                    className="btn-sm ghost"
                    aria-label="جابه‌جایی به چپ"
                    onClick={() => void move(index, 1)}
                    disabled={busy || index === current.keys.length - 1}
                    style={{ minWidth: 32, padding: 4 }}
                  >
                    ‹
                  </button>
                  <button
                    type="button"
                    className="btn-sm ghost"
                    aria-label={`حذف ${key.label ?? key.productName}`}
                    onClick={() => void removeKey(key.id)}
                    style={{ minWidth: 32, padding: 4, color: 'var(--danger)' }}
                  >
                    <Icon name="x" size={13} />
                  </button>
                </div>
              </div>
            ))}

            {current.keys.length === 0 && (
              <p className="muted" style={{ gridColumn: '1 / -1', margin: 0 }}>
                {t('qkGroupEmpty')}
              </p>
            )}
          </div>
        </div>
      )}

      {groups.length === 0 && (
        <div className="card">
          <p className="muted">
            هنوز گروهی ساخته نشده. صندوق بدون کلید سریع هم کار می‌کند — فقط با اسکن.
          </p>
        </div>
      )}
    </AppShell>
  );
}

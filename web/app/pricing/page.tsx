'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import AppShell from '../../components/AppShell';
import { Icon } from '../../components/icons';
import { DataTable, NUM, ROW, TD, Tabs, TOUCH } from '../../components/ui';
import { api } from '../../lib/api';
import { useI18n } from '../../lib/i18n-context';

type PriceLevel = {
  id: string;
  name: string;
  isDefault: boolean;
  priceCount: string | number;
};

type ProductPrice = {
  id: string;
  priceLevelId: string;
  levelName: string;
  price: string | number;
  minQty: string | number;
};

type Rule = {
  id: string;
  name: string;
  kind: 'PERCENT' | 'AMOUNT' | 'BUY_X_GET_Y';
  value: string | number;
  minQty: string | number | null;
  getQty: string | number | null;
  priority: number;
  isActive: boolean;
  productName: string | null;
  categoryName: string | null;
};

type Product = { id: string; name: string; salePrice: string | number };
type Category = { id: string; name: string };

type QuoteLine = {
  productId: string;
  name: string;
  qty: number;
  unitPrice: number;
  gross: number;
  discount: number;
  discountName: string | null;
  total: number;
};

type Quote = {
  lines: QuoteLine[];
  subtotal: number;
  discount: number;
  total: number;
};

const TABS = [
  { key: 'levels', label: 'tabLevels' },
  { key: 'tiers', label: 'tabTiers' },
  { key: 'rules', label: 'tabRules' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

const KIND_LABEL: Record<Rule['kind'], string> = {
  PERCENT: 'kindPercent',
  AMOUNT: 'kindAmount',
  BUY_X_GET_Y: 'kindBuyXGetY',
};

export default function PricingPage() {
  const { t, locale } = useI18n();

  const [tab, setTab] = useState<TabKey>('levels');
  const [levels, setLevels] = useState<PriceLevel[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [levelName, setLevelName] = useState('');
  const [levelDefault, setLevelDefault] = useState(false);

  const [tierProduct, setTierProduct] = useState('');
  const [tierPrices, setTierPrices] = useState<ProductPrice[]>([]);
  const [tierForm, setTierForm] = useState({ levelId: '', price: '', minQty: '0' });

  const [rule, setRule] = useState({
    name: '',
    kind: 'PERCENT' as Rule['kind'],
    value: '',
    minQty: '',
    getQty: '',
    priority: '0',
    scope: 'all' as 'all' | 'product' | 'category',
    productId: '',
    categoryId: '',
  });

  const [test, setTest] = useState({ productId: '', qty: '1', levelId: '' });
  const [quote, setQuote] = useState<Quote | null>(null);

  const fa = useCallback(
    (value: unknown) => Number(value ?? 0).toLocaleString(locale),
    [locale],
  );

  const load = useCallback(async () => {
    try {
      const [levelList, ruleList, productList, categoryList] = await Promise.all([
        api<PriceLevel[]>('/pricing/levels'),
        api<Rule[]>('/pricing/rules'),
        api<Product[]>('/products'),
        api<Category[]>('/categories'),
      ]);

      setLevels(Array.isArray(levelList) ? levelList : []);
      setRules(Array.isArray(ruleList) ? ruleList : []);
      setProducts(Array.isArray(productList) ? productList : []);
      setCategories(Array.isArray(categoryList) ? categoryList : []);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('fetchError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  // پلکان‌های کالای انتخابی جدا بارگذاری می‌شوند؛ آوردن قیمت همهٔ کالاها
  // در یک درخواست، روی کاتالوگ چندهزارتایی صفحه را قفل می‌کند.
  const loadTiers = useCallback(async (productId: string) => {
    if (!productId) {
      setTierPrices([]);
      return;
    }

    try {
      const list = await api<ProductPrice[]>(`/pricing/products/${productId}/prices`);
      setTierPrices(Array.isArray(list) ? list : []);
    } catch {
      setTierPrices([]);
    }
  }, []);

  useEffect(() => {
    void loadTiers(tierProduct);
  }, [tierProduct, loadTiers]);

  const defaultLevelId = useMemo(
    () => levels.find((level) => level.isDefault)?.id ?? '',
    [levels],
  );

  async function run(action: () => Promise<unknown>, done?: () => void) {
    setBusy(true);
    setError('');
    try {
      await action();
      done?.();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('saveError'));
    } finally {
      setBusy(false);
    }
  }

  function addLevel() {
    if (!levelName.trim()) return;

    void run(
      () =>
        api('/pricing/levels', {
          method: 'POST',
          body: { name: levelName.trim(), isDefault: levelDefault },
        }),
      () => {
        setLevelName('');
        setLevelDefault(false);
      },
    );
  }

  function addTier() {
    const price = Number(tierForm.price);
    if (!tierProduct || !tierForm.levelId || !Number.isFinite(price)) return;

    void run(
      () =>
        api('/pricing/prices', {
          method: 'POST',
          body: {
            productId: tierProduct,
            priceLevelId: tierForm.levelId,
            price,
            minQty: Number(tierForm.minQty) || 0,
          },
        }),
      () => setTierForm({ ...tierForm, price: '' }),
    ).then(() => loadTiers(tierProduct));
  }

  function addRule() {
    const value = Number(rule.value);
    if (!rule.name.trim() || !Number.isFinite(value)) return;

    void run(
      () =>
        api('/pricing/rules', {
          method: 'POST',
          body: {
            name: rule.name.trim(),
            kind: rule.kind,
            value,
            minQty: rule.minQty ? Number(rule.minQty) : undefined,
            getQty: rule.getQty ? Number(rule.getQty) : undefined,
            priority: Number(rule.priority) || 0,
            productId: rule.scope === 'product' ? rule.productId : undefined,
            categoryId: rule.scope === 'category' ? rule.categoryId : undefined,
          },
        }),
      () => setRule({ ...rule, name: '', value: '', minQty: '', getQty: '' }),
    );
  }

  function toggle(id: string) {
    void run(() => api(`/pricing/rules/${id}/toggle`, { method: 'PATCH', body: {} }));
  }

  async function calculate() {
    if (!test.productId) return;

    setBusy(true);
    setError('');
    try {
      const result = await api<Quote>('/pricing/quote', {
        method: 'POST',
        body: {
          priceLevelId: test.levelId || undefined,
          lines: [{ productId: test.productId, qty: Number(test.qty) || 1 }],
        },
      });
      setQuote(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('actionError'));
    } finally {
      setBusy(false);
    }
  }

  const scopeOf = (item: Rule) =>
    item.productName ?? item.categoryName ?? t('scopeAll');

  return (
    <AppShell
      title={t('pricingTitle')}
      subtitle={t('pricingSubtitle')}
      actions={
        <button type="button" className="btn-sm" onClick={() => void load()}>
          {t('refresh')}
        </button>
      }
    >
      {error ? <div className="error">{error}</div> : null}
      {message ? <div className="card">{message}</div> : null}

      <Tabs tabs={TABS} active={tab} onChange={setTab} t={t} />

      {/* ------------------------------------------------ سطح قیمت */}
      {tab === 'levels' ? (
        <>
          <div className="card">
            <h3>{t('newLevel')}</h3>
            <div className="form-row">
              <input
                style={TOUCH}
                placeholder={t('levelName')}
                value={levelName}
                onChange={(event) => setLevelName(event.target.value)}
              />
              <label
                style={{ display: 'flex', alignItems: 'center', gap: 8, ...TOUCH }}
              >
                <input
                  type="checkbox"
                  checked={levelDefault}
                  onChange={(event) => setLevelDefault(event.target.checked)}
                />
                {t('isDefault')}
              </label>
              <button
                type="button"
                className="btn"
                disabled={busy || !levelName.trim()}
                onClick={addLevel}
              >
                <Icon name="plus" size={18} /> {t('save')}
              </button>
            </div>
          </div>

          <DataTable
            headers={[t('levelName'), t('isDefault'), t('priceCount')]}
            empty={t('noData')}
            loading={loading}
            loadingLabel={t('loading')}
            rows={levels.length}
          >
            {levels.map((level) => (
              <tr key={level.id} style={ROW}>
                <td style={TD}>{level.name}</td>
                <td style={TD}>
                  {level.isDefault ? (
                    <span className="badge">
                      <Icon name="check" size={14} /> {t('isDefault')}
                    </span>
                  ) : (
                    '—'
                  )}
                </td>
                <td style={{ ...TD, ...NUM }}>{fa(level.priceCount)}</td>
              </tr>
            ))}
          </DataTable>
        </>
      ) : null}

      {/* -------------------------------------------- قیمت پلکانی */}
      {tab === 'tiers' ? (
        <>
          <div className="card">
            <p className="muted">{t('tierHint')}</p>
            <div className="form-row">
              <select
                style={TOUCH}
                value={tierProduct}
                onChange={(event) => setTierProduct(event.target.value)}
              >
                <option value="">{t('selectProduct')}</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name}
                  </option>
                ))}
              </select>

              <select
                style={TOUCH}
                value={tierForm.levelId}
                onChange={(event) =>
                  setTierForm({ ...tierForm, levelId: event.target.value })
                }
              >
                <option value="">{t('selectLevel')}</option>
                {levels.map((level) => (
                  <option key={level.id} value={level.id}>
                    {level.name}
                  </option>
                ))}
              </select>

              <input
                style={TOUCH}
                inputMode="numeric"
                placeholder={t('minQty')}
                value={tierForm.minQty}
                onChange={(event) =>
                  setTierForm({ ...tierForm, minQty: event.target.value })
                }
              />

              <input
                style={TOUCH}
                inputMode="numeric"
                placeholder={t('unitPrice')}
                value={tierForm.price}
                onChange={(event) =>
                  setTierForm({ ...tierForm, price: event.target.value })
                }
              />

              <button
                type="button"
                className="btn"
                disabled={busy || !tierProduct || !tierForm.levelId || !tierForm.price}
                onClick={addTier}
              >
                {t('addTier')}
              </button>
            </div>
          </div>

          <DataTable
            headers={[t('selectLevel'), t('minQty'), t('unitPrice')]}
            empty={tierProduct ? t('noData') : t('selectProduct')}
            loading={false}
            rows={tierPrices.length}
          >
            {tierPrices.map((price) => (
              <tr key={price.id} style={ROW}>
                <td style={TD}>{price.levelName}</td>
                <td style={{ ...TD, ...NUM }}>{fa(price.minQty)}</td>
                <td style={{ ...TD, ...NUM }}>{fa(price.price)}</td>
              </tr>
            ))}
          </DataTable>

          {/* آزمایش قیمت: مسیر همان چیزی است که صندوق صدا می‌زند، پس آنچه
              اینجا دیده می‌شود دقیقاً همان است که مشتری می‌پردازد. */}
          <div className="card" style={{ marginTop: 18 }}>
            <h3>
              <Icon name="money" size={18} /> {t('quoteTester')}
            </h3>
            <div className="form-row">
              <select
                style={TOUCH}
                value={test.productId}
                onChange={(event) => setTest({ ...test, productId: event.target.value })}
              >
                <option value="">{t('selectProduct')}</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name}
                  </option>
                ))}
              </select>

              <input
                style={TOUCH}
                inputMode="numeric"
                placeholder={t('quantity')}
                value={test.qty}
                onChange={(event) => setTest({ ...test, qty: event.target.value })}
              />

              <select
                style={TOUCH}
                value={test.levelId}
                onChange={(event) => setTest({ ...test, levelId: event.target.value })}
              >
                <option value="">{t('isDefault')}</option>
                {levels.map((level) => (
                  <option key={level.id} value={level.id}>
                    {level.name}
                  </option>
                ))}
              </select>

              <button
                type="button"
                className="btn"
                disabled={busy || !test.productId}
                onClick={() => void calculate()}
              >
                {t('calculate')}
              </button>
            </div>

            {quote?.lines?.[0] ? (
              <div className="stats-grid" style={{ marginTop: 14 }}>
                <div className="stat-card">
                  <div className="stat-label">{t('unitPrice')}</div>
                  <div className="stat-value">{fa(quote.lines[0].unitPrice)}</div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">{t('discountAmount')}</div>
                  <div className="stat-value">{fa(quote.discount)}</div>
                  <div className="muted">
                    {quote.lines[0].discountName ?? t('noDiscount')}
                  </div>
                </div>
                <div
                  className="stat-card"
                  style={{ borderTop: '3px solid var(--success)' }}
                >
                  <div className="stat-label">{t('finalTotal')}</div>
                  <div className="stat-value">{fa(quote.total)}</div>
                </div>
              </div>
            ) : null}
          </div>
        </>
      ) : null}

      {/* --------------------------------------------- قواعد تخفیف */}
      {tab === 'rules' ? (
        <>
          <div className="card">
            <h3>{t('newRule')}</h3>
            <p className="muted">{t('bestWinsHint')}</p>

            <div className="form-row">
              <input
                style={TOUCH}
                placeholder={t('ruleName')}
                value={rule.name}
                onChange={(event) => setRule({ ...rule, name: event.target.value })}
              />

              <select
                style={TOUCH}
                value={rule.kind}
                onChange={(event) =>
                  setRule({ ...rule, kind: event.target.value as Rule['kind'] })
                }
              >
                <option value="PERCENT">{t('kindPercent')}</option>
                <option value="AMOUNT">{t('kindAmount')}</option>
                <option value="BUY_X_GET_Y">{t('kindBuyXGetY')}</option>
              </select>

              {/* در «X بخر Y ببر» خودِ مقدار بی‌معناست: تعداد خرید و تعداد
                  رایگان جای آن را می‌گیرند. */}
              {rule.kind === 'BUY_X_GET_Y' ? (
                <>
                  <input
                    style={TOUCH}
                    inputMode="numeric"
                    placeholder={t('minQty')}
                    value={rule.minQty}
                    onChange={(event) =>
                      setRule({ ...rule, minQty: event.target.value, value: '0' })
                    }
                  />
                  <input
                    style={TOUCH}
                    inputMode="numeric"
                    placeholder={t('getQty')}
                    value={rule.getQty}
                    onChange={(event) => setRule({ ...rule, getQty: event.target.value })}
                  />
                </>
              ) : (
                <>
                  <input
                    style={TOUCH}
                    inputMode="numeric"
                    placeholder={t('ruleValue')}
                    value={rule.value}
                    onChange={(event) => setRule({ ...rule, value: event.target.value })}
                  />
                  <input
                    style={TOUCH}
                    inputMode="numeric"
                    placeholder={t('minQty')}
                    value={rule.minQty}
                    onChange={(event) => setRule({ ...rule, minQty: event.target.value })}
                  />
                </>
              )}
            </div>

            <div className="form-row">
              <select
                style={TOUCH}
                value={rule.scope}
                onChange={(event) =>
                  setRule({ ...rule, scope: event.target.value as typeof rule.scope })
                }
              >
                <option value="all">{t('scopeAll')}</option>
                <option value="product">{t('scopeProduct')}</option>
                <option value="category">{t('scopeCategory')}</option>
              </select>

              {rule.scope === 'product' ? (
                <select
                  style={TOUCH}
                  value={rule.productId}
                  onChange={(event) =>
                    setRule({ ...rule, productId: event.target.value })
                  }
                >
                  <option value="">{t('selectProduct')}</option>
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name}
                    </option>
                  ))}
                </select>
              ) : null}

              {rule.scope === 'category' ? (
                <select
                  style={TOUCH}
                  value={rule.categoryId}
                  onChange={(event) =>
                    setRule({ ...rule, categoryId: event.target.value })
                  }
                >
                  <option value="">{t('parentCategory')}</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              ) : null}

              <input
                style={TOUCH}
                inputMode="numeric"
                placeholder={t('priority')}
                value={rule.priority}
                onChange={(event) => setRule({ ...rule, priority: event.target.value })}
              />

              <button
                type="button"
                className="btn"
                disabled={busy || !rule.name.trim()}
                onClick={addRule}
              >
                <Icon name="plus" size={18} /> {t('save')}
              </button>
            </div>
          </div>

          <DataTable
            headers={[
              t('ruleName'),
              t('ruleKind'),
              t('ruleValue'),
              t('scope'),
              t('priority'),
              '',
            ]}
            empty={t('noData')}
            loading={loading}
            loadingLabel={t('loading')}
            rows={rules.length}
          >
            {rules.map((item) => (
              <tr key={item.id} style={{ ...ROW, opacity: item.isActive ? 1 : 0.5 }}>
                <td style={TD}>{item.name}</td>
                <td style={TD}>{t(KIND_LABEL[item.kind])}</td>
                <td style={{ ...TD, ...NUM }}>
                  {item.kind === 'BUY_X_GET_Y'
                    ? `${fa(item.minQty)} → ${fa(item.getQty)}`
                    : fa(item.value)}
                </td>
                <td style={TD}>{scopeOf(item)}</td>
                <td style={{ ...TD, ...NUM }}>{fa(item.priority)}</td>
                <td style={TD}>
                  <button
                    type="button"
                    className="btn-sm"
                    disabled={busy}
                    onClick={() => toggle(item.id)}
                  >
                    {item.isActive ? t('inactive') : t('active')}
                  </button>
                </td>
              </tr>
            ))}
          </DataTable>
        </>
      ) : null}
    </AppShell>
  );
}

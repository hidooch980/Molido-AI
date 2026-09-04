'use client';

import { useCallback, useEffect, useState } from 'react';

import AppShell from '../../components/AppShell';
import { Icon } from '../../components/icons';
import { DataTable, NUM, ROW, TD, Tabs, TOUCH } from '../../components/ui';
import { api } from '../../lib/api';
import { useI18n } from '../../lib/i18n-context';

type CategoryNode = {
  id: string;
  name: string;
  parentId: string | null;
  productCount: number;
  children: CategoryNode[];
};

type Warehouse = {
  id: string;
  name: string;
  code: string | null;
  skuCount: string | number;
  stockValue: string | number;
};

type WarehouseItem = {
  productId: string;
  name: string;
  sku: string | null;
  quantity: string | number;
  value: string | number;
};

type Serial = {
  id: string;
  serial: string;
  status: 'IN_STOCK' | 'SOLD' | 'RETURNED' | 'DEFECTIVE';
  productName: string;
  warrantyUntil: string | null;
};

type Lookup = {
  serial: string;
  productName: string;
  status: string;
  invoiceNo: string | null;
  soldAt: string | null;
  customerName: string | null;
  warrantyUntil: string | null;
  warrantyValid: boolean | null;
};

type Product = { id: string; name: string };

const TABS = [
  { key: 'categories', label: 'tabCategories' },
  { key: 'warehouses', label: 'tabWarehouses' },
  { key: 'serials', label: 'tabSerials' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

const STATUS_LABEL: Record<Serial['status'], string> = {
  IN_STOCK: 'statusInStock',
  SOLD: 'statusSold',
  RETURNED: 'statusReturned',
  DEFECTIVE: 'statusDefective',
};

/** درخت را به فهرست تخت با عمق تبدیل می‌کند تا در جدول قابل نمایش باشد. */
function flatten(nodes: CategoryNode[], depth = 0): Array<CategoryNode & { depth: number }> {
  return nodes.flatMap((node) => [
    { ...node, depth },
    ...flatten(node.children ?? [], depth + 1),
  ]);
}

export default function CataloguePage() {
  const { t, locale } = useI18n();

  const [tab, setTab] = useState<TabKey>('categories');
  const [tree, setTree] = useState<CategoryNode[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [serials, setSerials] = useState<Serial[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [category, setCategory] = useState({ name: '', parentId: '' });
  const [warehouse, setWarehouse] = useState({ name: '', code: '' });
  const [openWarehouse, setOpenWarehouse] = useState('');
  const [contents, setContents] = useState<WarehouseItem[]>([]);

  const [batch, setBatch] = useState({ productId: '', serials: '', warrantyUntil: '' });
  const [lookupInput, setLookupInput] = useState('');
  const [lookup, setLookup] = useState<Lookup | null>(null);

  const fa = useCallback(
    (value: unknown) => Number(value ?? 0).toLocaleString(locale),
    [locale],
  );

  const load = useCallback(async () => {
    try {
      const [treeData, warehouseList, serialList, productList] = await Promise.all([
        api<CategoryNode[]>('/categories/tree'),
        api<Warehouse[]>('/warehouses'),
        api<Serial[]>('/serial-numbers'),
        api<Product[]>('/products'),
      ]);

      setTree(Array.isArray(treeData) ? treeData : []);
      setWarehouses(Array.isArray(warehouseList) ? warehouseList : []);
      setSerials(Array.isArray(serialList) ? serialList : []);
      setProducts(Array.isArray(productList) ? productList : []);
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

  async function run(action: () => Promise<unknown>, done?: () => void) {
    setBusy(true);
    setError('');
    setMessage('');
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

  const flat = flatten(tree);

  function addCategory() {
    if (!category.name.trim()) return;

    void run(
      () =>
        api('/categories', {
          method: 'POST',
          body: {
            name: category.name.trim(),
            parentId: category.parentId || undefined,
          },
        }),
      () => setCategory({ name: '', parentId: '' }),
    );
  }

  function removeCategory(id: string) {
    if (!window.confirm(t('confirmDelete'))) return;
    void run(() => api(`/categories/${id}`, { method: 'DELETE' }));
  }

  function addWarehouse() {
    if (!warehouse.name.trim()) return;

    void run(
      () =>
        api('/warehouses', {
          method: 'POST',
          body: {
            name: warehouse.name.trim(),
            code: warehouse.code.trim() || undefined,
          },
        }),
      () => setWarehouse({ name: '', code: '' }),
    );
  }

  function removeWarehouse(id: string) {
    if (!window.confirm(t('confirmDelete'))) return;
    void run(() => api(`/warehouses/${id}`, { method: 'DELETE' }));
  }

  async function showContents(id: string) {
    if (openWarehouse === id) {
      setOpenWarehouse('');
      return;
    }

    try {
      const list = await api<WarehouseItem[]>(`/warehouses/${id}/contents`);
      setContents(Array.isArray(list) ? list : []);
      setOpenWarehouse(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('fetchError'));
    }
  }

  function addSerials() {
    const list = batch.serials
      .split(/[\n,]/)
      .map((item) => item.trim())
      .filter(Boolean);

    if (!batch.productId || !list.length) return;

    setBusy(true);
    setError('');
    setMessage('');

    api<{ added: number; duplicates: string[] }>('/serial-numbers/batch', {
      method: 'POST',
      body: {
        productId: batch.productId,
        serials: list,
        warrantyUntil: batch.warrantyUntil || undefined,
      },
    })
      .then((result) => {
        // تکراری‌ها نام‌به‌نام گزارش می‌شوند: انباردار باید بداند کدام
        // جعبه از قبل ثبت شده، نه فقط اینکه «چندتا رد شد».
        const parts = [`${fa(result.added)} ${t('addedCount')}`];
        if (result.duplicates.length) {
          parts.push(
            `${result.duplicates.length} ${t('duplicatesSkipped')}: ${result.duplicates.join('، ')}`,
          );
        }
        setMessage(parts.join(' — '));
        setBatch({ ...batch, serials: '' });
        return load();
      })
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : t('saveError')),
      )
      .finally(() => setBusy(false));
  }

  async function doLookup() {
    const serial = lookupInput.trim();
    if (!serial) return;

    setBusy(true);
    setError('');
    try {
      setLookup(await api<Lookup>(`/serial-numbers/lookup/${encodeURIComponent(serial)}`));
    } catch {
      setLookup(null);
      setError(t('notFound'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell
      title={t('catalogueTitle')}
      subtitle={t('catalogueSubtitle')}
      actions={
        <button type="button" className="btn-sm" onClick={() => void load()}>
          {t('refresh')}
        </button>
      }
    >
      {error ? <div className="error">{error}</div> : null}
      {message ? (
        <div className="card" style={{ borderInlineStart: '4px solid var(--success)' }}>
          {message}
        </div>
      ) : null}

      <Tabs tabs={TABS} active={tab} onChange={setTab} t={t} />

      {/* ------------------------------------------------ دسته‌بندی */}
      {tab === 'categories' ? (
        <>
          <div className="card">
            <h3>{t('newCategory')}</h3>
            <div className="form-row">
              <input
                style={TOUCH}
                placeholder={t('categoryName')}
                value={category.name}
                onChange={(event) =>
                  setCategory({ ...category, name: event.target.value })
                }
              />
              <select
                style={TOUCH}
                value={category.parentId}
                onChange={(event) =>
                  setCategory({ ...category, parentId: event.target.value })
                }
              >
                <option value="">{t('noParent')}</option>
                {flat.map((node) => (
                  <option key={node.id} value={node.id}>
                    {'— '.repeat(node.depth)}
                    {node.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn"
                disabled={busy || !category.name.trim()}
                onClick={addCategory}
              >
                <Icon name="plus" size={18} /> {t('save')}
              </button>
            </div>
          </div>

          <DataTable
            headers={[t('categoryName'), t('productCount'), '']}
            empty={t('noData')}
            loading={loading}
            loadingLabel={t('loading')}
            rows={flat.length}
          >
            {flat.map((node) => (
              <tr key={node.id} style={ROW}>
                {/* تورفتگی منطقی است (`padding-inline-start`) تا در چیدمان
                    راست‌به‌چپ و چپ‌به‌راست هر دو درست بیفتد. */}
                <td style={{ ...TD, paddingInlineStart: 8 + node.depth * 22 }}>
                  {node.depth > 0 ? (
                    <span className="muted" style={{ marginInlineEnd: 6 }}>
                      └
                    </span>
                  ) : null}
                  {node.name}
                </td>
                <td style={{ ...TD, ...NUM }}>{fa(node.productCount)}</td>
                <td style={TD}>
                  <button
                    type="button"
                    className="btn-sm"
                    disabled={busy}
                    onClick={() => removeCategory(node.id)}
                  >
                    <Icon name="x" size={14} /> {t('delete')}
                  </button>
                </td>
              </tr>
            ))}
          </DataTable>
        </>
      ) : null}

      {/* ---------------------------------------------------- انبار */}
      {tab === 'warehouses' ? (
        <>
          <div className="card">
            <h3>{t('newWarehouse')}</h3>
            <div className="form-row">
              <input
                style={TOUCH}
                placeholder={t('warehouseName')}
                value={warehouse.name}
                onChange={(event) =>
                  setWarehouse({ ...warehouse, name: event.target.value })
                }
              />
              <input
                style={TOUCH}
                placeholder={t('warehouseCode')}
                value={warehouse.code}
                onChange={(event) =>
                  setWarehouse({ ...warehouse, code: event.target.value })
                }
              />
              <button
                type="button"
                className="btn"
                disabled={busy || !warehouse.name.trim()}
                onClick={addWarehouse}
              >
                <Icon name="plus" size={18} /> {t('save')}
              </button>
            </div>
          </div>

          <DataTable
            headers={[
              t('warehouseName'),
              t('warehouseCode'),
              t('skuCount'),
              t('stockValue'),
              '',
            ]}
            empty={t('noData')}
            loading={loading}
            loadingLabel={t('loading')}
            rows={warehouses.length}
          >
            {warehouses.map((item) => (
              <tr key={item.id} style={ROW}>
                <td style={TD}>
                  <Icon name="warehouse" size={16} /> {item.name}
                </td>
                <td style={TD}>{item.code ?? '—'}</td>
                <td style={{ ...TD, ...NUM }}>{fa(item.skuCount)}</td>
                <td style={{ ...TD, ...NUM }}>{fa(item.stockValue)}</td>
                <td style={TD}>
                  <button
                    type="button"
                    className="btn-sm"
                    onClick={() => void showContents(item.id)}
                  >
                    {t('viewContents')}
                  </button>{' '}
                  <button
                    type="button"
                    className="btn-sm"
                    disabled={busy}
                    onClick={() => removeWarehouse(item.id)}
                  >
                    <Icon name="x" size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </DataTable>

          {openWarehouse ? (
            <div className="card" style={{ marginTop: 18 }}>
              <h3>{t('viewContents')}</h3>
              <DataTable
                headers={[t('productName'), t('quantity'), t('stockValue')]}
                empty={t('noData')}
                rows={contents.length}
              >
                {contents.map((item) => (
                  <tr key={item.productId} style={ROW}>
                    <td style={TD}>{item.name}</td>
                    <td style={{ ...TD, ...NUM }}>{fa(item.quantity)}</td>
                    <td style={{ ...TD, ...NUM }}>{fa(item.value)}</td>
                  </tr>
                ))}
              </DataTable>
            </div>
          ) : null}
        </>
      ) : null}

      {/* --------------------------------------------- شمارهٔ سریال */}
      {tab === 'serials' ? (
        <>
          <div className="card">
            <h3>
              <Icon name="search" size={18} /> {t('serialLookup')}
            </h3>
            <p className="muted">{t('serialLookupHint')}</p>
            <div className="form-row">
              <input
                style={TOUCH}
                placeholder={t('serialNo')}
                value={lookupInput}
                onChange={(event) => setLookupInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void doLookup();
                }}
              />
              <button
                type="button"
                className="btn"
                disabled={busy || !lookupInput.trim()}
                onClick={() => void doLookup()}
              >
                {t('serialLookup')}
              </button>
            </div>

            {lookup ? (
              <div className="stats-grid" style={{ marginTop: 14 }}>
                <div className="stat-card">
                  <div className="stat-label">{t('productName')}</div>
                  <div className="stat-value" style={{ fontSize: 18 }}>
                    {lookup.productName}
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">{t('soldOn')}</div>
                  <div className="stat-value" style={{ fontSize: 18 }}>
                    {lookup.soldAt
                      ? new Date(lookup.soldAt).toLocaleDateString(locale)
                      : '—'}
                  </div>
                  <div className="muted">{lookup.invoiceNo ?? '—'}</div>
                </div>
                <div
                  className="stat-card"
                  style={{
                    borderTop: `3px solid var(--${lookup.warrantyValid ? 'success' : 'warning'})`,
                  }}
                >
                  <div className="stat-label">{t('warrantyUntil')}</div>
                  <div className="stat-value" style={{ fontSize: 18 }}>
                    {lookup.warrantyUntil
                      ? new Date(lookup.warrantyUntil).toLocaleDateString(locale)
                      : '—'}
                  </div>
                  <div className="muted">
                    {lookup.warrantyUntil
                      ? lookup.warrantyValid
                        ? t('warrantyValid')
                        : t('warrantyExpired')
                      : '—'}
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <div className="card">
            <h3>{t('serialsBulk')}</h3>
            <p className="muted">{t('serialsBulkHint')}</p>
            <div className="form-row">
              <select
                style={TOUCH}
                value={batch.productId}
                onChange={(event) => setBatch({ ...batch, productId: event.target.value })}
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
                type="date"
                aria-label={t('warrantyUntil')}
                value={batch.warrantyUntil}
                onChange={(event) =>
                  setBatch({ ...batch, warrantyUntil: event.target.value })
                }
              />
            </div>
            <textarea
              rows={5}
              style={{ ...TOUCH, width: '100%', marginTop: 10 }}
              placeholder={t('serialNo')}
              value={batch.serials}
              onChange={(event) => setBatch({ ...batch, serials: event.target.value })}
            />
            <button
              type="button"
              className="btn"
              disabled={busy || !batch.productId || !batch.serials.trim()}
              onClick={addSerials}
              style={{ marginTop: 10 }}
            >
              <Icon name="plus" size={18} /> {t('save')}
            </button>
          </div>

          <DataTable
            headers={[t('serialNo'), t('productName'), t('warrantyUntil'), t('status')]}
            empty={t('noData')}
            loading={loading}
            loadingLabel={t('loading')}
            rows={serials.length}
          >
            {serials.map((item) => (
              <tr key={item.id} style={ROW}>
                <td style={{ ...TD, ...NUM }}>{item.serial}</td>
                <td style={TD}>{item.productName}</td>
                <td style={TD}>
                  {item.warrantyUntil
                    ? new Date(item.warrantyUntil).toLocaleDateString(locale)
                    : '—'}
                </td>
                <td style={TD}>
                  <span className="badge">{t(STATUS_LABEL[item.status])}</span>
                </td>
              </tr>
            ))}
          </DataTable>
        </>
      ) : null}
    </AppShell>
  );
}

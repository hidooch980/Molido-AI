'use client';

import { useCallback, useEffect, useState } from 'react';
import AppShell from '../../components/AppShell';
import { useI18n } from '../../lib/i18n-context';
import { api } from '../../lib/api';
import { amountOnly, loadCurrency } from '../../lib/money';

type Product = {
  id: string;
  name: string;
  sku: string;
  barcode?: string | null;
  salePrice: string | number;
  purchasePrice: string | number;
  unit: string;
  status: string;
  category?: { id: string; name: string } | null;
};

export default function ProductsPage() {
  const { t } = useI18n();
  const [items, setItems] = useState<Product[]>([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const fa = (v: unknown) => amountOnly(v);

  const load = useCallback(async (q = '') => {
    setLoading(true);

    try {
      const result = await api<Product[] | { data: Product[] }>(
        `/products?limit=100${q ? `&search=${encodeURIComponent(q)}` : ''}`,
      );

      setItems(Array.isArray(result) ? result : (result.data ?? []));
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('productsError'));
    } finally {
      setLoading(false);
    }
  }, []);

  // واحد پول شرکت یک‌بار خوانده می‌شود تا نماد و اعشار درست باشد
  useEffect(() => {
    void loadCurrency();
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <AppShell
      title={t('productsTitle')}
      subtitle={`${fa(items.length)} ${t('productsCountLabel')}`}
    >
      {error ? <div className="error">{error}</div> : null}

      <div className="card" style={{ marginBottom: 16 }}>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void load(search);
          }}
          style={{ display: 'flex', gap: 10 }}
        >
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('searchProducts')}
            style={{ marginBottom: 0 }}
          />
          <button type="submit" className="btn-sm">
            {t('search')}
          </button>
        </form>
      </div>

      <div className="card">
        {loading ? (
          <p className="muted">{t('loading')}</p>
        ) : items.length === 0 ? (
          <p className="muted">{t('noProducts')}</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t('name')}</th>
                  <th>{t('code')}</th>
                  <th>{t('category')}</th>
                  <th>{t('salePrice')}</th>
                  <th>{t('unit')}</th>
                  <th>{t('status')}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td style={{ fontWeight: 600 }}>{item.name}</td>
                    <td className="muted">{item.sku}</td>
                    <td className="muted">{item.category?.name ?? '—'}</td>
                    <td>{fa(item.salePrice)}</td>
                    <td className="muted">{item.unit}</td>
                    <td>
                      <span className="badge">{item.status}</span>
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

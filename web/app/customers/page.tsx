'use client';

import { useCallback, useEffect, useState } from 'react';
import AppShell from '../../components/AppShell';
import { useI18n } from '../../lib/i18n-context';
import { api } from '../../lib/api';
import { amountOnly, loadCurrency } from '../../lib/money';

type Customer = {
  id: string;
  firstName: string;
  lastName?: string | null;
  phone?: string | null;
  email?: string | null;
  creditLimit?: string | number;
  isActive: boolean;
};

export default function CustomersPage() {
  const { t } = useI18n();
  const [items, setItems] = useState<Customer[]>([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const fa = (v: unknown) => amountOnly(v);

  const load = useCallback(async (q = '') => {
    setLoading(true);

    try {
      const result = await api<Customer[] | { data: Customer[] }>(
        `/customers?limit=100${q ? `&search=${encodeURIComponent(q)}` : ''}`,
      );

      setItems(Array.isArray(result) ? result : (result.data ?? []));
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('customersError'));
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
      title={t('customersTitle')}
      subtitle={`${fa(items.length)} ${t('customersCountLabel')}`}
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
            placeholder={t('searchCustomers')}
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
          <p className="muted">{t('noCustomers')}</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t('name')}</th>
                  <th>{t('phone')}</th>
                  <th>{t('email')}</th>
                  <th>{t('creditLimit')}</th>
                  <th>{t('status')}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td style={{ fontWeight: 600 }}>
                      {item.firstName} {item.lastName ?? ''}
                    </td>
                    <td className="muted">{item.phone ?? '—'}</td>
                    <td className="muted">{item.email ?? '—'}</td>
                    <td>{fa(item.creditLimit)}</td>
                    <td>
                      <span className="badge">
                        {item.isActive ? t('active') : t('inactive')}
                      </span>
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

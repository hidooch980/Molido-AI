'use client';

import { useCallback, useEffect, useState } from 'react';
import AppShell from '../../components/AppShell';
import { api } from '../../lib/api';

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
  const [items, setItems] = useState<Customer[]>([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const fa = (v: unknown) => Number(v ?? 0).toLocaleString('fa-IR');

  const load = useCallback(async (q = '') => {
    setLoading(true);

    try {
      const result = await api<Customer[] | { data: Customer[] }>(
        `/customers?limit=100${q ? `&search=${encodeURIComponent(q)}` : ''}`,
      );

      setItems(Array.isArray(result) ? result : (result.data ?? []));
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در دریافت مشتریان');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <AppShell title="مشتریان" subtitle={`${fa(items.length)} مشتری`}>
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
            placeholder="جستجوی نام یا شماره تماس…"
            style={{ marginBottom: 0 }}
          />
          <button type="submit" className="btn-sm">
            جستجو
          </button>
        </form>
      </div>

      <div className="card">
        {loading ? (
          <p className="muted">در حال بارگذاری…</p>
        ) : items.length === 0 ? (
          <p className="muted">مشتری‌ای یافت نشد.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>نام</th>
                  <th>تلفن</th>
                  <th>ایمیل</th>
                  <th>سقف اعتبار</th>
                  <th>وضعیت</th>
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
                        {item.isActive ? 'فعال' : 'غیرفعال'}
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

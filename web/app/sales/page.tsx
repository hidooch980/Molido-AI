'use client';

import { useCallback, useEffect, useState } from 'react';
import AppShell from '../../components/AppShell';
import { useI18n } from '../../lib/i18n-context';
import { API_URL, api, getToken } from '../../lib/api';
import { amountOnly, loadCurrency } from '../../lib/money';

type Sale = {
  id: string;
  invoiceNo: string;
  status: string;
  total: string | number;
  createdAt: string;
  customer?: { firstName: string; lastName?: string | null } | null;
  _count?: { items: number };
};

const STATUS: Record<string, string> = {
  PAID: 'paid',
  PARTIAL: 'partial',
  PENDING: 'pending',
  CANCELLED: 'cancelled',
  RETURNED: 'returned',
};

export default function SalesPage() {
  const { t, locale } = useI18n();
  const [items, setItems] = useState<Sale[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const fa = (v: unknown) => amountOnly(v);

  const load = useCallback(async () => {
    setLoading(true);

    try {
      const result = await api<Sale[] | { data: Sale[] }>('/sales?limit=100');

      setItems(Array.isArray(result) ? result : (result.data ?? []));
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('invoicesError'));
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

  /** فاکتور چاپی با توکن گرفته و در پنجره جدید باز می‌شود */
  async function openInvoice(id: string) {
    try {
      const response = await fetch(`${API_URL}/sales/${id}/print`, {
        headers: { Authorization: `Bearer ${getToken() ?? ''}` },
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const html = await response.text();
      const win = window.open('', '_blank');

      if (win) {
        win.document.write(html);
        win.document.close();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('invoiceError'));
    }
  }

  return (
    <AppShell
      title={t('salesTitle')}
      subtitle={`${fa(items.length)} ${t('invoicesCountLabel')}`}
      actions={
        <button type="button" className="btn-sm" onClick={() => void load()}>
          {t('refresh')}
        </button>
      }
    >
      {error ? <div className="error">{error}</div> : null}

      <div className="card">
        {loading ? (
          <p className="muted">{t('loading')}</p>
        ) : items.length === 0 ? (
          <p className="muted">{t('noInvoices')}</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t('colNumber')}</th>
                  <th>{t('customer')}</th>
                  <th>{t('colItems')}</th>
                  <th>{t('colAmount')}</th>
                  <th>{t('status')}</th>
                  <th>{t('date')}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((sale) => (
                  <tr key={sale.id}>
                    <td style={{ fontWeight: 600 }}>{sale.invoiceNo}</td>
                    <td className="muted">
                      {sale.customer
                        ? `${sale.customer.firstName} ${sale.customer.lastName ?? ''}`
                        : t('cash')}
                    </td>
                    <td>{fa(sale._count?.items ?? 0)}</td>
                    <td>{fa(sale.total)}</td>
                    <td>
                      <span className="badge">
                        {STATUS[sale.status] ? t(STATUS[sale.status]) : sale.status}
                      </span>
                    </td>
                    <td className="muted">
                      {new Date(sale.createdAt).toLocaleDateString(locale)}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn-sm ghost"
                        onClick={() => void openInvoice(sale.id)}
                      >
                        {t('print')}
                      </button>
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

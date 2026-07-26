'use client';

import { useCallback, useEffect, useState } from 'react';
import AppShell from '../../components/AppShell';
import { API_URL, api, getToken } from '../../lib/api';

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
  PAID: 'پرداخت‌شده',
  PARTIAL: 'قسمتی',
  PENDING: 'در انتظار',
  CANCELLED: 'لغو',
  RETURNED: 'مرجوع',
};

export default function SalesPage() {
  const [items, setItems] = useState<Sale[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const fa = (v: unknown) => Number(v ?? 0).toLocaleString('fa-IR');

  const load = useCallback(async () => {
    setLoading(true);

    try {
      const result = await api<Sale[] | { data: Sale[] }>('/sales?limit=100');

      setItems(Array.isArray(result) ? result : (result.data ?? []));
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در دریافت فاکتورها');
    } finally {
      setLoading(false);
    }
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
      setError(err instanceof Error ? err.message : 'خطا در دریافت فاکتور');
    }
  }

  return (
    <AppShell
      title="فروش"
      subtitle={`${fa(items.length)} فاکتور`}
      actions={
        <button type="button" className="btn-sm" onClick={() => void load()}>
          بروزرسانی
        </button>
      }
    >
      {error ? <div className="error">{error}</div> : null}

      <div className="card">
        {loading ? (
          <p className="muted">در حال بارگذاری…</p>
        ) : items.length === 0 ? (
          <p className="muted">فاکتوری ثبت نشده است.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>شماره</th>
                  <th>مشتری</th>
                  <th>اقلام</th>
                  <th>مبلغ</th>
                  <th>وضعیت</th>
                  <th>تاریخ</th>
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
                        : 'نقدی'}
                    </td>
                    <td>{fa(sale._count?.items ?? 0)}</td>
                    <td>{fa(sale.total)}</td>
                    <td>
                      <span className="badge">
                        {STATUS[sale.status] ?? sale.status}
                      </span>
                    </td>
                    <td className="muted">
                      {new Date(sale.createdAt).toLocaleDateString('fa-IR')}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn-sm ghost"
                        onClick={() => void openInvoice(sale.id)}
                      >
                        چاپ
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

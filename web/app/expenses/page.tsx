'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import AppShell from '../../components/AppShell';
import { api } from '../../lib/api';

type Expense = {
  id: string;
  title: string;
  amount: string | number;
  status: string;
  note?: string | null;
  createdAt: string;
};

const STATUS = [
  { value: 'DRAFT', label: 'ثبت‌شده' },
  { value: 'PAID', label: 'پرداخت‌شده' },
  { value: 'CANCELLED', label: 'لغو شده' },
];

/** هزینه‌های جاری — اجاره، قبض، حقوق و… */
export default function ExpensesPage() {
  const [list, setList] = useState<Expense[]>([]);
  const [form, setForm] = useState({ title: '', amount: 0, note: '' });

  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const fa = (v: unknown) => Number(v ?? 0).toLocaleString('fa-IR');

  const load = useCallback(async () => {
    try {
      const res = await api<Expense[] | { data: Expense[] }>('/expenses');

      setList(Array.isArray(res) ? res : (res?.data ?? []));
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در دریافت هزینه‌ها');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const stats = useMemo(() => {
    const paid = list.filter((e) => e.status === 'PAID');
    const now = new Date();
    const thisMonth = paid.filter((e) => {
      const d = new Date(e.createdAt);

      return (
        d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
      );
    });

    return {
      totalPaid: paid.reduce((s, e) => s + Number(e.amount), 0),
      month: thisMonth.reduce((s, e) => s + Number(e.amount), 0),
      pending: list
        .filter((e) => e.status === 'DRAFT')
        .reduce((s, e) => s + Number(e.amount), 0),
    };
  }, [list]);

  async function submit() {
    if (busy || !form.title.trim() || form.amount <= 0) return;

    setBusy(true);
    setError('');
    setMessage('');

    try {
      await api('/expenses', {
        method: 'POST',
        body: {
          title: form.title.trim(),
          amount: form.amount,
          note: form.note || undefined,
        },
      });

      setMessage('هزینه ثبت شد ✅');
      setForm({ title: '', amount: 0, note: '' });
      void load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در ثبت هزینه');
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(id: string, status: string) {
    setError('');
    setMessage('');

    try {
      await api(`/expenses/${id}`, { method: 'PATCH', body: { status } });
      setMessage('وضعیت به‌روز شد ✅');
      void load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در تغییر وضعیت');
    }
  }

  async function remove(id: string) {
    setError('');
    setMessage('');

    try {
      await api(`/expenses/${id}`, { method: 'DELETE' });
      setMessage('هزینه حذف شد');
      void load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در حذف');
    }
  }

  return (
    <AppShell title="هزینه‌ها" subtitle="اجاره، قبض، حقوق و هزینه‌های جاری">
      {error ? <div className="error">{error}</div> : null}
      {message ? <div className="ok">{message}</div> : null}

      <div className="stats-grid">
        <div className="stat-card">
          <span className="stat-icon">💸</span>
          <span className="stat-label">هزینه این ماه</span>
          <span className="stat-value">{fa(stats.month)}</span>
        </div>
        <div className="stat-card">
          <span className="stat-icon">📊</span>
          <span className="stat-label">مجموع پرداخت‌شده</span>
          <span className="stat-value">{fa(stats.totalPaid)}</span>
        </div>
        <div className="stat-card">
          <span className="stat-icon">⏳</span>
          <span className="stat-label">در انتظار پرداخت</span>
          <span className="stat-value">{fa(stats.pending)}</span>
        </div>
      </div>

      <div className="card">
        <h3>➕ ثبت هزینه</h3>
        <div className="pos-settings" style={{ marginBottom: 12 }}>
          <label>
            <span className="muted">عنوان</span>
            <input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="مثلاً اجاره مهرماه"
            />
          </label>
          <label>
            <span className="muted">مبلغ</span>
            <input
              type="number"
              min={0}
              value={form.amount}
              onChange={(e) =>
                setForm({ ...form, amount: Number(e.target.value) || 0 })
              }
            />
          </label>
          <label>
            <span className="muted">توضیحات</span>
            <input
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              placeholder="اختیاری"
            />
          </label>
        </div>
        <button
          type="button"
          className="btn-sm"
          disabled={busy || !form.title.trim() || form.amount <= 0}
          onClick={() => void submit()}
        >
          {busy ? 'در حال ثبت…' : 'ثبت هزینه'}
        </button>
      </div>

      <div className="card">
        <h3>📋 فهرست هزینه‌ها</h3>

        {list.length === 0 ? (
          <p className="muted empty">هزینه‌ای ثبت نشده است.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>عنوان</th>
                  <th>مبلغ</th>
                  <th>تاریخ</th>
                  <th>وضعیت</th>
                  <th>عملیات</th>
                </tr>
              </thead>
              <tbody>
                {list.map((e) => (
                  <tr key={e.id}>
                    <td>
                      {e.title}
                      {e.note ? (
                        <div className="muted" style={{ fontSize: 11.5 }}>
                          {e.note}
                        </div>
                      ) : null}
                    </td>
                    <td>
                      <strong>{fa(e.amount)}</strong>
                    </td>
                    <td>{new Date(e.createdAt).toLocaleDateString('fa-IR')}</td>
                    <td>
                      <span
                        className={
                          e.status === 'PAID' ? 'badge done' : 'badge'
                        }
                      >
                        {STATUS.find((s) => s.value === e.status)?.label ??
                          e.status}
                      </span>
                    </td>
                    <td className="row-actions">
                      {e.status !== 'PAID' ? (
                        <button
                          type="button"
                          className="btn-sm"
                          onClick={() => void setStatus(e.id, 'PAID')}
                        >
                          پرداخت شد
                        </button>
                      ) : null}
                      {e.status === 'DRAFT' ? (
                        <button
                          type="button"
                          className="btn-sm"
                          onClick={() => void remove(e.id)}
                        >
                          حذف
                        </button>
                      ) : null}
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

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import AppShell from '../../components/AppShell';
import { api } from '../../lib/api';

type Cheque = {
  id: string;
  chequeNo: string;
  bankName?: string | null;
  dueDate: string;
  amount: string | number;
  type: string;
  status: string;
  ownerName?: string | null;
  note?: string | null;
};

const TYPES = [
  { value: 'RECEIVED', label: 'دریافتی' },
  { value: 'ISSUED', label: 'پرداختی' },
];

const STATUS: Array<{ value: string; label: string }> = [
  { value: 'REGISTERED', label: 'ثبت‌شده' },
  { value: 'DEPOSITED', label: 'به بانک رفته' },
  { value: 'CLEARED', label: 'وصول شده' },
  { value: 'BOUNCED', label: 'برگشتی' },
  { value: 'RETURNED', label: 'عودت‌شده' },
];

/**
 * انتقال‌های مجاز وضعیت — آینه‌ی همان ماشین وضعیتی که بک‌اند اعمال می‌کند.
 * چک ثبت‌شده مستقیماً وصول نمی‌شود؛ اول باید به بانک برود.
 */
const TRANSITIONS: Record<string, string[]> = {
  REGISTERED: ['DEPOSITED', 'RETURNED'],
  DEPOSITED: ['CLEARED', 'BOUNCED'],
  CLEARED: [],
  BOUNCED: ['DEPOSITED', 'RETURNED'],
  RETURNED: [],
};

function label(list: Array<{ value: string; label: string }>, v: string) {
  return list.find((x) => x.value === v)?.label ?? v;
}

/** روزهای باقی‌مانده تا سررسید (منفی = گذشته). */
function daysLeft(due: string) {
  const d = new Date(due);
  const today = new Date();

  d.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);

  return Math.round((d.getTime() - today.getTime()) / 86400000);
}

/** چک‌های دریافتی و پرداختی با هشدار سررسید. */
export default function ChequesPage() {
  const [list, setList] = useState<Cheque[]>([]);
  const [filter, setFilter] = useState('');

  const [form, setForm] = useState({
    chequeNo: '',
    bankName: '',
    ownerName: '',
    amount: 0,
    dueDate: new Date().toISOString().slice(0, 10),
    type: 'RECEIVED',
    note: '',
  });

  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const fa = (v: unknown) => Number(v ?? 0).toLocaleString('fa-IR');

  const load = useCallback(async () => {
    try {
      const res = await api<Cheque[] | { data: Cheque[] }>('/cheques');

      setList(Array.isArray(res) ? res : (res?.data ?? []));
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در دریافت چک‌ها');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(
    () => (filter ? list.filter((c) => c.status === filter) : list),
    [list, filter],
  );

  const stats = useMemo(() => {
    const open = list.filter(
      (c) => c.status === 'REGISTERED' || c.status === 'DEPOSITED',
    );

    return {
      received: list
        .filter((c) => c.type === 'RECEIVED' && c.status !== 'CLEARED')
        .reduce((s, c) => s + Number(c.amount), 0),
      issued: list
        .filter((c) => c.type === 'ISSUED' && c.status !== 'CLEARED')
        .reduce((s, c) => s + Number(c.amount), 0),
      bounced: list.filter((c) => c.status === 'BOUNCED').length,
      dueSoon: open.filter((c) => {
        const d = daysLeft(c.dueDate);

        return d >= 0 && d <= 7;
      }).length,
      overdue: open.filter((c) => daysLeft(c.dueDate) < 0).length,
    };
  }, [list]);

  async function submit() {
    if (busy || !form.chequeNo.trim() || form.amount <= 0) return;

    setBusy(true);
    setError('');
    setMessage('');

    try {
      await api('/cheques', {
        method: 'POST',
        body: {
          chequeNo: form.chequeNo.trim(),
          bankName: form.bankName || undefined,
          ownerName: form.ownerName || undefined,
          amount: form.amount,
          dueDate: new Date(form.dueDate).toISOString(),
          type: form.type,
          note: form.note || undefined,
        },
      });

      setMessage('چک ثبت شد ✅');
      setForm({ ...form, chequeNo: '', amount: 0, note: '' });
      void load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در ثبت چک');
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(id: string, status: string) {
    setError('');
    setMessage('');

    try {
      await api(`/cheques/${id}/status`, { method: 'PATCH', body: { status } });
      setMessage(`وضعیت به «${label(STATUS, status)}» تغییر کرد ✅`);
      void load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در تغییر وضعیت');
    }
  }

  return (
    <AppShell title="چک‌ها" subtitle="چک دریافتی و پرداختی، سررسید و وصول">
      {error ? <div className="error">{error}</div> : null}
      {message ? <div className="ok">{message}</div> : null}

      <div className="stats-grid">
        <div className="stat-card">
          <span className="stat-icon">📥</span>
          <span className="stat-label">چک دریافتی باز</span>
          <span className="stat-value">{fa(stats.received)}</span>
        </div>
        <div className="stat-card">
          <span className="stat-icon">📤</span>
          <span className="stat-label">چک پرداختی باز</span>
          <span className="stat-value">{fa(stats.issued)}</span>
        </div>
        <div className="stat-card">
          <span className="stat-icon">⏰</span>
          <span className="stat-label">سررسید تا ۷ روز</span>
          <span className="stat-value">{fa(stats.dueSoon)}</span>
        </div>
        <div className="stat-card">
          <span className="stat-icon">⚠️</span>
          <span className="stat-label">سررسید گذشته</span>
          <span className="stat-value">{fa(stats.overdue)}</span>
        </div>
        <div className="stat-card">
          <span className="stat-icon">❌</span>
          <span className="stat-label">برگشتی</span>
          <span className="stat-value">{fa(stats.bounced)}</span>
        </div>
      </div>

      {/* ثبت چک */}
      <div className="card">
        <h3>➕ ثبت چک</h3>
        <div className="pos-settings" style={{ marginBottom: 12 }}>
          <label>
            <span className="muted">شماره چک</span>
            <input
              value={form.chequeNo}
              onChange={(e) => setForm({ ...form, chequeNo: e.target.value })}
            />
          </label>
          <label>
            <span className="muted">نوع</span>
            <select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
            >
              {TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
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
            <span className="muted">سررسید</span>
            <input
              type="date"
              value={form.dueDate}
              onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
            />
          </label>
          <label>
            <span className="muted">بانک</span>
            <input
              value={form.bankName}
              onChange={(e) => setForm({ ...form, bankName: e.target.value })}
              placeholder="اختیاری"
            />
          </label>
          <label>
            <span className="muted">صاحب چک</span>
            <input
              value={form.ownerName}
              onChange={(e) => setForm({ ...form, ownerName: e.target.value })}
              placeholder="اختیاری"
            />
          </label>
        </div>
        <button
          type="button"
          className="btn-sm"
          disabled={busy || !form.chequeNo.trim() || form.amount <= 0}
          onClick={() => void submit()}
        >
          {busy ? 'در حال ثبت…' : 'ثبت چک'}
        </button>
      </div>

      {/* فهرست */}
      <div className="card">
        <div className="receipt-actions" style={{ marginBottom: 12 }}>
          <h3>📋 فهرست چک‌ها</h3>
          <select
            className="disc-input"
            style={{ width: 160 }}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="">همه وضعیت‌ها</option>
            {STATUS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        {visible.length === 0 ? (
          <p className="muted empty">چکی یافت نشد.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>شماره</th>
                  <th>نوع</th>
                  <th>مبلغ</th>
                  <th>سررسید</th>
                  <th>وضعیت</th>
                  <th>تغییر وضعیت</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((c) => {
                  const d = daysLeft(c.dueDate);
                  const open =
                    c.status === 'REGISTERED' || c.status === 'DEPOSITED';

                  return (
                    <tr key={c.id}>
                      <td>
                        {c.chequeNo}
                        {c.bankName ? (
                          <div className="muted" style={{ fontSize: 11.5 }}>
                            {c.bankName}
                          </div>
                        ) : null}
                      </td>
                      <td>
                        <span className="badge">{label(TYPES, c.type)}</span>
                      </td>
                      <td>
                        <strong>{fa(c.amount)}</strong>
                      </td>
                      <td>
                        {new Date(c.dueDate).toLocaleDateString('fa-IR')}
                        {open ? (
                          <div
                            style={{
                              fontSize: 11.5,
                              color:
                                d < 0
                                  ? '#fecaca'
                                  : d <= 7
                                    ? '#fde68a'
                                    : undefined,
                            }}
                            className={d > 7 ? 'muted' : undefined}
                          >
                            {d < 0
                              ? `${fa(-d)} روز گذشته`
                              : d === 0
                                ? 'امروز'
                                : `${fa(d)} روز مانده`}
                          </div>
                        ) : null}
                      </td>
                      <td>
                        <span
                          className={
                            c.status === 'CLEARED' ? 'badge done' : 'badge'
                          }
                        >
                          {label(STATUS, c.status)}
                        </span>
                      </td>
                      <td className="row-actions">
                        {(TRANSITIONS[c.status] ?? []).length === 0 ? (
                          <span className="muted">پایان یافته</span>
                        ) : (
                          (TRANSITIONS[c.status] ?? []).map((next) => (
                            <button
                              key={next}
                              type="button"
                              className="btn-sm"
                              onClick={() => void setStatus(c.id, next)}
                            >
                              {label(STATUS, next)}
                            </button>
                          ))
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  );
}

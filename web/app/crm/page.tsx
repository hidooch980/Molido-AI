'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import AppShell from '../../components/AppShell';
import { api } from '../../lib/api';

type Customer = { id: string; firstName: string; lastName: string; phone?: string | null };

type Member = {
  id: string;
  customerId: string;
  points: number;
  tier: string;
  note?: string | null;
  customer?: Customer;
};

type Coupon = {
  id: string;
  code: string;
  percent?: number | null;
  amount?: string | number | null;
  expiresAt?: string | null;
  maxUses: number;
  usedCount: number;
  isActive: boolean;
};

type Stats = {
  total: number;
  totalPoints: number;
  byTier: Record<string, number>;
  rialsPerPoint: number;
};

const TIERS = [
  { value: 'BRONZE', label: 'برنز', icon: '🥉' },
  { value: 'SILVER', label: 'نقره‌ای', icon: '🥈' },
  { value: 'GOLD', label: 'طلایی', icon: '🥇' },
  { value: 'VIP', label: 'ویژه', icon: '💎' },
];

function tierLabel(t: string) {
  const x = TIERS.find((i) => i.value === t);

  return x ? `${x.icon} ${x.label}` : t;
}

/** باشگاه مشتریان — امتیاز وفاداری، سطح‌بندی و کوپن تخفیف. */
export default function CrmPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);

  const [newCustomerId, setNewCustomerId] = useState('');
  const [search, setSearch] = useState('');

  const [coupon, setCoupon] = useState({
    code: '',
    mode: 'percent' as 'percent' | 'amount',
    percent: 10,
    amount: 0,
    maxUses: 0,
    expiresAt: '',
  });

  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const fa = (v: unknown) => Number(v ?? 0).toLocaleString('fa-IR');

  const load = useCallback(async () => {
    try {
      const unwrap = <T,>(v: T[] | { data: T[] }): T[] =>
        Array.isArray(v) ? v : (v?.data ?? []);

      const [m, c, cp, s] = await Promise.all([
        api<Member[] | { data: Member[] }>('/crm'),
        api<Customer[] | { data: Customer[] }>('/customers?limit=200'),
        api<Coupon[] | { data: Coupon[] }>('/crm/coupons').catch(
          () => [] as Coupon[],
        ),
        api<Stats>('/crm/stats').catch(() => null),
      ]);

      setMembers(unwrap(m));
      setCustomers(unwrap(c));
      setCoupons(unwrap(cp));
      setStats(s);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در دریافت اطلاعات');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** مشتریانی که هنوز عضو نیستند. */
  const available = useMemo(() => {
    const joined = new Set(members.map((m) => m.customerId));

    return customers.filter((c) => !joined.has(c.id));
  }, [customers, members]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();

    if (!q) return members;

    return members.filter((m) => {
      const name = `${m.customer?.firstName ?? ''} ${m.customer?.lastName ?? ''}`;

      return (
        name.toLowerCase().includes(q) || (m.customer?.phone ?? '').includes(q)
      );
    });
  }, [members, search]);

  async function run(label: string, fn: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    setMessage('');

    try {
      await fn();
      setMessage(label);
      void load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در انجام عملیات');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell
      title="باشگاه مشتریان"
      subtitle="امتیاز وفاداری، سطح‌بندی و کوپن تخفیف"
    >
      {error ? <div className="error">{error}</div> : null}
      {message ? <div className="ok">{message}</div> : null}

      <div className="stats-grid">
        <div className="stat-card">
          <span className="stat-icon">👥</span>
          <span className="stat-label">اعضا</span>
          <span className="stat-value">{fa(stats?.total ?? members.length)}</span>
        </div>
        <div className="stat-card">
          <span className="stat-icon">⭐</span>
          <span className="stat-label">مجموع امتیاز</span>
          <span className="stat-value">{fa(stats?.totalPoints ?? 0)}</span>
        </div>
        {TIERS.map((t) => (
          <div className="stat-card" key={t.value}>
            <span className="stat-icon">{t.icon}</span>
            <span className="stat-label">{t.label}</span>
            <span className="stat-value">{fa(stats?.byTier?.[t.value] ?? 0)}</span>
          </div>
        ))}
      </div>

      {stats ? (
        <p className="muted" style={{ fontSize: 12.5, marginBottom: 14 }}>
          به ازای هر {fa(stats.rialsPerPoint)} ریال خرید، ۱ امتیاز ثبت می‌شود.
          سطح‌ها: نقره‌ای از {fa(1000)}، طلایی از {fa(5000)}، ویژه از{' '}
          {fa(20000)} امتیاز.
        </p>
      ) : null}

      {/* ───── عضویت جدید ───── */}
      <div className="card">
        <h3>➕ عضویت مشتری</h3>
        <div className="pos-settings" style={{ marginBottom: 12 }}>
          <label>
            <span className="muted">مشتری</span>
            <select
              value={newCustomerId}
              onChange={(e) => setNewCustomerId(e.target.value)}
            >
              <option value="">انتخاب کنید…</option>
              {available.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.firstName} {c.lastName}
                  {c.phone ? ` — ${c.phone}` : ''}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button
          type="button"
          className="btn-sm"
          disabled={busy || !newCustomerId}
          onClick={() =>
            void run('مشتری عضو باشگاه شد ✅', async () => {
              await api('/crm', {
                method: 'POST',
                body: { customerId: newCustomerId },
              });
              setNewCustomerId('');
            })
          }
        >
          ثبت عضویت
        </button>
        {available.length === 0 && customers.length > 0 ? (
          <p className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>
            همه مشتریان عضو باشگاه هستند.
          </p>
        ) : null}
      </div>

      {/* ───── اعضا ───── */}
      <div className="card">
        <div className="receipt-actions" style={{ marginBottom: 12 }}>
          <h3>🏅 اعضای باشگاه</h3>
          <input
            className="disc-input"
            style={{ width: 200 }}
            placeholder="جستجوی نام یا تلفن…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {visible.length === 0 ? (
          <p className="muted empty">عضوی یافت نشد.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>مشتری</th>
                  <th>تلفن</th>
                  <th>امتیاز</th>
                  <th>سطح</th>
                  <th>تغییر امتیاز</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((m) => (
                  <tr key={m.id}>
                    <td>
                      {m.customer
                        ? `${m.customer.firstName} ${m.customer.lastName}`
                        : '—'}
                    </td>
                    <td className="muted">{m.customer?.phone ?? '—'}</td>
                    <td>
                      <strong>{fa(m.points)}</strong>
                    </td>
                    <td>
                      <span className="badge">{tierLabel(m.tier)}</span>
                    </td>
                    <td className="row-actions">
                      {[100, 500, -100].map((d) => (
                        <button
                          key={d}
                          type="button"
                          className="btn-sm"
                          disabled={busy || (d < 0 && m.points < -d)}
                          onClick={() =>
                            void run('امتیاز به‌روز شد ✅', () =>
                              api(`/crm/${m.id}/points`, {
                                method: 'PATCH',
                                body: { delta: d },
                              }),
                            )
                          }
                        >
                          {d > 0 ? `+${fa(d)}` : `−${fa(-d)}`}
                        </button>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ───── کوپن جدید ───── */}
      <div className="card">
        <h3>🎟️ کوپن تخفیف جدید</h3>
        <div className="pos-settings" style={{ marginBottom: 12 }}>
          <label>
            <span className="muted">کد کوپن</span>
            <input
              value={coupon.code}
              onChange={(e) => setCoupon({ ...coupon, code: e.target.value })}
              placeholder="NOWRUZ1405"
            />
          </label>
          <label>
            <span className="muted">نوع تخفیف</span>
            <select
              value={coupon.mode}
              onChange={(e) =>
                setCoupon({
                  ...coupon,
                  mode: e.target.value as 'percent' | 'amount',
                })
              }
            >
              <option value="percent">درصدی</option>
              <option value="amount">مبلغ ثابت</option>
            </select>
          </label>
          {coupon.mode === 'percent' ? (
            <label>
              <span className="muted">درصد</span>
              <input
                type="number"
                min={1}
                max={100}
                value={coupon.percent}
                onChange={(e) =>
                  setCoupon({ ...coupon, percent: Number(e.target.value) || 0 })
                }
              />
            </label>
          ) : (
            <label>
              <span className="muted">مبلغ</span>
              <input
                type="number"
                min={0}
                value={coupon.amount}
                onChange={(e) =>
                  setCoupon({ ...coupon, amount: Number(e.target.value) || 0 })
                }
              />
            </label>
          )}
          <label>
            <span className="muted">سقف استفاده (۰ = نامحدود)</span>
            <input
              type="number"
              min={0}
              value={coupon.maxUses}
              onChange={(e) =>
                setCoupon({ ...coupon, maxUses: Number(e.target.value) || 0 })
              }
            />
          </label>
          <label>
            <span className="muted">تاریخ انقضا</span>
            <input
              type="date"
              value={coupon.expiresAt}
              onChange={(e) =>
                setCoupon({ ...coupon, expiresAt: e.target.value })
              }
            />
          </label>
        </div>
        <button
          type="button"
          className="btn-sm"
          disabled={busy || !coupon.code.trim()}
          onClick={() =>
            void run('کوپن ساخته شد ✅', async () => {
              await api('/crm/coupons', {
                method: 'POST',
                body: {
                  code: coupon.code.trim(),
                  ...(coupon.mode === 'percent'
                    ? { percent: coupon.percent }
                    : { amount: coupon.amount }),
                  maxUses: coupon.maxUses,
                  expiresAt: coupon.expiresAt
                    ? new Date(coupon.expiresAt).toISOString()
                    : undefined,
                },
              });
              setCoupon({ ...coupon, code: '' });
            })
          }
        >
          ساخت کوپن
        </button>
      </div>

      {/* ───── فهرست کوپن‌ها ───── */}
      <div className="card">
        <h3>📋 کوپن‌ها</h3>

        {coupons.length === 0 ? (
          <p className="muted empty">کوپنی ساخته نشده است.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>کد</th>
                  <th>تخفیف</th>
                  <th>استفاده</th>
                  <th>انقضا</th>
                  <th>وضعیت</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {coupons.map((c) => {
                  const expired =
                    !!c.expiresAt && new Date(c.expiresAt) < new Date();
                  const exhausted = c.maxUses > 0 && c.usedCount >= c.maxUses;

                  return (
                    <tr key={c.id}>
                      <td>
                        <strong>{c.code}</strong>
                      </td>
                      <td>
                        {c.percent
                          ? `${fa(c.percent)}٪`
                          : `${fa(c.amount)} ریال`}
                      </td>
                      <td>
                        {fa(c.usedCount)}
                        {c.maxUses > 0 ? ` / ${fa(c.maxUses)}` : ''}
                      </td>
                      <td className="muted">
                        {c.expiresAt
                          ? new Date(c.expiresAt).toLocaleDateString('fa-IR')
                          : 'بدون انقضا'}
                      </td>
                      <td>
                        <span
                          className={
                            c.isActive && !expired && !exhausted
                              ? 'badge done'
                              : 'badge'
                          }
                        >
                          {!c.isActive
                            ? 'غیرفعال'
                            : expired
                              ? 'منقضی'
                              : exhausted
                                ? 'سقف پر'
                                : 'فعال'}
                        </span>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn-sm"
                          disabled={busy}
                          onClick={() =>
                            void run('وضعیت کوپن تغییر کرد ✅', () =>
                              api(`/crm/coupons/${c.id}/active`, {
                                method: 'PATCH',
                                body: { isActive: !c.isActive },
                              }),
                            )
                          }
                        >
                          {c.isActive ? 'غیرفعال کن' : 'فعال کن'}
                        </button>
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

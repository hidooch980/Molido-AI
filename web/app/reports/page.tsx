'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import AppShell from '../../components/AppShell';
import { api } from '../../lib/api';

type Profit = { revenue: number; cost: number; profit: number; margin?: number };
type TopItem = {
  productId: string;
  name: string;
  sku: string;
  quantity: number;
  revenue: number;
};
type Expense = { id: string; amount: string | number; status: string; createdAt: string };
type Daily = { date: string; total: number; count: number };
type SalesReport = { totalRevenue: number; totalInvoices: number; daily: Daily[] };

function today() {
  return new Date().toISOString().slice(0, 10);
}

function monthAgo() {
  const d = new Date();

  d.setDate(d.getDate() - 30);

  return d.toISOString().slice(0, 10);
}

/**
 * گزارش سود و زیان.
 *
 * گزارش سود بک‌اند فقط سود ناخالص (فروش − بهای کالای فروخته‌شده) می‌دهد؛
 * هزینه‌های جاری در آن نیست. اینجا هزینه‌های پرداخت‌شده همان بازه کم
 * می‌شود تا سود خالص واقعی به دست آید.
 */
export default function ReportsPage() {
  const [from, setFrom] = useState(monthAgo());
  const [to, setTo] = useState(today());

  const [profit, setProfit] = useState<Profit | null>(null);
  const [sales, setSales] = useState<SalesReport | null>(null);
  const [top, setTop] = useState<TopItem[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const fa = (v: unknown) => Number(v ?? 0).toLocaleString('fa-IR');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const q = `?from=${from}T00:00:00&to=${to}T23:59:59`;
      const unwrap = <T,>(v: T[] | { data: T[] }): T[] =>
        Array.isArray(v) ? v : (v?.data ?? []);

      const [p, s, t, e] = await Promise.all([
        api<Profit>(`/reports/profit${q}`),
        api<SalesReport>(`/reports/sales${q}`),
        api<TopItem[] | { data: TopItem[] }>('/reports/top-products?limit=10').catch(
          () => [] as TopItem[],
        ),
        api<Expense[] | { data: Expense[] }>('/expenses').catch(
          () => [] as Expense[],
        ),
      ]);

      setProfit(p);
      setSales(s);
      setTop(unwrap(t));
      setExpenses(unwrap(e));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در دریافت گزارش');
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  /** هزینه‌های پرداخت‌شده در همان بازه گزارش. */
  const periodExpenses = useMemo(() => {
    const start = new Date(`${from}T00:00:00`).getTime();
    const end = new Date(`${to}T23:59:59`).getTime();

    return expenses
      .filter((e) => e.status === 'PAID')
      .filter((e) => {
        const t = new Date(e.createdAt).getTime();

        return t >= start && t <= end;
      })
      .reduce((s, e) => s + Number(e.amount), 0);
  }, [expenses, from, to]);

  const revenue = Number(profit?.revenue ?? 0);
  const cogs = Number(profit?.cost ?? 0);
  const gross = Number(profit?.profit ?? revenue - cogs);
  const net = gross - periodExpenses;

  const grossMargin = revenue > 0 ? (gross / revenue) * 100 : 0;
  const netMargin = revenue > 0 ? (net / revenue) * 100 : 0;

  const pct = (v: number) =>
    `${v.toLocaleString('fa-IR', { maximumFractionDigits: 1 })}٪`;

  /** بیشترین فروش روزانه — برای مقیاس نمودار میله‌ای. */
  const maxDaily = useMemo(
    () => Math.max(1, ...(sales?.daily ?? []).map((d) => d.total)),
    [sales],
  );

  return (
    <AppShell title="گزارش سود و زیان" subtitle="فروش، بهای تمام‌شده، هزینه و سود خالص">
      {error ? <div className="error">{error}</div> : null}

      <div className="card pos-settings">
        <label>
          <span className="muted">از تاریخ</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label>
          <span className="muted">تا تاریخ</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <label>
          <span className="muted">&nbsp;</span>
          <button type="button" className="btn-sm" onClick={() => void load()}>
            {loading ? 'در حال محاسبه…' : '🔄 به‌روزرسانی'}
          </button>
        </label>
      </div>

      {/* ───── صورت سود و زیان ───── */}
      <div className="pos-layout">
        <div className="card">
          <h3>📊 صورت سود و زیان</h3>

          <div className="sum-row">
            <span>فروش خالص</span>
            <span>{fa(revenue)}</span>
          </div>
          <div className="sum-row">
            <span>بهای تمام‌شده کالای فروش‌رفته</span>
            <span>−{fa(cogs)}</span>
          </div>
          <div className="sum-row total">
            <span>سود ناخالص</span>
            <span>{fa(gross)}</span>
          </div>

          <div className="sum-row" style={{ marginTop: 8 }}>
            <span>هزینه‌های جاری (پرداخت‌شده)</span>
            <span>−{fa(periodExpenses)}</span>
          </div>
          <div className="sum-row total">
            <span>سود خالص</span>
            <span style={{ color: net < 0 ? '#fecaca' : '#a7f3d0' }}>
              {fa(net)}
            </span>
          </div>

          <div className="margin-box" style={{ marginBottom: 0 }}>
            <div className="sum-row">
              <span>حاشیه سود ناخالص</span>
              <span>{revenue > 0 ? pct(grossMargin) : '—'}</span>
            </div>
            <div className="sum-row">
              <span>حاشیه سود خالص</span>
              <span
                style={{
                  color:
                    netMargin < 0
                      ? '#fecaca'
                      : netMargin < 10
                        ? '#fde68a'
                        : '#a7f3d0',
                }}
              >
                {revenue > 0 ? pct(netMargin) : '—'}
              </span>
            </div>
          </div>

          {net < 0 ? (
            <p className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>
              ⚠️ در این بازه زیان‌ده بوده‌اید — هزینه‌ها از سود ناخالص بیشتر است.
            </p>
          ) : null}
        </div>

        <div className="card pay-card">
          <h3>📈 خلاصه</h3>
          <div className="sum-row">
            <span>تعداد فاکتور</span>
            <span>{fa(sales?.totalInvoices ?? 0)}</span>
          </div>
          <div className="sum-row">
            <span>میانگین فاکتور</span>
            <span>
              {sales && sales.totalInvoices > 0
                ? fa(Math.round(revenue / sales.totalInvoices))
                : '—'}
            </span>
          </div>
          <div className="sum-row">
            <span>روزهای فروش</span>
            <span>{fa(sales?.daily?.length ?? 0)}</span>
          </div>
          <div className="sum-row">
            <span>میانگین روزانه</span>
            <span>
              {sales && sales.daily.length > 0
                ? fa(Math.round(revenue / sales.daily.length))
                : '—'}
            </span>
          </div>
        </div>
      </div>

      {/* ───── نمودار فروش روزانه ───── */}
      {sales && sales.daily.length > 0 ? (
        <div className="card">
          <h3>📅 فروش روزانه</h3>
          <div className="bar-chart">
            {sales.daily.slice(-30).map((d) => (
              <div className="bar-col" key={d.date} title={`${d.date} — ${fa(d.total)}`}>
                <div
                  className="bar"
                  style={{ height: `${Math.max(4, (d.total / maxDaily) * 100)}%` }}
                />
                <span className="bar-label">
                  {new Date(d.date).toLocaleDateString('fa-IR', {
                    month: 'numeric',
                    day: 'numeric',
                  })}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* ───── پرفروش‌ها ───── */}
      <div className="card">
        <h3>🏆 پرفروش‌ترین کالاها</h3>

        {top.length === 0 ? (
          <p className="muted empty">داده‌ای برای نمایش نیست.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>کالا</th>
                  <th>کد</th>
                  <th>تعداد فروش</th>
                  <th>درآمد</th>
                </tr>
              </thead>
              <tbody>
                {top.map((t, i) => (
                  <tr key={t.productId}>
                    <td className="muted">{fa(i + 1)}</td>
                    <td>{t.name}</td>
                    <td className="muted">{t.sku}</td>
                    <td>{fa(t.quantity)}</td>
                    <td>
                      <strong>{fa(t.revenue)}</strong>
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

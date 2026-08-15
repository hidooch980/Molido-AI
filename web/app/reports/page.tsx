'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import AppShell from '../../components/AppShell';
import {
  DataTable,
  NUM,
  ROW,
  StatCard,
  TD,
  TOUCH,
  Tabs,
} from '../../components/ui';
import { api } from '../../lib/api';
import { useI18n } from '../../lib/i18n-context';

type SalesReport = {
  totalRevenue: number;
  totalInvoices: number;
  daily: Array<{ date: string; total: number; count: number }>;
};

type ProfitReport = {
  revenue: number;
  cost: number;
  profit: number;
  margin: number;
};

type Row = Record<string, string | number | null>;

type Breakdown = {
  byCustomer: Row[];
  byHour: Row[];
  byUser: Row[];
  byMethod: Row[];
  byProduct: Row[];
  tax: { outputVat?: string; taxableBase?: string; invoices?: string };
  returns: { count?: string; total?: string };
};

const TABS = [
  { key: 'overview', label: 'tabOverview' },
  { key: 'product', label: 'tabByProduct' },
  { key: 'customer', label: 'tabByCustomer' },
  { key: 'hour', label: 'tabByHour' },
  { key: 'user', label: 'tabByUser' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

/** نمودار میله‌ای افقی سبک — بدون کتابخانه، چون یک وابستگی برای این کافی نیست. */
function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  const width = max > 0 ? Math.max((value / max) * 100, 1) : 0;

  return (
    <div
      style={{
        height: 8,
        borderRadius: 4,
        background: 'var(--panel-strong)',
        overflow: 'hidden',
      }}
    >
      <div style={{ width: `${width}%`, height: '100%', background: color }} />
    </div>
  );
}

export default function ReportsPage() {
  const { t, locale } = useI18n();

  const [tab, setTab] = useState<TabKey>('overview');
  const [sales, setSales] = useState<SalesReport | null>(null);
  const [profit, setProfit] = useState<ProfitReport | null>(null);
  const [data, setData] = useState<Breakdown | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const fa = useCallback(
    (value: unknown) => Number(value ?? 0).toLocaleString(locale),
    [locale],
  );

  const range = useMemo(() => {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    const query = params.toString();
    return query ? `?${query}` : '';
  }, [from, to]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, p, b] = await Promise.all([
        api<SalesReport>(`/reports/sales${range}`),
        api<ProfitReport>(`/reports/profit${range}`),
        api<Breakdown>(`/reports/sales/breakdown${range}`),
      ]);

      setSales(s);
      setProfit(p);
      setData(b);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('fetchError'));
    } finally {
      setLoading(false);
    }
  }, [range, t]);

  useEffect(() => {
    void load();
  }, [load]);

  /** میان‌بر بازه — بیشتر گزارش‌ها همین دو حالت‌اند. */
  function quickRange(kind: 'today' | 'month' | 'all') {
    const now = new Date();
    const iso = (d: Date) => d.toISOString().slice(0, 10);

    if (kind === 'all') {
      setFrom('');
      setTo('');
      return;
    }

    setTo(iso(now));
    setFrom(
      kind === 'today'
        ? iso(now)
        : iso(new Date(now.getFullYear(), now.getMonth(), 1)),
    );
  }

  const summary = useMemo(() => {
    const revenue = Number(sales?.totalRevenue ?? 0);
    const invoices = Number(sales?.totalInvoices ?? 0);
    const returned = Number(data?.returns?.total ?? 0);

    return {
      revenue,
      invoices,
      // فروش خالص = فروش منهای مرجوعی.  گزارشی که مرجوعی را کم نکند، فروش
      // را بیش از واقع نشان می‌دهد و تصمیم خرید را خراب می‌کند.
      net: revenue - returned,
      returned,
      avg: invoices > 0 ? revenue / invoices : 0,
      vat: Number(data?.tax?.outputVat ?? 0),
    };
  }, [sales, data]);

  const maxHour = useMemo(
    () => Math.max(...(data?.byHour ?? []).map((r) => Number(r.total ?? 0)), 0),
    [data],
  );

  const maxDaily = useMemo(
    () => Math.max(...(sales?.daily ?? []).map((r) => Number(r.total ?? 0)), 0),
    [sales],
  );

  const maxMethod = useMemo(
    () => Math.max(...(data?.byMethod ?? []).map((r) => Number(r.total ?? 0)), 0),
    [data],
  );

  return (
    <AppShell
      title={t('reportsTitle')}
      subtitle={t('reportsSubtitle')}
      actions={
        <button type="button" className="btn-sm" onClick={() => void load()}>
          {t('refresh')}
        </button>
      }
    >
      {error ? <div className="error">{error}</div> : null}

      {/* بازه */}
      <div
        className="card"
        style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}
      >
        <button type="button" className="ghost" style={TOUCH} onClick={() => quickRange('today')}>
          {t('today')}
        </button>
        <button type="button" className="ghost" style={TOUCH} onClick={() => quickRange('month')}>
          {t('thisMonth')}
        </button>
        <button type="button" className="ghost" style={TOUCH} onClick={() => quickRange('all')}>
          {t('allTime')}
        </button>

        <label className="muted">{t('fromDate')}</label>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={TOUCH} />
        <label className="muted">{t('toDate')}</label>
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={TOUCH} />
      </div>

      <div className="stats-grid" style={{ marginTop: 18 }}>
        <StatCard icon="money" label={t('statTotalRevenue')} value={fa(summary.revenue)} />
        <StatCard
          icon="receipt"
          label={t('statInvoices')}
          value={fa(summary.invoices)}
        />
        <StatCard
          icon="trendUp"
          label={t('statProfit')}
          value={fa(profit?.profit)}
          accent={
            Number(profit?.profit ?? 0) >= 0 ? 'var(--success)' : 'var(--danger)'
          }
        />
        <StatCard
          icon="chart"
          label={t('statMargin')}
          value={`${fa(profit?.margin)}٪`}
        />
        <StatCard icon="target" label={t('statAvgInvoice')} value={fa(summary.avg)} />
        <StatCard icon="building" label={t('statVat')} value={fa(summary.vat)} />
        <StatCard
          icon="return"
          label={t('statReturned')}
          value={fa(summary.returned)}
          accent="var(--warning)"
        />
        <StatCard
          icon="check"
          label={t('statNetSales')}
          value={fa(summary.net)}
          accent="var(--success)"
        />
      </div>

      <Tabs tabs={TABS} active={tab} onChange={setTab} t={t} />

      {/* نمای کلی: فروش روزانه + ترکیب پرداخت */}
      {tab === 'overview' ? (
        <>
          <div className="card" style={{ marginBottom: 16 }}>
            <h3 style={{ marginBottom: 12 }}>{t('dailySales')}</h3>
            <DataTable
              headers={[t('date'), t('invoicesCol'), t('revenueCol'), '']}
              empty={t('noReportData')}
              loading={loading}
              loadingLabel={t('loading')}
              rows={sales?.daily?.length ?? 0}
            >
              {(sales?.daily ?? []).map((row) => (
                <tr key={row.date} style={ROW}>
                  <td style={TD} className="muted">
                    {new Date(row.date).toLocaleDateString(locale)}
                  </td>
                  <td style={NUM}>{fa(row.count)}</td>
                  <td style={NUM}>{fa(row.total)}</td>
                  <td style={{ ...TD, width: '40%' }}>
                    <Bar
                      value={Number(row.total)}
                      max={maxDaily}
                      color="var(--primary)"
                    />
                  </td>
                </tr>
              ))}
            </DataTable>
          </div>

          <div className="card">
            <h3 style={{ marginBottom: 12 }}>{t('paymentMix')}</h3>
            <DataTable
              headers={[t('paymentMethodCol'), t('invoicesCol'), t('colAmount'), '']}
              empty={t('noReportData')}
              loading={loading}
              loadingLabel={t('loading')}
              rows={data?.byMethod?.length ?? 0}
            >
              {(data?.byMethod ?? []).map((row) => (
                <tr key={String(row.method)} style={ROW}>
                  <td style={TD}>{t(`method${row.method}`)}</td>
                  <td style={NUM}>{fa(row.count)}</td>
                  <td style={NUM}>{fa(row.total)}</td>
                  <td style={{ ...TD, width: '40%' }}>
                    <Bar
                      value={Number(row.total)}
                      max={maxMethod}
                      color="var(--accent)"
                    />
                  </td>
                </tr>
              ))}
            </DataTable>
          </div>
        </>
      ) : null}

      {/* کالا — با سود، نه فقط فروش */}
      {tab === 'product' ? (
        <div className="card">
          <DataTable
            headers={[
              t('colProduct'),
              t('sku'),
              t('qtyCol'),
              t('revenueCol'),
              t('costCol'),
              t('profitCol'),
              t('marginCol'),
            ]}
            empty={t('noReportData')}
            loading={loading}
            loadingLabel={t('loading')}
            rows={data?.byProduct?.length ?? 0}
          >
            {(data?.byProduct ?? []).map((row) => {
              const revenue = Number(row.revenue ?? 0);
              const profitValue = Number(row.profit ?? 0);
              const margin = revenue > 0 ? (profitValue / revenue) * 100 : 0;

              return (
                <tr key={String(row.productId)} style={ROW}>
                  <td style={TD}>{row.name}</td>
                  <td style={TD} className="muted">
                    {row.sku ?? '—'}
                  </td>
                  <td style={NUM}>{fa(row.quantity)}</td>
                  <td style={NUM}>{fa(revenue)}</td>
                  <td style={NUM} className="muted">
                    {fa(row.cost)}
                  </td>
                  <td
                    style={{
                      ...NUM,
                      fontWeight: 700,
                      color:
                        profitValue >= 0 ? 'var(--success)' : 'var(--danger)',
                    }}
                  >
                    {fa(profitValue)}
                  </td>
                  <td
                    style={{
                      ...NUM,
                      // حاشیهٔ منفی یعنی زیر قیمت خرید فروخته شده — باید
                      // فوراً دیده شود.
                      color: margin < 0 ? 'var(--danger)' : undefined,
                    }}
                  >
                    {fa(Math.round(margin))}٪
                  </td>
                </tr>
              );
            })}
          </DataTable>
        </div>
      ) : null}

      {/* مشتری */}
      {tab === 'customer' ? (
        <div className="card">
          <DataTable
            headers={[t('customer'), t('invoicesCol'), t('revenueCol')]}
            empty={t('noReportData')}
            loading={loading}
            loadingLabel={t('loading')}
            rows={data?.byCustomer?.length ?? 0}
          >
            {(data?.byCustomer ?? []).map((row, index) => (
              <tr key={`${row.name}-${index}`} style={ROW}>
                <td style={TD}>{row.name}</td>
                <td style={NUM}>{fa(row.invoices)}</td>
                <td style={NUM}>{fa(row.total)}</td>
              </tr>
            ))}
          </DataTable>
        </div>
      ) : null}

      {/* ساعت‌های اوج */}
      {tab === 'hour' ? (
        <div className="card">
          <DataTable
            headers={[t('hourCol'), t('invoicesCol'), t('revenueCol'), '']}
            empty={t('noReportData')}
            loading={loading}
            loadingLabel={t('loading')}
            rows={data?.byHour?.length ?? 0}
          >
            {(data?.byHour ?? []).map((row) => (
              <tr key={String(row.hour)} style={ROW}>
                <td style={TD}>
                  {String(row.hour).padStart(2, '0')}:00
                </td>
                <td style={NUM}>{fa(row.invoices)}</td>
                <td style={NUM}>{fa(row.total)}</td>
                <td style={{ ...TD, width: '50%' }}>
                  <Bar
                    value={Number(row.total)}
                    max={maxHour}
                    color="var(--warning)"
                  />
                </td>
              </tr>
            ))}
          </DataTable>
        </div>
      ) : null}

      {/* صندوق‌دار */}
      {tab === 'user' ? (
        <div className="card">
          <DataTable
            headers={[t('cashierCol'), t('invoicesCol'), t('revenueCol')]}
            empty={t('noReportData')}
            loading={loading}
            loadingLabel={t('loading')}
            rows={data?.byUser?.length ?? 0}
          >
            {(data?.byUser ?? []).map((row, index) => (
              <tr key={`${row.name}-${index}`} style={ROW}>
                <td style={TD}>{row.name}</td>
                <td style={NUM}>{fa(row.invoices)}</td>
                <td style={NUM}>{fa(row.total)}</td>
              </tr>
            ))}
          </DataTable>
        </div>
      ) : null}
    </AppShell>
  );
}

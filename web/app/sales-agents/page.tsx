'use client';

import { useCallback, useEffect, useState } from 'react';

import AppShell from '../../components/AppShell';
import { DataTable, NUM, ROW, TD, TOUCH } from '../../components/ui';
import { api } from '../../lib/api';
import { useI18n } from '../../lib/i18n-context';

type Stats = {
  activeAgents?: string | number;
  monthSales?: string | number;
  totalCommission?: string | number;
  unpaidCommission?: string | number;
};

type Agent = {
  id: string;
  agentNo: string;
  name: string;
  phone: string | null;
  territory: string | null;
  commissionRate: string | number;
  monthlyTarget: string | number;
  monthSales: string | number;
  customerCount: string | number;
  isActive: boolean;
};

type Commission = {
  id: string;
  agentNo: string;
  agentName: string;
  period: string;
  netSales: string | number;
  rate: string | number;
  amount: string | number;
  invoiceCount: number;
  status: string;
};

const TABS = [
  { key: 'agents', label: 'tabAgents' },
  { key: 'commissions', label: 'tabCommissions' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

export default function SalesAgentsPage() {
  const { t, locale } = useI18n();

  const [tab, setTab] = useState<TabKey>('agents');
  const [stats, setStats] = useState<Stats | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState({
    name: '',
    phone: '',
    territory: '',
    commissionRate: '5',
    monthlyTarget: '0',
  });

  const fa = useCallback(
    (value: unknown) => Number(value ?? 0).toLocaleString(locale),
    [locale],
  );

  const load = useCallback(async () => {
    try {
      const [s, list, comms] = await Promise.all([
        api<Stats>('/sales-agents/stats'),
        api<Agent[]>('/sales-agents'),
        api<Commission[]>('/sales-agents/commissions'),
      ]);

      setStats(s);
      setAgents(Array.isArray(list) ? list : []);
      setCommissions(Array.isArray(comms) ? comms : []);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('fetchError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit() {
    const rate = Number(form.commissionRate);
    if (!form.name.trim() || !Number.isFinite(rate)) return;

    setBusy(true);
    try {
      await api('/sales-agents', {
        method: 'POST',
        body: {
          name: form.name.trim(),
          phone: form.phone.trim() || undefined,
          territory: form.territory.trim() || undefined,
          commissionRate: rate,
          monthlyTarget: Number(form.monthlyTarget) || 0,
        },
      });

      setForm({ ...form, name: '', phone: '' });
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('saveError'));
    } finally {
      setBusy(false);
    }
  }

  async function calculate() {
    setBusy(true);
    try {
      const result = await api<{ count: number; total: number }>(
        '/sales-agents/commissions/calculate',
        { method: 'POST', body: {} },
      );

      setMessage(
        `${t('commissionCalculated')}: ${fa(result.count)} — ${fa(result.total)}`,
      );
      setTab('commissions');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('actionError'));
    } finally {
      setBusy(false);
    }
  }

  async function markPaid(id: string) {
    setBusy(true);
    try {
      await api(`/sales-agents/commissions/${id}/pay`, {
        method: 'PATCH',
        body: {},
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('actionError'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell
      title={t('agentsTitle')}
      subtitle={t('agentsSubtitle')}
      actions={
        <button type="button" className="btn-sm" onClick={() => void load()}>
          {t('refresh')}
        </button>
      }
    >
      {error ? <div className="error">{error}</div> : null}
      {message ? (
        <div
          className="card"
          style={{ borderInlineStart: '4px solid var(--success)' }}
        >
          {message}
        </div>
      ) : null}

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon">🧑‍💼</div>
          <div className="stat-label">{t('statActiveAgents')}</div>
          <div className="stat-value">{fa(stats?.activeAgents)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">💰</div>
          <div className="stat-label">{t('statAgentSales')}</div>
          <div className="stat-value">{fa(stats?.monthSales)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">📊</div>
          <div className="stat-label">{t('statTotalCommission')}</div>
          <div className="stat-value">{fa(stats?.totalCommission)}</div>
        </div>
        <div className="stat-card" style={{ borderTop: '3px solid var(--warning)' }}>
          <div className="stat-icon">⏳</div>
          <div className="stat-label">{t('statUnpaidCommission')}</div>
          <div className="stat-value">{fa(stats?.unpaidCommission)}</div>
        </div>
      </div>

      <div
        className="card"
        style={{
          margin: '18px 0',
          display: 'flex',
          gap: 10,
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <button
          type="button"
          style={TOUCH}
          disabled={busy}
          onClick={() => void calculate()}
        >
          ⚙️ {t('calcCommission')}
        </button>

        <button
          type="button"
          className={showForm ? 'ghost' : ''}
          style={{ ...TOUCH, marginInlineStart: 'auto' }}
          onClick={() => setShowForm((v) => !v)}
        >
          {showForm ? t('cancel') : `+ ${t('newAgent')}`}
        </button>
      </div>

      {showForm ? (
        <div className="card" style={{ marginBottom: 18 }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
              gap: 12,
            }}
          >
            {(
              [
                ['name', t('name'), 'text'],
                ['phone', t('phone'), 'text'],
                ['territory', t('territory'), 'text'],
                ['commissionRate', t('commissionRate'), 'number'],
                ['monthlyTarget', t('monthlyTarget'), 'number'],
              ] as const
            ).map(([key, label, type]) => (
              <label key={key}>
                <div className="muted" style={{ marginBottom: 4 }}>
                  {label}
                </div>
                <input
                  type={type}
                  value={form[key]}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                  style={{ ...TOUCH, width: '100%' }}
                />
              </label>
            ))}
          </div>

          <button
            type="button"
            style={{ ...TOUCH, marginTop: 14 }}
            disabled={busy || !form.name.trim()}
            onClick={() => void submit()}
          >
            {t('save')}
          </button>
        </div>
      ) : null}

      <div className="lang-pills" style={{ marginBottom: 18 }}>
        {TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`lang-pill${tab === item.key ? ' active' : ''}`}
            onClick={() => setTab(item.key)}
          >
            {t(item.label)}
          </button>
        ))}
      </div>

      {/* ویزیتورها */}
      {tab === 'agents' ? (
        <div className="card">
          <DataTable
            headers={[
              t('agentNo'),
              t('name'),
              t('territory'),
              t('commissionRate'),
              t('monthSales'),
              t('targetProgress'),
              t('customerCount'),
            ]}
            empty={t('noAgents')}
            loading={loading}
            loadingLabel={t('loading')}
            rows={agents.length}
          >
            {agents.map((agent) => {
              const target = Number(agent.monthlyTarget);
              const sales = Number(agent.monthSales);
              // هدف صفر یعنی هدفی تعیین نشده؛ درصد بی‌معناست.
              const pct = target > 0 ? Math.round((sales / target) * 100) : null;

              return (
                <tr key={agent.id} style={ROW}>
                  <td style={TD} className="muted">
                    {agent.agentNo}
                  </td>
                  <td style={TD}>
                    {agent.name}
                    {agent.phone ? (
                      <div className="muted" style={{ fontSize: 12 }} dir="ltr">
                        {agent.phone}
                      </div>
                    ) : null}
                  </td>
                  <td style={TD}>{agent.territory ?? '—'}</td>
                  <td style={NUM}>{fa(agent.commissionRate)}٪</td>
                  <td style={NUM}>{fa(sales)}</td>
                  <td style={TD}>
                    {pct === null ? (
                      <span className="muted">—</span>
                    ) : (
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                        }}
                      >
                        <div
                          style={{
                            flex: 1,
                            minWidth: 60,
                            height: 8,
                            borderRadius: 4,
                            background: 'var(--panel-strong)',
                            overflow: 'hidden',
                          }}
                        >
                          <div
                            style={{
                              width: `${Math.min(pct, 100)}%`,
                              height: '100%',
                              background:
                                pct >= 100
                                  ? 'var(--success)'
                                  : pct >= 60
                                    ? 'var(--warning)'
                                    : 'var(--danger)',
                            }}
                          />
                        </div>
                        <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {fa(pct)}٪
                        </span>
                      </div>
                    )}
                  </td>
                  <td style={NUM}>{fa(agent.customerCount)}</td>
                </tr>
              );
            })}
          </DataTable>
        </div>
      ) : null}

      {/* کمیسیون‌ها */}
      {tab === 'commissions' ? (
        <div className="card">
          <DataTable
            headers={[
              t('depPeriod'),
              t('name'),
              t('netSales'),
              t('commissionRate'),
              t('commissionAmount'),
              t('agentInvoices'),
              t('status'),
              t('actions'),
            ]}
            empty={t('noCommissions')}
            loading={loading}
            loadingLabel={t('loading')}
            rows={commissions.length}
          >
            {commissions.map((row) => (
              <tr key={row.id} style={ROW}>
                <td style={TD} className="muted">
                  {String(row.period).slice(0, 7)}
                </td>
                <td style={TD}>
                  {row.agentName}
                  <div className="muted" style={{ fontSize: 12 }}>
                    {row.agentNo}
                  </div>
                </td>
                <td style={NUM}>{fa(row.netSales)}</td>
                <td style={NUM}>{fa(row.rate)}٪</td>
                <td style={{ ...NUM, fontWeight: 700 }}>{fa(row.amount)}</td>
                <td style={NUM}>{fa(row.invoiceCount)}</td>
                <td
                  style={{
                    ...TD,
                    color:
                      row.status === 'PAID'
                        ? 'var(--success)'
                        : row.status === 'CANCELLED'
                          ? 'var(--text-dim)'
                          : 'var(--warning)',
                  }}
                >
                  {t(`acStatus${row.status}`)}
                </td>
                <td style={TD}>
                  {['CALCULATED', 'APPROVED'].includes(row.status) ? (
                    <button
                      type="button"
                      style={TOUCH}
                      disabled={busy}
                      onClick={() => void markPaid(row.id)}
                    >
                      {t('markCommissionPaid')}
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </DataTable>
        </div>
      ) : null}
    </AppShell>
  );
}

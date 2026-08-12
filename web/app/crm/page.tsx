'use client';

import { useCallback, useEffect, useState } from 'react';

import AppShell from '../../components/AppShell';
import { DataTable, NUM, ROW, TD, TOUCH } from '../../components/ui';
import { api } from '../../lib/api';
import { useI18n } from '../../lib/i18n-context';

type Stats = {
  openLeads?: string | number;
  openOpportunities?: string | number;
  pipelineValue?: string | number;
  dueFollowUps?: string | number;
  winRate?: string | number;
};

type Lead = {
  id: string;
  leadNo: string;
  name: string;
  company: string | null;
  phone: string | null;
  source: string;
  status: string;
  score: number;
  interactionCount: string | number;
  lastContact: string | null;
};

type Opportunity = {
  id: string;
  oppNo: string;
  title: string;
  customerName: string | null;
  amount: string | number;
  probability: number;
  weightedAmount: string | number;
  stage: string;
  expectedCloseDate: string | null;
  lostReason: string | null;
};

type Interaction = {
  id: string;
  type: string;
  subject: string;
  leadName: string | null;
  oppTitle: string | null;
  occurredAt: string;
  followUpAt: string | null;
  followUpDone: boolean;
};

type FunnelRow = {
  stage: string;
  count: string | number;
  amount: string | number;
  weightedAmount: string | number;
};

const TABS = [
  { key: 'leads', label: 'tabLeads' },
  { key: 'opportunities', label: 'tabOpportunities' },
  { key: 'interactions', label: 'tabInteractions' },
  { key: 'funnel', label: 'tabFunnel' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

const SOURCES = [
  'AD', 'REFERRAL', 'INBOUND', 'EXHIBITION', 'WEBSITE', 'COLD_CALL', 'OTHER',
] as const;

const STAGES = [
  'PROSPECT', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST',
] as const;

const TYPES = ['CALL', 'MEETING', 'EMAIL', 'SMS', 'VISIT', 'NOTE', 'OTHER'] as const;

/** رنگ مرحله: هرچه به بستن نزدیک‌تر، گرم‌تر؛ برد سبز و باخت قرمز. */
const STAGE_COLOR: Record<string, string> = {
  PROSPECT: 'var(--text-dim)',
  QUALIFIED: 'var(--accent)',
  PROPOSAL: 'var(--warning)',
  NEGOTIATION: 'var(--primary-2)',
  WON: 'var(--success)',
  LOST: 'var(--danger)',
};

export default function CrmPage() {
  const { t, locale } = useI18n();

  const [tab, setTab] = useState<TabKey>('leads');
  const [stats, setStats] = useState<Stats | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [opps, setOpps] = useState<Opportunity[]>([]);
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [funnel, setFunnel] = useState<FunnelRow[]>([]);
  const [dueOnly, setDueOnly] = useState(false);
  const [showLeadForm, setShowLeadForm] = useState(false);
  const [showOppForm, setShowOppForm] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const [leadForm, setLeadForm] = useState({
    name: '',
    company: '',
    phone: '',
    source: 'OTHER' as (typeof SOURCES)[number],
    score: '50',
  });

  const [oppForm, setOppForm] = useState({
    title: '',
    amount: '',
    probability: '50',
    expectedCloseDate: '',
  });

  const fa = useCallback(
    (value: unknown) => Number(value ?? 0).toLocaleString(locale),
    [locale],
  );

  const load = useCallback(async () => {
    try {
      const [s, l, o, i, f] = await Promise.all([
        api<Stats>('/crm/stats'),
        api<Lead[]>('/crm/leads'),
        api<Opportunity[]>('/crm/opportunities'),
        api<Interaction[]>(`/crm/interactions${dueOnly ? '?due=1' : ''}`),
        api<FunnelRow[]>('/crm/funnel'),
      ]);

      setStats(s);
      setLeads(Array.isArray(l) ? l : []);
      setOpps(Array.isArray(o) ? o : []);
      setInteractions(Array.isArray(i) ? i : []);
      setFunnel(Array.isArray(f) ? f : []);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('fetchError'));
    } finally {
      setLoading(false);
    }
  }, [dueOnly, t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      await fn();
      await load();
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('actionError'));
    } finally {
      setBusy(false);
    }
  }

  function createLead() {
    if (!leadForm.name.trim()) return;

    void act(async () => {
      await api('/crm/leads', {
        method: 'POST',
        body: {
          name: leadForm.name.trim(),
          company: leadForm.company.trim() || undefined,
          phone: leadForm.phone.trim() || undefined,
          source: leadForm.source,
          score: Number(leadForm.score) || 0,
        },
      });
      setLeadForm({ ...leadForm, name: '', company: '', phone: '' });
      setShowLeadForm(false);
    });
  }

  function createOpp() {
    if (!oppForm.title.trim()) return;

    void act(async () => {
      await api('/crm/opportunities', {
        method: 'POST',
        body: {
          title: oppForm.title.trim(),
          amount: Number(oppForm.amount) || 0,
          probability: Number(oppForm.probability) || 50,
          expectedCloseDate: oppForm.expectedCloseDate || undefined,
        },
      });
      setOppForm({ ...oppForm, title: '', amount: '' });
      setShowOppForm(false);
    });
  }

  /**
   * تغییر مرحله.  برای باخت، دلیل پرسیده می‌شود — سرور هم بدون دلیل رد
   * می‌کند، ولی پرسیدن اینجا از رفت‌وبرگشت بی‌فایده جلوگیری می‌کند.
   */
  function moveStage(opp: Opportunity, stage: string) {
    let lostReason: string | undefined;

    if (stage === 'LOST') {
      const answer = window.prompt(t('lostReason'));
      if (!answer?.trim()) return;
      lostReason = answer.trim();
    }

    void act(() =>
      api(`/crm/opportunities/${opp.id}/stage`, {
        method: 'PATCH',
        body: { stage, lostReason },
      }),
    );
  }

  return (
    <AppShell
      title={t('crmTitle')}
      subtitle={t('crmSubtitle')}
      actions={
        <button type="button" className="btn-sm" onClick={() => void load()}>
          {t('refresh')}
        </button>
      }
    >
      {error ? <div className="error">{error}</div> : null}

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon">🎯</div>
          <div className="stat-label">{t('statOpenLeads')}</div>
          <div className="stat-value">{fa(stats?.openLeads)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">💼</div>
          <div className="stat-label">{t('statOpenOpps')}</div>
          <div className="stat-value">{fa(stats?.openOpportunities)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">📈</div>
          <div className="stat-label">{t('statPipeline')}</div>
          <div className="stat-value">{fa(stats?.pipelineValue)}</div>
        </div>
        <div
          className="stat-card"
          style={{
            borderTop: `3px solid ${
              Number(stats?.dueFollowUps ?? 0) > 0
                ? 'var(--danger)'
                : 'var(--success)'
            }`,
          }}
        >
          <div className="stat-icon">⏰</div>
          <div className="stat-label">{t('dueFollowUps')}</div>
          <div className="stat-value">{fa(stats?.dueFollowUps)}</div>
        </div>
      </div>

      <div className="lang-pills" style={{ margin: '18px 0' }}>
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

      {/* ---------------- سرنخ‌ها ---------------- */}
      {tab === 'leads' ? (
        <>
          <div className="card" style={{ marginBottom: 18 }}>
            <button
              type="button"
              className={showLeadForm ? 'ghost' : ''}
              style={TOUCH}
              onClick={() => setShowLeadForm((v) => !v)}
            >
              {showLeadForm ? t('cancel') : `+ ${t('newLead')}`}
            </button>

            {showLeadForm ? (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                  gap: 12,
                  marginTop: 14,
                }}
              >
                <label>
                  <div className="muted" style={{ marginBottom: 4 }}>
                    {t('name')}
                  </div>
                  <input
                    value={leadForm.name}
                    onChange={(e) =>
                      setLeadForm({ ...leadForm, name: e.target.value })
                    }
                    style={{ ...TOUCH, width: '100%' }}
                  />
                </label>

                <label>
                  <div className="muted" style={{ marginBottom: 4 }}>
                    {t('customer')}
                  </div>
                  <input
                    value={leadForm.company}
                    onChange={(e) =>
                      setLeadForm({ ...leadForm, company: e.target.value })
                    }
                    style={{ ...TOUCH, width: '100%' }}
                  />
                </label>

                <label>
                  <div className="muted" style={{ marginBottom: 4 }}>
                    {t('phone')}
                  </div>
                  <input
                    value={leadForm.phone}
                    onChange={(e) =>
                      setLeadForm({ ...leadForm, phone: e.target.value })
                    }
                    style={{ ...TOUCH, width: '100%' }}
                  />
                </label>

                <label>
                  <div className="muted" style={{ marginBottom: 4 }}>
                    {t('leadSource')}
                  </div>
                  <select
                    value={leadForm.source}
                    onChange={(e) =>
                      setLeadForm({
                        ...leadForm,
                        source: e.target.value as (typeof SOURCES)[number],
                      })
                    }
                    style={{ ...TOUCH, width: '100%' }}
                  >
                    {SOURCES.map((src) => (
                      <option key={src} value={src}>
                        {t(`src${src}`)}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <div className="muted" style={{ marginBottom: 4 }}>
                    {t('leadScore')}
                  </div>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={leadForm.score}
                    onChange={(e) =>
                      setLeadForm({ ...leadForm, score: e.target.value })
                    }
                    style={{ ...TOUCH, width: '100%' }}
                  />
                </label>

                <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                  <button
                    type="button"
                    style={{ ...TOUCH, width: '100%' }}
                    disabled={busy || !leadForm.name.trim()}
                    onClick={createLead}
                  >
                    {t('save')}
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          <div className="card">
            <DataTable
              headers={[
                t('leadNo'),
                t('name'),
                t('phone'),
                t('leadSource'),
                t('leadScore'),
                t('status'),
                t('lastContact'),
                t('actions'),
              ]}
              empty={t('noLeads')}
              loading={loading}
              loadingLabel={t('loading')}
              rows={leads.length}
            >
              {leads.map((lead) => (
                <tr key={lead.id} style={ROW}>
                  <td style={TD} className="muted">
                    {lead.leadNo}
                  </td>
                  <td style={TD}>
                    {lead.name}
                    {lead.company ? (
                      <div className="muted" style={{ fontSize: 12 }}>
                        {lead.company}
                      </div>
                    ) : null}
                  </td>
                  <td style={TD} dir="ltr" className="muted">
                    {lead.phone ?? '—'}
                  </td>
                  <td style={TD}>{t(`src${lead.source}`)}</td>
                  <td
                    style={{
                      ...NUM,
                      color:
                        lead.score >= 70
                          ? 'var(--success)'
                          : lead.score >= 40
                            ? 'var(--warning)'
                            : 'var(--text-dim)',
                      fontWeight: 700,
                    }}
                  >
                    {fa(lead.score)}
                  </td>
                  <td style={TD}>{t(`ldStatus${lead.status}`)}</td>
                  <td style={TD} className="muted">
                    {lead.lastContact
                      ? new Date(lead.lastContact).toLocaleDateString(locale)
                      : '—'}
                  </td>
                  <td style={TD}>
                    {['NEW', 'CONTACTED', 'QUALIFIED'].includes(lead.status) ? (
                      <button
                        type="button"
                        style={TOUCH}
                        disabled={busy}
                        onClick={() =>
                          void act(() =>
                            api(`/crm/leads/${lead.id}/convert`, {
                              method: 'POST',
                              body: {},
                            }),
                          )
                        }
                      >
                        {t('convertLead')}
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </DataTable>
          </div>
        </>
      ) : null}

      {/* ---------------- فرصت‌ها ---------------- */}
      {tab === 'opportunities' ? (
        <>
          <div className="card" style={{ marginBottom: 18 }}>
            <button
              type="button"
              className={showOppForm ? 'ghost' : ''}
              style={TOUCH}
              onClick={() => setShowOppForm((v) => !v)}
            >
              {showOppForm ? t('cancel') : `+ ${t('newOpportunity')}`}
            </button>

            {showOppForm ? (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                  gap: 12,
                  marginTop: 14,
                }}
              >
                <label>
                  <div className="muted" style={{ marginBottom: 4 }}>
                    {t('oppTitle')}
                  </div>
                  <input
                    value={oppForm.title}
                    onChange={(e) =>
                      setOppForm({ ...oppForm, title: e.target.value })
                    }
                    style={{ ...TOUCH, width: '100%' }}
                  />
                </label>

                <label>
                  <div className="muted" style={{ marginBottom: 4 }}>
                    {t('colAmount')}
                  </div>
                  <input
                    type="number"
                    min={0}
                    value={oppForm.amount}
                    onChange={(e) =>
                      setOppForm({ ...oppForm, amount: e.target.value })
                    }
                    style={{ ...TOUCH, width: '100%' }}
                  />
                </label>

                <label>
                  <div className="muted" style={{ marginBottom: 4 }}>
                    {t('probability')}
                  </div>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={oppForm.probability}
                    onChange={(e) =>
                      setOppForm({ ...oppForm, probability: e.target.value })
                    }
                    style={{ ...TOUCH, width: '100%' }}
                  />
                </label>

                <label>
                  <div className="muted" style={{ marginBottom: 4 }}>
                    {t('expectedClose')}
                  </div>
                  <input
                    type="date"
                    value={oppForm.expectedCloseDate}
                    onChange={(e) =>
                      setOppForm({
                        ...oppForm,
                        expectedCloseDate: e.target.value,
                      })
                    }
                    style={{ ...TOUCH, width: '100%' }}
                  />
                </label>

                <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                  <button
                    type="button"
                    style={{ ...TOUCH, width: '100%' }}
                    disabled={busy || !oppForm.title.trim()}
                    onClick={createOpp}
                  >
                    {t('save')}
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          <div className="card">
            <DataTable
              headers={[
                t('oppNo'),
                t('oppTitle'),
                t('colAmount'),
                t('probability'),
                t('weightedAmount'),
                t('expectedClose'),
                t('moveStage'),
              ]}
              empty={t('noOpportunities')}
              loading={loading}
              loadingLabel={t('loading')}
              rows={opps.length}
            >
              {opps.map((opp) => {
                const closed = ['WON', 'LOST'].includes(opp.stage);

                return (
                  <tr key={opp.id} style={ROW}>
                    <td style={TD} className="muted">
                      {opp.oppNo}
                    </td>
                    <td style={TD}>
                      {opp.title}
                      {opp.customerName?.trim() ? (
                        <div className="muted" style={{ fontSize: 12 }}>
                          {opp.customerName}
                        </div>
                      ) : null}
                      {opp.lostReason ? (
                        <div
                          style={{ fontSize: 12, color: 'var(--danger)' }}
                        >
                          {opp.lostReason}
                        </div>
                      ) : null}
                    </td>
                    <td style={NUM}>{fa(opp.amount)}</td>
                    <td style={NUM}>{fa(opp.probability)}٪</td>
                    <td style={{ ...NUM, fontWeight: 700 }}>
                      {fa(opp.weightedAmount)}
                    </td>
                    <td style={TD} className="muted">
                      {opp.expectedCloseDate
                        ? new Date(opp.expectedCloseDate).toLocaleDateString(
                            locale,
                          )
                        : '—'}
                    </td>
                    <td style={TD}>
                      {closed ? (
                        <span
                          style={{
                            color: STAGE_COLOR[opp.stage],
                            fontWeight: 700,
                          }}
                        >
                          {t(`opStage${opp.stage}`)}
                        </span>
                      ) : (
                        <select
                          value={opp.stage}
                          disabled={busy}
                          onChange={(e) => moveStage(opp, e.target.value)}
                          style={{
                            ...TOUCH,
                            minWidth: 150,
                            color: STAGE_COLOR[opp.stage],
                            fontWeight: 600,
                          }}
                        >
                          {STAGES.map((stage) => (
                            <option key={stage} value={stage}>
                              {t(`opStage${stage}`)}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                  </tr>
                );
              })}
            </DataTable>
          </div>
        </>
      ) : null}

      {/* ---------------- تعامل‌ها ---------------- */}
      {tab === 'interactions' ? (
        <>
          <div className="card" style={{ marginBottom: 18 }}>
            <button
              type="button"
              className={dueOnly ? '' : 'ghost'}
              style={TOUCH}
              onClick={() => setDueOnly((v) => !v)}
            >
              {t('onlyDue')}
            </button>
          </div>

          <div className="card">
            <DataTable
              headers={[
                t('interactionType'),
                t('subject'),
                t('linkedTo'),
                t('date'),
                t('followUp'),
                t('actions'),
              ]}
              empty={t('noInteractions')}
              loading={loading}
              loadingLabel={t('loading')}
              rows={interactions.length}
            >
              {interactions.map((item) => {
                const due =
                  !item.followUpDone &&
                  item.followUpAt !== null &&
                  new Date(item.followUpAt) <= new Date();

                return (
                  <tr key={item.id} style={ROW}>
                    <td style={TD}>{t(`it${item.type}`)}</td>
                    <td style={TD}>{item.subject}</td>
                    <td style={TD} className="muted">
                      {item.leadName ?? item.oppTitle ?? '—'}
                    </td>
                    <td style={TD} className="muted">
                      {new Date(item.occurredAt).toLocaleDateString(locale)}
                    </td>
                    <td
                      style={{
                        ...TD,
                        color: due ? 'var(--danger)' : 'var(--text-dim)',
                        fontWeight: due ? 700 : 400,
                      }}
                    >
                      {item.followUpAt
                        ? new Date(item.followUpAt).toLocaleDateString(locale)
                        : '—'}
                    </td>
                    <td style={TD}>
                      {item.followUpAt && !item.followUpDone ? (
                        <button
                          type="button"
                          style={TOUCH}
                          disabled={busy}
                          onClick={() =>
                            void act(() =>
                              api(`/crm/interactions/${item.id}/done`, {
                                method: 'PATCH',
                                body: {},
                              }),
                            )
                          }
                        >
                          {t('markDone')}
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </DataTable>
          </div>
        </>
      ) : null}

      {/* ---------------- قیف ---------------- */}
      {tab === 'funnel' ? (
        <div className="card">
          {/* قیف به‌صورت نوار افقی: طول هر نوار نسبت به بزرگ‌ترین مرحله. */}
          {(() => {
            const byStage = new Map(funnel.map((row) => [row.stage, row]));
            const max = Math.max(
              ...funnel.map((row) => Number(row.amount)),
              1,
            );

            return STAGES.map((stage) => {
              const row = byStage.get(stage);
              const amount = Number(row?.amount ?? 0);
              const width = (amount / max) * 100;

              return (
                <div key={stage} style={{ marginBottom: 14 }}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginBottom: 6,
                      fontSize: 14,
                    }}
                  >
                    <span style={{ color: STAGE_COLOR[stage], fontWeight: 700 }}>
                      {t(`opStage${stage}`)}
                      <span className="muted" style={{ fontWeight: 400 }}>
                        {' '}
                        ({fa(row?.count ?? 0)})
                      </span>
                    </span>
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {fa(amount)}
                      {row ? (
                        <span className="muted">
                          {' '}
                          — {fa(row.weightedAmount)}
                        </span>
                      ) : null}
                    </span>
                  </div>
                  <div
                    style={{
                      height: 14,
                      borderRadius: 7,
                      background: 'var(--panel-strong)',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        width: `${width}%`,
                        height: '100%',
                        background: STAGE_COLOR[stage],
                        transition: 'width 200ms ease',
                      }}
                    />
                  </div>
                </div>
              );
            });
          })()}

          <div
            style={{
              marginTop: 18,
              padding: 14,
              borderRadius: 'var(--radius)',
              background: 'var(--panel-strong)',
              display: 'flex',
              justifyContent: 'space-between',
              fontWeight: 700,
            }}
          >
            <span>{t('statWinRate')}</span>
            <span
              style={{
                fontVariantNumeric: 'tabular-nums',
                color:
                  Number(stats?.winRate ?? 0) >= 50
                    ? 'var(--success)'
                    : 'var(--warning)',
              }}
            >
              {fa(stats?.winRate)}٪
            </span>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}

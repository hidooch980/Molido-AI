'use client';

import { useCallback, useEffect, useState } from 'react';

import AppShell from '../../components/AppShell';
import { Icon } from '../../components/icons';
import { DataTable, NUM, ROW, TD, TOUCH } from '../../components/ui';
import { api } from '../../lib/api';
import { useI18n } from '../../lib/i18n-context';

type Segments = {
  ALL: number;
  LOYAL: number;
  AT_RISK: number;
  NEW: number;
  INACTIVE: number;
  noPhone: number;
};

type Rule = { id: string; name: string; kind: string; value: string | number };

type Campaign = {
  id: string;
  name: string;
  segment: string;
  ruleName: string;
  sentCount: number;
  failedCount: number;
  codeCount: string | number;
  redeemedCount: string | number;
  createdAt: string;
};

const SEGMENT_KEYS = ['LOYAL', 'AT_RISK', 'NEW', 'INACTIVE', 'ALL'] as const;

type SegmentKey = (typeof SEGMENT_KEYS)[number];

const SEGMENT_LABEL: Record<SegmentKey, string> = {
  LOYAL: 'segLoyal',
  AT_RISK: 'segAtRisk',
  NEW: 'segNew',
  INACTIVE: 'segInactive',
  ALL: 'segAll',
};

const SEGMENT_ICON: Record<SegmentKey, 'agent' | 'clock' | 'user' | 'inbox' | 'users'> = {
  LOYAL: 'agent',
  AT_RISK: 'clock',
  NEW: 'user',
  INACTIVE: 'inbox',
  ALL: 'users',
};

export default function LoyaltyPage() {
  const { t, locale } = useI18n();

  const [segments, setSegments] = useState<Segments | null>(null);
  const [rules, setRules] = useState<Rule[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [form, setForm] = useState({
    name: '',
    ruleId: '',
    segment: 'AT_RISK' as SegmentKey,
    messageTemplate: '{name} عزیز، کد تخفیف اختصاصی شما: {code}',
    expiresAt: '',
  });

  const fa = useCallback(
    (value: unknown) => Number(value ?? 0).toLocaleString(locale),
    [locale],
  );

  const load = useCallback(async () => {
    try {
      const [seg, ruleList, campaignList] = await Promise.all([
        api<Segments>('/loyalty/segments'),
        api<Rule[]>('/pricing/rules'),
        api<Campaign[]>('/loyalty/campaigns'),
      ]);

      setSegments(seg);
      setRules(Array.isArray(ruleList) ? ruleList : []);
      setCampaigns(Array.isArray(campaignList) ? campaignList : []);
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

  async function send() {
    if (!form.name.trim() || !form.ruleId) return;

    setBusy(true);
    setError('');
    setMessage('');

    try {
      const result = await api<{ issued: number; sent: number; failed: number }>(
        '/loyalty/campaigns',
        {
          method: 'POST',
          body: {
            name: form.name.trim(),
            ruleId: form.ruleId,
            segment: form.segment,
            messageTemplate: form.messageTemplate,
            expiresAt: form.expiresAt || undefined,
          },
        },
      );

      setMessage(
        `${fa(result.issued)} ${t('codesIssued')} — ${fa(result.sent)} ${t('smsSent')}`,
      );
      setForm({ ...form, name: '' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('saveError'));
    } finally {
      setBusy(false);
    }
  }

  const target = segments?.[form.segment] ?? 0;

  return (
    <AppShell
      title={t('loyaltyTitle')}
      subtitle={t('loyaltySubtitle')}
      actions={
        <button type="button" className="btn-sm" onClick={() => void load()}>
          {t('refresh')}
        </button>
      }
    >
      {error ? <div className="error">{error}</div> : null}
      {message ? (
        <div className="card" style={{ borderInlineStart: '4px solid var(--success)' }}>
          {message}
        </div>
      ) : null}

      {/* بخش‌ها: پیش از ارسال باید معلوم باشد چند نفر هدف‌اند. */}
      <div className="stats-grid">
        {SEGMENT_KEYS.map((key) => (
          <button
            key={key}
            type="button"
            className="stat-card"
            onClick={() => setForm({ ...form, segment: key })}
            style={{
              textAlign: 'start',
              cursor: 'pointer',
              borderTop:
                form.segment === key ? '3px solid var(--primary)' : undefined,
            }}
          >
            <div className="stat-icon">
              <Icon name={SEGMENT_ICON[key]} size={22} />
            </div>
            <div className="stat-label">{t(SEGMENT_LABEL[key])}</div>
            <div className="stat-value">{fa(segments?.[key])}</div>
          </button>
        ))}
      </div>

      {segments && segments.noPhone > 0 ? (
        <p className="muted">
          <Icon name="alert" size={14} /> {fa(segments.noPhone)} {t('noPhoneWarn')}
        </p>
      ) : null}

      <div className="card">
        <h3>{t('newCampaign')}</h3>
        <p className="muted">{t('campaignHint')}</p>

        <div className="form-row">
          <input
            style={TOUCH}
            placeholder={t('campaignName')}
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          />

          <select
            style={TOUCH}
            value={form.ruleId}
            onChange={(event) => setForm({ ...form, ruleId: event.target.value })}
          >
            <option value="">{t('selectRule')}</option>
            {rules.map((rule) => (
              <option key={rule.id} value={rule.id}>
                {rule.name}
              </option>
            ))}
          </select>

          <select
            style={TOUCH}
            value={form.segment}
            onChange={(event) =>
              setForm({ ...form, segment: event.target.value as SegmentKey })
            }
          >
            {SEGMENT_KEYS.map((key) => (
              <option key={key} value={key}>
                {t(SEGMENT_LABEL[key])} ({fa(segments?.[key])})
              </option>
            ))}
          </select>

          <input
            style={TOUCH}
            type="date"
            aria-label={t('expiresAt')}
            value={form.expiresAt}
            onChange={(event) => setForm({ ...form, expiresAt: event.target.value })}
          />
        </div>

        <textarea
          rows={3}
          style={{ ...TOUCH, width: '100%', marginTop: 10 }}
          value={form.messageTemplate}
          onChange={(event) =>
            setForm({ ...form, messageTemplate: event.target.value })
          }
        />
        <p className="muted">{t('templateHint')}</p>

        {/* تعداد گیرنده کنار دکمه نوشته می‌شود: ارسال پیامک هزینه دارد و
            برگشت‌پذیر نیست، پس عدد باید پیش از کلیک دیده شود. */}
        <button
          type="button"
          className="btn"
          disabled={busy || !form.name.trim() || !form.ruleId || target === 0}
          onClick={() => void send()}
          style={{ marginTop: 10 }}
        >
          <Icon name="inbox" size={18} />{' '}
          {busy ? t('sending') : `${t('sendTo')} ${fa(target)} ${t('customersWord')}`}
        </button>
      </div>

      <DataTable
        headers={[
          t('campaignName'),
          t('scope'),
          t('codesIssued'),
          t('smsSent'),
          t('redeemed'),
        ]}
        empty={t('noData')}
        loading={loading}
        loadingLabel={t('loading')}
        rows={campaigns.length}
      >
        {campaigns.map((campaign) => {
          const issued = Number(campaign.codeCount);
          const redeemed = Number(campaign.redeemedCount);

          return (
            <tr key={campaign.id} style={ROW}>
              <td style={TD}>
                {campaign.name}
                <div className="muted">{campaign.ruleName}</div>
              </td>
              <td style={TD}>
                {t(SEGMENT_LABEL[campaign.segment as SegmentKey] ?? 'segAll')}
              </td>
              <td style={{ ...TD, ...NUM }}>{fa(issued)}</td>
              <td style={{ ...TD, ...NUM }}>
                {fa(campaign.sentCount)}
                {campaign.failedCount > 0 ? (
                  <span style={{ color: 'var(--danger)' }}>
                    {' '}
                    (−{fa(campaign.failedCount)})
                  </span>
                ) : null}
              </td>
              <td style={{ ...TD, ...NUM }}>
                {fa(redeemed)}
                {/* نرخ استفاده، تنها عددی است که می‌گوید کارزار جواب داده
                    یا فقط هزینهٔ پیامک بوده. */}
                {issued > 0 ? (
                  <span className="muted">
                    {' '}
                    ({fa(Math.round((redeemed / issued) * 100))}٪)
                  </span>
                ) : null}
              </td>
            </tr>
          );
        })}
      </DataTable>
    </AppShell>
  );
}

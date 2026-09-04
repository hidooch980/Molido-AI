'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import AppShell from '../../components/AppShell';
import { Grid, type Column } from '../../components/Grid';
import { Icon } from '../../components/icons';
import { StatCard, Tabs, TOUCH } from '../../components/ui';
import { api } from '../../lib/api';
import { useI18n } from '../../lib/i18n-context';
import { amountOnly } from '../../lib/money';

/**
 * عملیات: خطاها، سلامت نصب، و پشتیبانی از راه دور.
 *
 * سه چیزی که تا امروز فقط با SSH زدن به سرور معلوم می‌شدند.  بدون این
 * صفحه، تنها راه فهمیدن اینکه چیزی خراب شده، تماس مشتری است — و تا آن
 * تماس، هفته‌ها می‌گذرد.
 */

type ErrorGroup = {
  id: string;
  message: string;
  statusCode: number;
  path: string | null;
  method: string | null;
  count: number;
  status: string;
  firstSeenAt: string;
  lastSeenAt: string;
  lastStack: string | null;
};

type Health = {
  severity: 'OK' | 'WARN' | 'CRITICAL';
  metrics: Record<string, number>;
};

type Snapshot = {
  id: string;
  severity: string;
  metrics: Record<string, number>;
  createdAt: string;
};

type Support = {
  id: string;
  code: string;
  scope: string;
  reason: string | null;
  expiresAt: string;
  revokedAt: string | null;
  isActive: boolean;
  createdAt: string;
};

const TABS = [
  { key: 'errors' as const, label: 'tabErrors' },
  { key: 'health' as const, label: 'tabHealth' },
  { key: 'support' as const, label: 'tabSupport' },
];

type Tab = (typeof TABS)[number]['key'];

const SEVERITY_COLOR: Record<string, string> = {
  OK: 'var(--success)',
  WARN: 'var(--warning)',
  CRITICAL: 'var(--danger)',
};

/** اندازه‌هایی که خرابی‌شان دیر معلوم می‌شود. */
const METRICS = [
  { key: 'negativeStock', label: 'metricNegativeStock', bad: true },
  { key: 'staleShifts', label: 'metricStaleShifts', bad: true },
  { key: 'errors24h', label: 'metricErrors24h', bad: true },
  { key: 'taxFailed', label: 'metricTaxFailed', bad: true },
  { key: 'staleParked', label: 'metricStaleParked', bad: false },
  { key: 'sales24h', label: 'metricSales24h', bad: false },
];

export default function OperationsPage() {
  const { t, locale } = useI18n();

  const [tab, setTab] = useState<Tab>('errors');
  const [errors, setErrors] = useState<ErrorGroup[]>([]);
  const [errorStatus, setErrorStatus] = useState('OPEN');
  const [health, setHealth] = useState<Health | null>(null);
  const [history, setHistory] = useState<Snapshot[]>([]);
  const [support, setSupport] = useState<Support[]>([]);
  const [granted, setGranted] = useState<{ code: string; expiresAt: string } | null>(null);
  const [minutes, setMinutes] = useState('30');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const fa = useCallback((value: unknown) => amountOnly(value), []);

  const load = useCallback(async () => {
    try {
      const [errs, hist, sup] = await Promise.all([
        api<ErrorGroup[]>(`/operations/errors?status=${errorStatus}`),
        api<Snapshot[]>('/operations/health'),
        api<Support[]>('/operations/support').catch(() => []),
      ]);

      setErrors(Array.isArray(errs) ? errs : []);
      setHistory(Array.isArray(hist) ? hist : []);
      setSupport(Array.isArray(sup) ? sup : []);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('fetchError'));
    } finally {
      setLoading(false);
    }
  }, [errorStatus, t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function refreshHealth() {
    setBusy(true);
    setError('');

    try {
      setHealth(await api<Health>('/operations/health', { method: 'POST' }));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('fetchError'));
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(id: string, status: string) {
    try {
      await api(`/operations/errors/${id}`, { method: 'PATCH', body: { status } });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('saveError'));
    }
  }

  async function grant() {
    setBusy(true);
    setError('');

    try {
      const result = await api<{ code: string; expiresAt: string }>(
        '/operations/support',
        { method: 'POST', body: { minutes: Number(minutes), reason: reason.trim() } },
      );

      setGranted(result);
      setReason('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('saveError'));
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    try {
      await api(`/operations/support/${id}/revoke`, { method: 'PATCH' });
      setGranted(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('saveError'));
    }
  }

  const latest = history[0];

  const errorColumns = useMemo<Array<Column<ErrorGroup>>>(
    () => [
      {
        key: 'count',
        label: t('errorCount'),
        numeric: true,
        total: true,
        width: 70,
        value: (row) => Number(row.count),
        render: (row) => <strong>{fa(row.count)}</strong>,
      },
      {
        key: 'message',
        label: t('errorMessage'),
        value: (row) => row.message,
        render: (row) => (
          <span title={row.lastStack ?? undefined}>{row.message}</span>
        ),
      },
      {
        key: 'path',
        label: t('errorPath'),
        value: (row) => `${row.method ?? ''} ${row.path ?? ''}`.trim(),
      },
      {
        key: 'statusCode',
        label: t('status'),
        numeric: true,
        value: (row) => Number(row.statusCode),
      },
      {
        key: 'lastSeenAt',
        label: t('errorLastSeen'),
        value: (row) => row.lastSeenAt,
        render: (row) => new Date(row.lastSeenAt).toLocaleString(locale),
      },
    ],
    [t, locale, fa],
  );

  return (
    <AppShell
      title={t('operationsTitle')}
      subtitle={t('operationsSubtitle')}
      actions={
        <button type="button" className="btn-sm" onClick={() => void load()}>
          {t('refresh')}
        </button>
      }
    >
      {error ? <div className="error">{error}</div> : null}

      {/* شدت کلی، همیشه بالا: اگر بحرانی باشد باید پیش از هر چیز دیگری
          دیده شود. */}
      {latest ? (
        <div
          className="card"
          style={{
            borderInlineStart: `4px solid ${SEVERITY_COLOR[latest.severity] ?? 'var(--border)'}`,
          }}
        >
          <strong style={{ color: SEVERITY_COLOR[latest.severity] }}>
            {t(`severity_${latest.severity}`)}
          </strong>
          <span className="muted">
            {' — '}
            {new Date(latest.createdAt).toLocaleString(locale)}
          </span>
        </div>
      ) : null}

      <Tabs tabs={TABS} active={tab} onChange={setTab} t={t} />

      {/* ---------- خطاها ---------- */}
      {tab === 'errors' ? (
        <>
          <div className="card filters">
            <select
              style={{ ...TOUCH, minHeight: 38 }}
              value={errorStatus}
              onChange={(event) => setErrorStatus(event.target.value)}
              aria-label={t('status')}
            >
              <option value="OPEN">{t('errOpen')}</option>
              <option value="ACKNOWLEDGED">{t('errAck')}</option>
              <option value="RESOLVED">{t('errResolved')}</option>
              <option value="IGNORED">{t('errIgnored')}</option>
              <option value="ALL">{t('allStatuses')}</option>
            </select>
          </div>

          <Grid
            rows={errors}
            columns={errorColumns}
            rowKey={(row) => row.id}
            loading={loading}
            empty={t('noErrors')}
            exportName="errors"
            t={t}
            rowActions={(row) => (
              <div style={{ display: 'flex', gap: 4 }}>
                <button
                  type="button"
                  className="btn-sm ghost"
                  onClick={() => void setStatus(row.id, 'RESOLVED')}
                  title={t('errResolved')}
                >
                  <Icon name="check" size={15} />
                </button>
                <button
                  type="button"
                  className="btn-sm ghost"
                  onClick={() => void setStatus(row.id, 'IGNORED')}
                  title={t('errIgnored')}
                >
                  ✕
                </button>
              </div>
            )}
          />
        </>
      ) : null}

      {/* ---------- سلامت ---------- */}
      {tab === 'health' ? (
        <>
          <div className="card">
            <button type="button" className="btn" disabled={busy} onClick={() => void refreshHealth()}>
              <Icon name="refresh" size={17} /> {t('checkHealth')}
            </button>
            <p className="muted" style={{ marginTop: 8 }}>
              {t('healthHint')}
            </p>
          </div>

          {(health ?? latest) ? (
            <div className="stats-grid">
              {METRICS.map((metric) => {
                const value = (health ?? latest)?.metrics?.[metric.key] ?? 0;

                return (
                  <StatCard
                    key={metric.key}
                    icon={metric.bad ? 'alert' : 'chart'}
                    label={t(metric.label)}
                    value={fa(value)}
                    accent={
                      metric.bad && value > 0 ? 'var(--danger)' : undefined
                    }
                  />
                );
              })}
            </div>
          ) : null}
        </>
      ) : null}

      {/* ---------- پشتیبانی ---------- */}
      {tab === 'support' ? (
        <>
          <div className="card">
            <h3>{t('grantSupport')}</h3>
            <p className="muted">{t('grantSupportHint')}</p>

            <div className="form-row" style={{ marginTop: 12 }}>
              <select
                style={TOUCH}
                value={minutes}
                onChange={(event) => setMinutes(event.target.value)}
                aria-label={t('duration')}
              >
                <option value="15">۱۵ {t('minutes')}</option>
                <option value="30">۳۰ {t('minutes')}</option>
                <option value="60">۶۰ {t('minutes')}</option>
                <option value="240">۲۴۰ {t('minutes')}</option>
              </select>

              <input
                style={{ ...TOUCH, flex: 1 }}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder={t('supportReason')}
              />
            </div>

            <button type="button" className="btn" disabled={busy} onClick={() => void grant()}>
              {t('createSupportCode')}
            </button>

            {/* کد بزرگ و با فاصله: کاربر آن را تلفنی می‌خواند. */}
            {granted ? (
              <div className="support-code">
                <code>{granted.code}</code>
                <div className="muted">
                  {t('validUntil')} {new Date(granted.expiresAt).toLocaleTimeString(locale)}
                </div>
              </div>
            ) : null}
          </div>

          <div className="card">
            <h3>{t('supportSessions')}</h3>
            {support.length === 0 ? (
              <p className="muted">{t('noData')}</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>{t('code')}</th>
                      <th>{t('scope')}</th>
                      <th>{t('validUntil')}</th>
                      <th>{t('status')}</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {support.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <code dir="ltr">{item.code}</code>
                        </td>
                        <td>{t(`scope_${item.scope}`)}</td>
                        <td>{new Date(item.expiresAt).toLocaleString(locale)}</td>
                        <td>
                          <span
                            className="badge"
                            style={{
                              color: item.isActive
                                ? 'var(--success)'
                                : 'var(--text-dim)',
                            }}
                          >
                            {item.isActive ? t('sessionActive') : t('sessionClosed')}
                          </span>
                        </td>
                        <td>
                          {item.isActive ? (
                            <button
                              type="button"
                              className="btn-sm ghost"
                              onClick={() => void revoke(item.id)}
                            >
                              {t('revoke')}
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
        </>
      ) : null}
    </AppShell>
  );
}

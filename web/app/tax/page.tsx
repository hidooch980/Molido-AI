'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import AppShell from '../../components/AppShell';
import { Grid, type Column } from '../../components/Grid';
import { Icon } from '../../components/icons';
import { StatCard, TOUCH } from '../../components/ui';
import { api } from '../../lib/api';
import { useI18n } from '../../lib/i18n-context';
import { amountOnly, loadCurrency } from '../../lib/money';

/**
 * سامانهٔ مؤدیان.
 *
 * دو نگرانی این صفحه، به همین ترتیب:
 *
 *   ۱. چه فاکتورهایی **هنوز در صف نیستند** — چیزی که در صف نیست هرگز به
 *      سازمان نمی‌رسد، و این تنها اشتباهی است که ماه‌ها بعد کشف می‌شود.
 *   ۲. چه چیزی رد شده و چرا.
 *
 * حالت آزمایشی به‌عمد برجسته نشان داده می‌شود: کاربری که فکر کند دارد
 * ارسال می‌کند ولی نکند، بدترین حالت ممکن است.
 */

type Settings = {
  memoryId: string | null;
  economicCode: string | null;
  apiBaseUrl: string;
  privateKeyPem: string | null;
  clientId: string | null;
  isEnabled: boolean;
  isSandbox: boolean;
};

type Stats = {
  queued: number;
  sent: number;
  confirmed: number;
  failed: number;
  notQueued: number;
};

type TaxInvoice = {
  id: string;
  taxId: string;
  status: string;
  referenceNo: string | null;
  attempts: number;
  lastError: string | null;
  sentAt: string | null;
  invoiceNo: string;
  total: string | number;
  saleDate: string;
};

const STATUS_KEY: Record<string, string> = {
  QUEUED: 'taxQueued',
  SENDING: 'taxSending',
  SENT: 'taxSent',
  CONFIRMED: 'taxConfirmed',
  REJECTED: 'taxRejected',
  FAILED: 'taxFailed',
};

const STATUS_COLOR: Record<string, string> = {
  QUEUED: 'var(--text-dim)',
  SENDING: 'var(--primary)',
  SENT: 'var(--primary)',
  CONFIRMED: 'var(--success)',
  REJECTED: 'var(--danger)',
  FAILED: 'var(--danger)',
};

export default function TaxPage() {
  const { t, locale } = useI18n();

  const [settings, setSettings] = useState<Settings | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [invoices, setInvoices] = useState<TaxInvoice[]>([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [form, setForm] = useState<Partial<Settings>>({});

  const fa = useCallback((value: unknown) => amountOnly(value), []);

  const load = useCallback(async () => {
    try {
      const query = filter ? `?status=${filter}` : '';
      const [s, st, list] = await Promise.all([
        api<Settings>('/tax/settings'),
        api<Stats>('/tax/stats'),
        api<TaxInvoice[]>(`/tax/invoices${query}`),
      ]);

      setSettings(s);
      setForm(s);
      setStats(st);
      setInvoices(Array.isArray(list) ? list : []);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('fetchError'));
    } finally {
      setLoading(false);
    }
  }, [filter, t]);

  useEffect(() => {
    void loadCurrency();
    void load();
  }, [load]);

  async function act(key: string, path: string, body: unknown = {}) {
    setBusy(key);
    setError('');
    setMessage('');

    try {
      const result = await api<Record<string, number>>(path, {
        method: 'POST',
        body,
      });

      setMessage(
        Object.entries(result)
          .filter(([, value]) => typeof value === 'number')
          .map(([name, value]) => `${t(`taxRes_${name}`)}: ${fa(value)}`)
          .join(' — ') || t('saved'),
      );

      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('saveError'));
    } finally {
      setBusy('');
    }
  }

  const columns = useMemo<Array<Column<TaxInvoice>>>(
    () => [
      {
        key: 'invoiceNo',
        label: t('colNumber'),
        value: (row) => row.invoiceNo,
        render: (row) => <strong>{row.invoiceNo}</strong>,
      },
      {
        key: 'taxId',
        label: t('taxIdCol'),
        value: (row) => row.taxId,
        render: (row) => (
          <code dir="ltr" style={{ fontSize: 11.5, letterSpacing: 0.4 }}>
            {row.taxId}
          </code>
        ),
      },
      {
        key: 'saleDate',
        label: t('date'),
        value: (row) => row.saleDate,
        render: (row) => new Date(row.saleDate).toLocaleDateString(locale),
      },
      {
        key: 'total',
        label: t('total'),
        numeric: true,
        total: true,
        value: (row) => Number(row.total),
        render: (row) => fa(row.total),
      },
      {
        key: 'status',
        label: t('status'),
        value: (row) => t(STATUS_KEY[row.status] ?? 'unknown'),
        render: (row) => (
          <span className="badge" style={{ color: STATUS_COLOR[row.status] }}>
            {t(STATUS_KEY[row.status] ?? 'unknown')}
          </span>
        ),
      },
      {
        key: 'referenceNo',
        label: t('referenceNo'),
        optional: true,
        value: (row) => row.referenceNo ?? '—',
      },
      {
        key: 'lastError',
        label: t('lastError'),
        value: (row) => row.lastError ?? '',
        render: (row) =>
          row.lastError ? (
            <span style={{ color: 'var(--danger)' }}>{row.lastError}</span>
          ) : (
            '—'
          ),
      },
    ],
    [t, locale, fa],
  );

  return (
    <AppShell
      title={t('taxTitle')}
      subtitle={t('taxSubtitle')}
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

      {/* حالت آزمایشی باید داد بزند.  کاربری که فکر کند دارد ارسال می‌کند
          ولی نکند، ماه‌ها بعد با جریمه روبه‌رو می‌شود. */}
      {settings?.isEnabled && settings.isSandbox ? (
        <div
          className="card"
          style={{ borderInlineStart: '4px solid var(--warning)' }}
        >
          <strong>
            <Icon name="alert" size={16} /> {t('sandboxOn')}
          </strong>
          <p className="muted" style={{ margin: '6px 0 0' }}>
            {t('sandboxHint')}
          </p>
        </div>
      ) : null}

      {!settings?.isEnabled ? (
        <div className="card" style={{ borderInlineStart: '4px solid var(--text-dim)' }}>
          {t('taxDisabled')}
        </div>
      ) : null}

      <div className="stats-grid">
        {/* «در صف نیست» اول می‌آید چون خطرناک‌ترین عدد است. */}
        <StatCard
          icon="alert"
          label={t('taxNotQueued')}
          value={fa(stats?.notQueued)}
          accent={(stats?.notQueued ?? 0) > 0 ? 'var(--warning)' : undefined}
        />
        <StatCard icon="clock" label={t('taxQueued')} value={fa(stats?.queued)} />
        <StatCard icon="check" label={t('taxSent')} value={fa(stats?.sent)} />
        <StatCard
          icon="return"
          label={t('taxFailed')}
          value={fa(stats?.failed)}
          accent={(stats?.failed ?? 0) > 0 ? 'var(--danger)' : undefined}
        />
      </div>

      {/* ---------- تنظیمات ---------- */}
      <div className="card">
        <h3>{t('taxSettings')}</h3>
        <p className="muted">{t('taxSettingsHint')}</p>

        <div className="form-row">
          <input
            style={TOUCH}
            placeholder={t('memoryId')}
            value={form.memoryId ?? ''}
            onChange={(e) => setForm({ ...form, memoryId: e.target.value })}
            dir="ltr"
            maxLength={6}
          />
          <input
            style={TOUCH}
            placeholder={t('economicCode')}
            value={form.economicCode ?? ''}
            onChange={(e) => setForm({ ...form, economicCode: e.target.value })}
            dir="ltr"
          />
          <input
            style={TOUCH}
            placeholder={t('apiBaseUrl')}
            value={form.apiBaseUrl ?? ''}
            onChange={(e) => setForm({ ...form, apiBaseUrl: e.target.value })}
            dir="ltr"
          />
        </div>

        <textarea
          rows={3}
          style={{ ...TOUCH, width: '100%', marginTop: 10, direction: 'ltr' }}
          placeholder={t('privateKey')}
          value={form.privateKeyPem ?? ''}
          onChange={(e) => setForm({ ...form, privateKeyPem: e.target.value })}
        />
        <p className="muted">{t('privateKeyHint')}</p>

        <div className="form-row" style={{ marginTop: 10 }}>
          <label className="check">
            <input
              type="checkbox"
              checked={form.isEnabled ?? false}
              onChange={(e) => setForm({ ...form, isEnabled: e.target.checked })}
            />
            {t('taxEnabled')}
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={form.isSandbox ?? true}
              onChange={(e) => setForm({ ...form, isSandbox: e.target.checked })}
            />
            {t('taxSandbox')}
          </label>
        </div>

        <button
          type="button"
          className="btn"
          style={{ marginTop: 10 }}
          disabled={busy === 'settings'}
          onClick={() => void act('settings', '/tax/settings', form)}
        >
          {t('save')}
        </button>
      </div>

      {/* ---------- عملیات صف ---------- */}
      <div className="card filters">
        <button
          type="button"
          className="btn-sm"
          disabled={busy !== '' || !settings?.isEnabled}
          onClick={() => void act('pending', '/tax/enqueue-pending', { limit: 200 })}
        >
          <Icon name="plus" size={15} /> {t('taxEnqueuePending')}
        </button>

        <button
          type="button"
          className="btn-sm"
          disabled={busy !== '' || !settings?.isEnabled}
          onClick={() => void act('process', '/tax/process', { limit: 50 })}
        >
          <Icon name="refresh" size={15} /> {t('taxProcess')}
        </button>

        <select
          style={{ ...TOUCH, minHeight: 36, marginInlineStart: 'auto' }}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          aria-label={t('status')}
        >
          <option value="">{t('allStatuses')}</option>
          {Object.entries(STATUS_KEY).map(([code, key]) => (
            <option key={code} value={code}>
              {t(key)}
            </option>
          ))}
        </select>
      </div>

      <Grid
        rows={invoices}
        columns={columns}
        rowKey={(row) => row.id}
        loading={loading}
        empty={t('noData')}
        exportName="tax-invoices"
        t={t}
      />
    </AppShell>
  );
}

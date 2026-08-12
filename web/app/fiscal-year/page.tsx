'use client';

import { useCallback, useEffect, useState } from 'react';

import AppShell from '../../components/AppShell';
import { DataTable, NUM, ROW, TD, TOUCH } from '../../components/ui';
import { api } from '../../lib/api';
import { useI18n } from '../../lib/i18n-context';

type FiscalYear = {
  id: string;
  code: string;
  startsOn: string;
  endsOn: string;
  status: string;
  closedAt: string | null;
  note: string | null;
};

export default function FiscalYearPage() {
  const { t, locale } = useI18n();

  const [years, setYears] = useState<FiscalYear[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState({
    code: String(new Date().getFullYear() + 1),
    startsOn: '',
    endsOn: '',
  });

  const fa = useCallback(
    (value: unknown) => Number(value ?? 0).toLocaleString(locale),
    [locale],
  );

  const load = useCallback(async () => {
    try {
      const list = await api<FiscalYear[]>('/ledger/fiscal-years');
      setYears(Array.isArray(list) ? list : []);
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
    if (!form.code.trim() || !form.startsOn || !form.endsOn) return;

    setBusy(true);
    try {
      await api('/ledger/fiscal-years', {
        method: 'POST',
        body: {
          code: form.code.trim(),
          startsOn: form.startsOn,
          endsOn: form.endsOn,
        },
      });

      setShowForm(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('saveError'));
    } finally {
      setBusy(false);
    }
  }

  async function close(year: FiscalYear) {
    if (!window.confirm(t('confirmCloseYear'))) return;

    setBusy(true);
    try {
      const result = await api<{
        netIncome?: number;
        entryNo?: string | null;
        closedAccounts?: number;
      }>(`/ledger/fiscal-years/${year.id}/close`, {
        method: 'PATCH',
        body: {},
      });

      // مبلغ سود و شماره سند صریح نشان داده می‌شود: بستن سال کاری است که
      // یک بار انجام می‌شود و کاربر باید بتواند نتیجه‌اش را همان‌جا ببیند.
      setMessage(
        `${t('yearClosed')} — ${t('netIncome')}: ${fa(result?.netIncome)}` +
          (result?.entryNo ? ` — ${t('entryNo')}: ${result.entryNo}` : '') +
          (result?.closedAccounts
            ? ` — ${t('closedAccounts')}: ${fa(result.closedAccounts)}`
            : ''),
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('actionError'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell
      title={t('fiscalTitle')}
      subtitle={t('fiscalSubtitle')}
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

      <div className="card" style={{ margin: '18px 0' }}>
        <button
          type="button"
          className={showForm ? 'ghost' : ''}
          style={TOUCH}
          onClick={() => setShowForm((v) => !v)}
        >
          {showForm ? t('cancel') : `+ ${t('newFiscalYear')}`}
        </button>

        {showForm ? (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
              gap: 12,
              marginTop: 14,
            }}
          >
            <label>
              <div className="muted" style={{ marginBottom: 4 }}>
                {t('fyCode')}
              </div>
              <input
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                style={{ ...TOUCH, width: '100%' }}
              />
            </label>

            <label>
              <div className="muted" style={{ marginBottom: 4 }}>
                {t('startsOn')}
              </div>
              <input
                type="date"
                value={form.startsOn}
                onChange={(e) => setForm({ ...form, startsOn: e.target.value })}
                style={{ ...TOUCH, width: '100%' }}
              />
            </label>

            <label>
              <div className="muted" style={{ marginBottom: 4 }}>
                {t('endsOn')}
              </div>
              <input
                type="date"
                value={form.endsOn}
                onChange={(e) => setForm({ ...form, endsOn: e.target.value })}
                style={{ ...TOUCH, width: '100%' }}
              />
            </label>

            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button
                type="button"
                style={{ ...TOUCH, width: '100%' }}
                disabled={busy || !form.startsOn || !form.endsOn}
                onClick={() => void submit()}
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
            t('fyCode'),
            t('startsOn'),
            t('endsOn'),
            t('status'),
            t('actions'),
          ]}
          empty={t('noFiscalYears')}
          loading={loading}
          loadingLabel={t('loading')}
          rows={years.length}
        >
          {years.map((year) => (
            <tr key={year.id} style={ROW}>
              <td style={{ ...TD, fontWeight: 700 }}>{year.code}</td>
              <td style={TD} className="muted">
                {new Date(year.startsOn).toLocaleDateString(locale)}
              </td>
              <td style={TD} className="muted">
                {new Date(year.endsOn).toLocaleDateString(locale)}
              </td>
              <td
                style={{
                  ...TD,
                  color:
                    year.status === 'OPEN'
                      ? 'var(--success)'
                      : 'var(--text-dim)',
                  fontWeight: 600,
                }}
              >
                {t(`fyStatus${year.status}`)}
                {year.closedAt ? (
                  <div className="muted" style={{ fontSize: 12 }}>
                    {new Date(year.closedAt).toLocaleDateString(locale)}
                  </div>
                ) : null}
              </td>
              <td style={TD}>
                {year.status === 'OPEN' ? (
                  <button
                    type="button"
                    style={TOUCH}
                    disabled={busy}
                    onClick={() => void close(year)}
                  >
                    🔒 {t('closeYear')}
                  </button>
                ) : null}
              </td>
            </tr>
          ))}
        </DataTable>
      </div>

      {/* هشدار: بستن سال برگشت‌پذیر نیست و کاربر باید پیامدش را بداند. */}
      <div
        className="card"
        style={{
          marginTop: 18,
          borderInlineStart: '4px solid var(--warning)',
          fontSize: 14,
        }}
      >
        <strong>{t('closeYear')}</strong>
        <ul style={{ marginTop: 8, paddingInlineStart: 20, lineHeight: 2 }}>
          <li>{t('confirmCloseYear')}</li>
        </ul>
      </div>
    </AppShell>
  );
}

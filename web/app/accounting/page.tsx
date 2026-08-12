'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import AppShell from '../../components/AppShell';
import { api } from '../../lib/api';
import { useI18n } from '../../lib/i18n-context';

type AccountRow = {
  code: string;
  name: string;
  type: string;
  debit: number;
  credit: number;
  balanceDebit: number;
  balanceCredit: number;
  amount?: number;
};

type TrialBalance = { accounts: AccountRow[] };

type IncomeStatement = {
  revenue: AccountRow[];
  expense: AccountRow[];
  totalRevenue: number;
  totalExpense: number;
  netIncome: number;
};

type BalanceSheet = {
  assets: AccountRow[];
  liabilities: AccountRow[];
  equity: AccountRow[];
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
};

type Entry = {
  id: string;
  entryNo: string;
  entryDate: string;
  description: string;
  sourceType: string | null;
  status: string;
};

const TABS = [
  { key: 'trial', label: 'tabTrialBalance' },
  { key: 'income', label: 'tabIncome' },
  { key: 'balance', label: 'tabBalanceSheet' },
  { key: 'journal', label: 'tabJournal' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

const TOUCH: React.CSSProperties = {
  minHeight: 44,
  minWidth: 44,
  padding: '10px 16px',
};

const TH: React.CSSProperties = { padding: 8, textAlign: 'right' };
const TD: React.CSSProperties = { padding: 8 };
/** ستون عددی: هم‌ترازی ارقام خواندن ترازنامه را بسیار آسان‌تر می‌کند. */
const NUM: React.CSSProperties = {
  padding: 8,
  fontVariantNumeric: 'tabular-nums',
};

export default function AccountingPage() {
  const { t, locale } = useI18n();

  const [tab, setTab] = useState<TabKey>('trial');
  const [trial, setTrial] = useState<TrialBalance | null>(null);
  const [income, setIncome] = useState<IncomeStatement | null>(null);
  const [sheet, setSheet] = useState<BalanceSheet | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
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
    setBusy(true);
    try {
      const [tb, is, bs, js] = await Promise.all([
        api<TrialBalance>(`/ledger/trial-balance${range}`),
        api<IncomeStatement>(`/ledger/income-statement${range}`),
        api<BalanceSheet>(`/ledger/balance-sheet${to ? `?asOf=${to}` : ''}`),
        api<Entry[]>(`/ledger/entries${range || '?'}${range ? '&' : ''}limit=100`),
      ]);

      setTrial(tb);
      setIncome(is);
      setSheet(bs);
      setEntries(Array.isArray(js) ? js : []);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('fetchError'));
    } finally {
      setBusy(false);
      setLoading(false);
    }
  }, [range, to, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const trialTotals = useMemo(() => {
    const rows = trial?.accounts ?? [];
    return rows.reduce(
      (acc, row) => ({
        debit: acc.debit + Number(row.balanceDebit ?? 0),
        credit: acc.credit + Number(row.balanceCredit ?? 0),
      }),
      { debit: 0, credit: 0 },
    );
  }, [trial]);

  // اختلاف کمتر از یک ریال گرد کردن است، نه ناترازی واقعی.
  const isBalanced = Math.abs(trialTotals.debit - trialTotals.credit) < 1;

  async function reverse(id: string) {
    if (!window.confirm(t('confirmReverse'))) return;

    setBusy(true);
    try {
      await api(`/ledger/entries/${id}/reverse`, { method: 'POST', body: {} });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('actionError'));
    } finally {
      setBusy(false);
    }
  }

  function section(title: string, rows: AccountRow[], total: number) {
    return (
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>{title}</div>
        <div className="table-wrap">
          <table>
            <tbody>
              {rows.map((row) => (
                <tr key={row.code} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={TD} className="muted">
                    {row.code}
                  </td>
                  <td style={TD}>{row.name}</td>
                  <td style={NUM}>{fa(row.amount ?? 0)}</td>
                </tr>
              ))}
              <tr style={{ borderTop: '2px solid var(--primary)', fontWeight: 700 }}>
                <td style={TD} colSpan={2}>
                  {t('totals')}
                </td>
                <td style={NUM}>{fa(total)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <AppShell
      title={t('accountingTitle')}
      subtitle={t('accountingSubtitle')}
      actions={
        <button type="button" className="btn-sm" onClick={() => void load()}>
          {t('refresh')}
        </button>
      }
    >
      {error ? <div className="error">{error}</div> : null}

      {/* بازهٔ تاریخ */}
      <div
        className="card"
        style={{
          display: 'flex',
          gap: 10,
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <label className="muted">{t('fromDate')}</label>
        <input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          style={TOUCH}
        />
        <label className="muted">{t('toDate')}</label>
        <input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          style={TOUCH}
        />
        <button
          type="button"
          style={TOUCH}
          disabled={busy}
          onClick={() => void load()}
        >
          {t('apply')}
        </button>

        {/* وضعیت تراز همیشه دیده می‌شود، نه فقط در تب تراز آزمایشی:
            ناترازی یعنی چیزی در ثبت اسناد شکسته و باید فوراً دیده شود. */}
        <span
          style={{
            marginInlineStart: 'auto',
            fontWeight: 700,
            color: isBalanced ? 'var(--success)' : 'var(--danger)',
          }}
        >
          {isBalanced ? `✓ ${t('balanced')}` : `✕ ${t('notBalanced')}`}
        </span>
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

      {loading ? (
        <div className="card">
          <p className="muted">{t('loading')}</p>
        </div>
      ) : null}

      {/* تراز آزمایشی */}
      {!loading && tab === 'trial' ? (
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead>
                <tr style={{ color: 'var(--text-dim)' }}>
                  <th style={TH}>{t('accountCode')}</th>
                  <th style={TH}>{t('accountName')}</th>
                  <th style={TH}>{t('debit')}</th>
                  <th style={TH}>{t('credit')}</th>
                  <th style={TH}>{t('balanceDebit')}</th>
                  <th style={TH}>{t('balanceCredit')}</th>
                </tr>
              </thead>
              <tbody>
                {(trial?.accounts ?? []).map((row) => (
                  <tr key={row.code} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={TD} className="muted">
                      {row.code}
                    </td>
                    <td style={TD}>{row.name}</td>
                    <td style={NUM}>{fa(row.debit)}</td>
                    <td style={NUM}>{fa(row.credit)}</td>
                    <td style={NUM}>{fa(row.balanceDebit)}</td>
                    <td style={NUM}>{fa(row.balanceCredit)}</td>
                  </tr>
                ))}
                <tr
                  style={{
                    borderTop: '2px solid var(--primary)',
                    fontWeight: 700,
                  }}
                >
                  <td style={TD} colSpan={4}>
                    {t('totals')}
                  </td>
                  <td style={NUM}>{fa(trialTotals.debit)}</td>
                  <td style={NUM}>{fa(trialTotals.credit)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {/* سود و زیان */}
      {!loading && tab === 'income' ? (
        <div className="card">
          {section(t('revenue'), income?.revenue ?? [], income?.totalRevenue ?? 0)}
          {section(t('expense'), income?.expense ?? [], income?.totalExpense ?? 0)}

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              padding: 14,
              borderRadius: 'var(--radius)',
              background: 'var(--panel-strong)',
              fontWeight: 800,
              fontSize: 18,
              color:
                (income?.netIncome ?? 0) >= 0
                  ? 'var(--success)'
                  : 'var(--danger)',
            }}
          >
            <span>
              {t('netIncome')} —{' '}
              {(income?.netIncome ?? 0) >= 0 ? t('profit') : t('loss')}
            </span>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>
              {fa(income?.netIncome)}
            </span>
          </div>
        </div>
      ) : null}

      {/* ترازنامه */}
      {!loading && tab === 'balance' ? (
        <div className="card">
          {section(t('assets'), sheet?.assets ?? [], sheet?.totalAssets ?? 0)}
          {section(
            t('liabilities'),
            sheet?.liabilities ?? [],
            sheet?.totalLiabilities ?? 0,
          )}
          {section(t('equity'), sheet?.equity ?? [], sheet?.totalEquity ?? 0)}

          {/* معادلهٔ حسابداری: دارایی = بدهی + سرمایه.  اگر برقرار نباشد،
              ترازنامه قابل اتکا نیست و باید همان‌جا دیده شود. */}
          {(() => {
            const left = Number(sheet?.totalAssets ?? 0);
            const right =
              Number(sheet?.totalLiabilities ?? 0) +
              Number(sheet?.totalEquity ?? 0);
            const ok = Math.abs(left - right) < 1;

            return (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: 14,
                  borderRadius: 'var(--radius)',
                  background: 'var(--panel-strong)',
                  fontWeight: 800,
                  color: ok ? 'var(--success)' : 'var(--danger)',
                }}
              >
                <span>
                  {t('totalAssets')} = {t('totalLiabilities')} +{' '}
                  {t('totalEquity')}
                </span>
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {fa(left)} {ok ? '=' : '≠'} {fa(right)}
                </span>
              </div>
            );
          })()}
        </div>
      ) : null}

      {/* دفتر روزنامه */}
      {!loading && tab === 'journal' ? (
        <div className="card">
          {entries.length === 0 ? (
            <p className="muted">{t('noEntries')}</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr style={{ color: 'var(--text-dim)' }}>
                    <th style={TH}>{t('entryNo')}</th>
                    <th style={TH}>{t('date')}</th>
                    <th style={TH}>{t('entryDescription')}</th>
                    <th style={TH}>{t('sourceType')}</th>
                    <th style={TH}>{t('status')}</th>
                    <th style={TH}>{t('actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => (
                    <tr
                      key={entry.id}
                      style={{ borderTop: '1px solid var(--border)' }}
                    >
                      <td style={TD}>{entry.entryNo}</td>
                      <td style={TD} className="muted">
                        {new Date(entry.entryDate).toLocaleDateString(locale)}
                      </td>
                      <td style={TD}>{entry.description}</td>
                      <td style={TD} className="muted">
                        {entry.sourceType ?? '—'}
                      </td>
                      <td
                        style={{
                          ...TD,
                          color:
                            entry.status === 'POSTED'
                              ? 'var(--success)'
                              : entry.status === 'REVERSED'
                                ? 'var(--danger)'
                                : 'var(--text-dim)',
                        }}
                      >
                        {t(`status${entry.status}`)}
                      </td>
                      <td style={TD}>
                        {entry.status === 'POSTED' ? (
                          <button
                            type="button"
                            className="ghost"
                            style={TOUCH}
                            disabled={busy}
                            onClick={() => void reverse(entry.id)}
                          >
                            {t('reverseEntry')}
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
      ) : null}
    </AppShell>
  );
}

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
  statusColor,
} from '../../components/ui';
import { api } from '../../lib/api';
import { useI18n } from '../../lib/i18n-context';

type Account = {
  id: string;
  name: string;
  type: string;
  bankName: string | null;
  accountNo: string | null;
  balance: string | number;
  isActive: boolean;
};

type Transaction = {
  id: string;
  accountId: string;
  type: string;
  amount: string | number;
  reference: string | null;
  description: string | null;
  date: string;
  accountName?: string | null;
};

type Cheque = {
  id: string;
  chequeNo: string;
  bankName: string | null;
  dueDate: string | null;
  amount: string | number;
  type: string;
  status: string;
  ownerName: string | null;
};

const TABS = [
  { key: 'accounts', label: 'tabAccounts' },
  { key: 'transactions', label: 'tabTransactions' },
  { key: 'cheques', label: 'tabCheques' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

export default function TreasuryPage() {
  const { t, locale } = useI18n();

  const [tab, setTab] = useState<TabKey>('accounts');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [cheques, setCheques] = useState<Cheque[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const fa = useCallback(
    (value: unknown) => Number(value ?? 0).toLocaleString(locale),
    [locale],
  );

  const list = <T,>(value: unknown): T[] =>
    Array.isArray(value) ? (value as T[]) : [];

  const load = useCallback(async () => {
    try {
      const [a, tx, ch] = await Promise.all([
        api<Account[]>('/treasury/accounts'),
        api<Transaction[]>('/treasury/transactions'),
        api<Cheque[]>('/cheques'),
      ]);

      setAccounts(list<Account>(a));
      setTransactions(list<Transaction>(tx));
      setCheques(list<Cheque>(ch));
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

  const stats = useMemo(() => {
    // فقط چک‌های در جریان شمرده می‌شوند؛ چک وصول‌شده دیگر تعهدی نیست.
    const open = cheques.filter((item) => item.status === 'PENDING');

    return {
      accounts: accounts.length,
      balance: accounts.reduce((sum, item) => sum + Number(item.balance ?? 0), 0),
      chequesIn: open
        .filter((item) => item.type === 'IN')
        .reduce((sum, item) => sum + Number(item.amount ?? 0), 0),
      chequesOut: open
        .filter((item) => item.type === 'OUT')
        .reduce((sum, item) => sum + Number(item.amount ?? 0), 0),
    };
  }, [accounts, cheques]);

  async function setChequeStatus(id: string, status: string) {
    setBusy(true);
    try {
      await api(`/cheques/${id}/status`, { method: 'PATCH', body: { status } });
      await load();
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('actionError'));
    } finally {
      setBusy(false);
    }
  }

  const accountName = useCallback(
    (id: string) => accounts.find((item) => item.id === id)?.name ?? '—',
    [accounts],
  );

  return (
    <AppShell
      title={t('treasuryTitle')}
      subtitle={t('treasurySubtitle')}
      actions={
        <button type="button" className="btn-sm" onClick={() => void load()}>
          {t('refresh')}
        </button>
      }
    >
      {error ? <div className="error">{error}</div> : null}

      <div className="stats-grid">
        <StatCard icon="bank" label={t('statAccounts')} value={fa(stats.accounts)} />
        <StatCard
          icon="money"
          label={t('statTotalBalance')}
          value={fa(stats.balance)}
        />
        <StatCard
          icon="trendUp"
          label={t('statChequesIn')}
          value={fa(stats.chequesIn)}
          accent="var(--success)"
        />
        <StatCard
          icon="trendDown"
          label={t('statChequesOut')}
          value={fa(stats.chequesOut)}
          accent="var(--danger)"
        />
      </div>

      <Tabs tabs={TABS} active={tab} onChange={setTab} t={t} />

      <div className="card">
        {tab === 'accounts' ? (
          <DataTable
            headers={[
              t('name'),
              t('accountType'),
              t('bankName'),
              t('accountNo'),
              t('balance'),
              t('status'),
            ]}
            empty={t('noAccounts')}
            loading={loading}
            loadingLabel={t('loading')}
            rows={accounts.length}
          >
            {accounts.map((row) => (
              <tr key={row.id} style={ROW}>
                <td style={TD}>{row.name}</td>
                <td style={TD} className="muted">
                  {row.type}
                </td>
                <td style={TD}>{row.bankName ?? '—'}</td>
                <td style={TD} className="muted">
                  {row.accountNo ?? '—'}
                </td>
                <td
                  style={{
                    ...NUM,
                    fontWeight: 700,
                    color:
                      Number(row.balance) < 0
                        ? 'var(--danger)'
                        : 'var(--success)',
                  }}
                >
                  {fa(row.balance)}
                </td>
                <td
                  style={{
                    ...TD,
                    color: row.isActive ? 'var(--success)' : 'var(--text-dim)',
                  }}
                >
                  {row.isActive ? t('active') : t('inactive')}
                </td>
              </tr>
            ))}
          </DataTable>
        ) : null}

        {tab === 'transactions' ? (
          <DataTable
            headers={[
              t('date'),
              t('accountName'),
              t('returnType'),
              t('colAmount'),
              t('reference'),
              t('entryDescription'),
            ]}
            empty={t('noTransactions')}
            loading={loading}
            loadingLabel={t('loading')}
            rows={transactions.length}
          >
            {transactions.map((row) => (
              <tr key={row.id} style={ROW}>
                <td style={TD} className="muted">
                  {new Date(row.date).toLocaleDateString(locale)}
                </td>
                <td style={TD}>
                  {row.accountName ?? accountName(row.accountId)}
                </td>
                <td
                  style={{
                    ...TD,
                    color:
                      row.type === 'IN' ? 'var(--success)' : 'var(--danger)',
                  }}
                >
                  {row.type === 'IN' ? t('txIN') : t('txOUT')}
                </td>
                <td style={NUM}>{fa(row.amount)}</td>
                <td style={TD} className="muted">
                  {row.reference ?? '—'}
                </td>
                <td style={TD}>{row.description ?? '—'}</td>
              </tr>
            ))}
          </DataTable>
        ) : null}

        {tab === 'cheques' ? (
          <DataTable
            headers={[
              t('chequeNo'),
              t('returnType'),
              t('ownerName'),
              t('bankName'),
              t('colAmount'),
              t('dueDate'),
              t('status'),
              t('actions'),
            ]}
            empty={t('noCheques')}
            loading={loading}
            loadingLabel={t('loading')}
            rows={cheques.length}
          >
            {cheques.map((row) => {
              // چکِ سررسیدگذشته‌ای که هنوز وصول نشده باید فوراً دیده شود.
              const overdue =
                row.status === 'PENDING' &&
                row.dueDate !== null &&
                new Date(row.dueDate) < new Date();

              return (
                <tr key={row.id} style={ROW}>
                  <td style={TD}>{row.chequeNo}</td>
                  <td
                    style={{
                      ...TD,
                      color:
                        row.type === 'IN' ? 'var(--success)' : 'var(--danger)',
                    }}
                  >
                    {row.type === 'IN' ? t('chequeIN') : t('chequeOUT')}
                  </td>
                  <td style={TD}>{row.ownerName ?? '—'}</td>
                  <td style={TD}>{row.bankName ?? '—'}</td>
                  <td style={NUM}>{fa(row.amount)}</td>
                  <td
                    style={{
                      ...TD,
                      color: overdue ? 'var(--danger)' : undefined,
                      fontWeight: overdue ? 700 : undefined,
                    }}
                  >
                    {row.dueDate
                      ? new Date(row.dueDate).toLocaleDateString(locale)
                      : '—'}
                  </td>
                  <td style={{ ...TD, color: statusColor(row.status) }}>
                    {t(`cStatus${row.status}`)}
                  </td>
                  <td style={{ ...TD, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {row.status === 'PENDING' ? (
                      <>
                        <button
                          type="button"
                          style={TOUCH}
                          disabled={busy}
                          onClick={() => void setChequeStatus(row.id, 'CLEARED')}
                        >
                          {t('markCleared')}
                        </button>
                        <button
                          type="button"
                          className="ghost"
                          style={TOUCH}
                          disabled={busy}
                          onClick={() => void setChequeStatus(row.id, 'BOUNCED')}
                        >
                          {t('markBounced')}
                        </button>
                      </>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </DataTable>
        ) : null}
      </div>
    </AppShell>
  );
}

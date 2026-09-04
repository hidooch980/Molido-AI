'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import Link from 'next/link';

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

type Purchase = {
  id: string;
  purchaseNo: string;
  status: string;
  total: string | number;
  createdAt: string;
  supplierName?: string | null;
  supplier?: { name?: string } | null;
};

type Supplier = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  isActive: boolean;
  purchaseCount?: string | number;
};

type Expense = {
  id: string;
  title: string;
  amount: string | number;
  status: string;
  note: string | null;
  createdAt: string;
};

const TABS = [
  { key: 'purchases', label: 'tabPurchases' },
  { key: 'suppliers', label: 'tabSuppliers' },
  { key: 'expenses', label: 'tabExpenses' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

export default function PurchasesPage() {
  const { t, locale } = useI18n();

  const [tab, setTab] = useState<TabKey>('purchases');
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
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
      const [p, s, e] = await Promise.all([
        api<Purchase[]>('/purchases'),
        api<Supplier[]>('/suppliers'),
        api<Expense[]>('/expenses'),
      ]);

      setPurchases(list<Purchase>(p));
      setSuppliers(list<Supplier>(s));
      setExpenses(list<Expense>(e));
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

  const stats = useMemo(
    () => ({
      suppliers: suppliers.length,
      purchases: purchases.length,
      // خریدهای لغوشده در ارزش خرید شمرده نمی‌شوند.
      purchaseValue: purchases
        .filter((item) => item.status !== 'CANCELLED')
        .reduce((sum, item) => sum + Number(item.total ?? 0), 0),
      expenses: expenses.reduce((sum, item) => sum + Number(item.amount ?? 0), 0),
    }),
    [purchases, suppliers, expenses],
  );

  async function receive(id: string) {
    setBusy(true);
    try {
      await api(`/purchases/${id}/receive`, { method: 'PATCH', body: {} });
      await load();
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('actionError'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell
      title={t('purchasesTitle')}
      subtitle={t('purchasesSubtitle')}
      actions={
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href="/purchases/new" className="btn-sm" style={{ textDecoration: 'none' }}>
            + {t('newPurchase')}
          </Link>
          <button type="button" className="btn-sm" onClick={() => void load()}>
            {t('refresh')}
          </button>
        </div>
      }
    >
      {error ? <div className="error">{error}</div> : null}

      <div className="stats-grid">
        <StatCard icon="building" label={t('statSuppliers')} value={fa(stats.suppliers)} />
        <StatCard icon="inbox" label={t('statPurchases')} value={fa(stats.purchases)} />
        <StatCard
          icon="money"
          label={t('statPurchaseValue')}
          value={fa(stats.purchaseValue)}
        />
        <StatCard
          icon="money"
          label={t('statExpenses')}
          value={fa(stats.expenses)}
          accent="var(--warning)"
        />
      </div>

      <Tabs tabs={TABS} active={tab} onChange={setTab} t={t} />

      <div className="card">
        {tab === 'purchases' ? (
          <DataTable
            headers={[
              t('purchaseNo'),
              t('supplier'),
              t('colAmount'),
              t('status'),
              t('date'),
              t('actions'),
            ]}
            empty={t('noPurchases')}
            loading={loading}
            loadingLabel={t('loading')}
            rows={purchases.length}
          >
            {purchases.map((row) => (
              <tr key={row.id} style={ROW}>
                <td style={TD}>{row.purchaseNo}</td>
                <td style={TD}>
                  {row.supplier?.name ?? row.supplierName ?? '—'}
                </td>
                <td style={NUM}>{fa(row.total)}</td>
                <td style={{ ...TD, color: statusColor(row.status) }}>
                  {t(`pStatus${row.status}`)}
                </td>
                <td style={TD} className="muted">
                  {new Date(row.createdAt).toLocaleDateString(locale)}
                </td>
                <td style={TD}>
                  {/* دریافت کالا فقط پیش از دریافت معنا دارد؛ همین‌جا هم
                      موجودی اضافه می‌شود و هم سند خرید صادر می‌شود. */}
                  {['DRAFT', 'ORDERED', 'PENDING'].includes(row.status) ? (
                    <button
                      type="button"
                      style={TOUCH}
                      disabled={busy}
                      onClick={() => void receive(row.id)}
                    >
                      {t('receive')}
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </DataTable>
        ) : null}

        {tab === 'suppliers' ? (
          <DataTable
            headers={[
              t('name'),
              t('phone'),
              t('email'),
              t('purchaseCount'),
              t('status'),
            ]}
            empty={t('noSuppliers')}
            loading={loading}
            loadingLabel={t('loading')}
            rows={suppliers.length}
          >
            {suppliers.map((row) => (
              <tr key={row.id} style={ROW}>
                <td style={TD}>{row.name}</td>
                <td style={TD}>{row.phone ?? '—'}</td>
                <td style={TD}>{row.email ?? '—'}</td>
                <td style={NUM}>{fa(row.purchaseCount ?? 0)}</td>
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

        {tab === 'expenses' ? (
          <DataTable
            headers={[t('title'), t('colAmount'), t('status'), t('date')]}
            empty={t('noExpenses')}
            loading={loading}
            loadingLabel={t('loading')}
            rows={expenses.length}
          >
            {expenses.map((row) => (
              <tr key={row.id} style={ROW}>
                <td style={TD}>{row.title}</td>
                <td style={NUM}>{fa(row.amount)}</td>
                <td style={{ ...TD, color: statusColor(row.status) }}>
                  {t(`pStatus${row.status}`)}
                </td>
                <td style={TD} className="muted">
                  {new Date(row.createdAt).toLocaleDateString(locale)}
                </td>
              </tr>
            ))}
          </DataTable>
        ) : null}
      </div>
    </AppShell>
  );
}

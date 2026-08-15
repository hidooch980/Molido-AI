'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import AppShell from '../../components/AppShell';
import { Grid, type Column } from '../../components/Grid';
import { Icon } from '../../components/icons';
import { StatCard, Tabs, TOUCH } from '../../components/ui';
import { api } from '../../lib/api';
import { useI18n } from '../../lib/i18n-context';
import { amountOnly, loadCurrency } from '../../lib/money';

/**
 * تعاریف پایه — بانک، صندوق، انبار.
 *
 * تا امروز این‌ها فقط با نوشتن مستقیم در دیتابیس ساخته می‌شدند: صفحهٔ
 * خزانه حساب‌ها را **نشان می‌داد** ولی راهی برای ساختنشان نداشت.  یعنی
 * فروشگاهی که سامانه را نصب می‌کرد، بدون کمک فنی نمی‌توانست حساب بانکی
 * خودش را وارد کند.
 *
 * هر سه در یک صفحه‌اند چون یک کارند: چیزهایی که **یک‌بار** در ابتدای
 * راه‌اندازی تعریف می‌شوند و بعد سال‌ها دست نمی‌خورند.
 */

type Account = {
  id: string;
  name: string;
  type: string;
  bankName: string | null;
  accountNo: string | null;
  iban: string | null;
  balance: string | number;
  isActive: boolean;
};

type CashBox = {
  id: string;
  name: string;
  code: string;
  balance: string | number;
};

type Warehouse = {
  id: string;
  name: string;
  code: string | null;
  skuCount: string | number;
  stockValue: string | number;
};

const TABS = [
  { key: 'banks' as const, label: 'tabBanks' },
  { key: 'boxes' as const, label: 'tabCashBoxes' },
  { key: 'warehouses' as const, label: 'tabWarehouses' },
];

type Tab = (typeof TABS)[number]['key'];

// همان سه نوعی که DTO بک‌اند می‌پذیرد؛ هر چیز دیگری ۴۰۰ می‌گیرد.
const ACCOUNT_TYPES = ['BANK', 'CASH', 'FUND'] as const;

export default function DefinitionsPage() {
  const { t } = useI18n();

  const [tab, setTab] = useState<Tab>('banks');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [boxes, setBoxes] = useState<CashBox[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [bank, setBank] = useState({
    name: '',
    type: 'BANK',
    bankName: '',
    accountNo: '',
    iban: '',
    openingBalance: '',
  });
  const [box, setBox] = useState({ name: '', code: '', balance: '' });
  const [warehouse, setWarehouse] = useState({ name: '', code: '' });

  const fa = useCallback((value: unknown) => amountOnly(value), []);

  const load = useCallback(async () => {
    setLoading(true);

    try {
      const [a, b, w] = await Promise.all([
        api<Account[]>('/treasury/accounts'),
        api<CashBox[]>('/cashbox'),
        api<Warehouse[]>('/warehouses'),
      ]);

      setAccounts(Array.isArray(a) ? a : []);
      setBoxes(Array.isArray(b) ? b : []);
      setWarehouses(Array.isArray(w) ? w : []);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('fetchError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadCurrency();
    void load();
  }, [load]);

  /** ثبت با پیام موفقیت و پاک کردن فرم — تا معلوم باشد کار انجام شد. */
  async function submit(path: string, body: unknown, reset: () => void) {
    setBusy(true);
    setError('');
    setMessage('');

    try {
      await api(path, { method: 'POST', body });
      reset();
      setMessage(t('saved'));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('saveError'));
    } finally {
      setBusy(false);
    }
  }

  const accountColumns = useMemo<Array<Column<Account>>>(
    () => [
      {
        key: 'name',
        label: t('name'),
        value: (row) => row.name,
        render: (row) => <strong>{row.name}</strong>,
      },
      { key: 'type', label: t('accountType'), value: (row) => t(`acct_${row.type}`) },
      { key: 'bankName', label: t('bankName'), value: (row) => row.bankName ?? '—' },
      {
        key: 'accountNo',
        label: t('accountNo'),
        value: (row) => row.accountNo ?? '—',
      },
      { key: 'iban', label: t('iban'), optional: true, value: (row) => row.iban ?? '—' },
      {
        key: 'balance',
        label: t('balance'),
        numeric: true,
        total: true,
        value: (row) => Number(row.balance ?? 0),
        render: (row) => fa(row.balance),
      },
    ],
    [t, fa],
  );

  const boxColumns = useMemo<Array<Column<CashBox>>>(
    () => [
      {
        key: 'name',
        label: t('name'),
        value: (row) => row.name,
        render: (row) => <strong>{row.name}</strong>,
      },
      { key: 'code', label: t('code'), value: (row) => row.code },
      {
        key: 'balance',
        label: t('balance'),
        numeric: true,
        total: true,
        value: (row) => Number(row.balance ?? 0),
        render: (row) => fa(row.balance),
      },
    ],
    [t, fa],
  );

  const warehouseColumns = useMemo<Array<Column<Warehouse>>>(
    () => [
      {
        key: 'name',
        label: t('name'),
        value: (row) => row.name,
        render: (row) => <strong>{row.name}</strong>,
      },
      { key: 'code', label: t('code'), value: (row) => row.code ?? '—' },
      {
        key: 'skuCount',
        label: t('skuCount'),
        numeric: true,
        total: true,
        value: (row) => Number(row.skuCount ?? 0),
        render: (row) => fa(row.skuCount),
      },
      {
        key: 'stockValue',
        label: t('stockValue'),
        numeric: true,
        total: true,
        value: (row) => Number(row.stockValue ?? 0),
        render: (row) => fa(row.stockValue),
      },
    ],
    [t, fa],
  );

  return (
    <AppShell title={t('definitionsTitle')} subtitle={t('definitionsSubtitle')}>
      {error ? <div className="error">{error}</div> : null}
      {message ? (
        <div className="card" style={{ borderInlineStart: '4px solid var(--success)' }}>
          {message}
        </div>
      ) : null}

      <div className="stats-grid">
        <StatCard icon="bank" label={t('tabBanks')} value={fa(accounts.length)} />
        <StatCard icon="money" label={t('tabCashBoxes')} value={fa(boxes.length)} />
        <StatCard icon="warehouse" label={t('tabWarehouses')} value={fa(warehouses.length)} />
      </div>

      <Tabs tabs={TABS} active={tab} onChange={setTab} t={t} />

      {/* ---------- بانک ---------- */}
      {tab === 'banks' ? (
        <>
          <div className="card">
            <h3>{t('newBankAccount')}</h3>
            <div className="form-row">
              <input
                style={TOUCH}
                placeholder={t('accountTitle')}
                value={bank.name}
                onChange={(e) => setBank({ ...bank, name: e.target.value })}
              />
              <select
                style={TOUCH}
                value={bank.type}
                onChange={(e) => setBank({ ...bank, type: e.target.value })}
                aria-label={t('accountType')}
              >
                {ACCOUNT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {t(`acct_${type}`)}
                  </option>
                ))}
              </select>
              <input
                style={TOUCH}
                placeholder={t('bankName')}
                value={bank.bankName}
                onChange={(e) => setBank({ ...bank, bankName: e.target.value })}
              />
              <input
                style={TOUCH}
                placeholder={t('accountNo')}
                value={bank.accountNo}
                onChange={(e) => setBank({ ...bank, accountNo: e.target.value })}
                dir="ltr"
              />
              <input
                style={TOUCH}
                placeholder={t('iban')}
                value={bank.iban}
                onChange={(e) => setBank({ ...bank, iban: e.target.value })}
                dir="ltr"
              />
              {/* مانده افتتاحیه: حسابی که با صفر شروع شود، تراز اول دوره
                  را غلط می‌کند. */}
              <input
                style={TOUCH}
                type="number"
                placeholder={t('openingBalance')}
                value={bank.openingBalance}
                onChange={(e) => setBank({ ...bank, openingBalance: e.target.value })}
              />
            </div>
            <button
              type="button"
              className="btn"
              style={{ marginTop: 10 }}
              disabled={busy || !bank.name.trim()}
              onClick={() =>
                void submit(
                  '/treasury/accounts',
                  {
                    name: bank.name.trim(),
                    type: bank.type,
                    bankName: bank.bankName.trim() || undefined,
                    accountNo: bank.accountNo.trim() || undefined,
                    iban: bank.iban.trim() || undefined,
                    openingBalance: Number(bank.openingBalance || 0),
                  },
                  () =>
                    setBank({
                      name: '',
                      type: 'BANK',
                      bankName: '',
                      accountNo: '',
                      iban: '',
                      openingBalance: '',
                    }),
                )
              }
            >
              <Icon name="plus" size={17} /> {t('add')}
            </button>
          </div>

          <Grid
            rows={accounts}
            columns={accountColumns}
            rowKey={(row) => row.id}
            loading={loading}
            empty={t('noAccounts')}
            exportName="bank-accounts"
            height="auto"
            t={t}
          />
        </>
      ) : null}

      {/* ---------- صندوق ---------- */}
      {tab === 'boxes' ? (
        <>
          <div className="card">
            <h3>{t('newCashBox')}</h3>
            <p className="muted">{t('cashBoxHint')}</p>
            <div className="form-row">
              <input
                style={TOUCH}
                placeholder={t('name')}
                value={box.name}
                onChange={(e) => setBox({ ...box, name: e.target.value })}
              />
              <input
                style={TOUCH}
                placeholder={t('code')}
                value={box.code}
                onChange={(e) => setBox({ ...box, code: e.target.value })}
                dir="ltr"
              />
              <input
                style={TOUCH}
                type="number"
                placeholder={t('openingBalance')}
                value={box.balance}
                onChange={(e) => setBox({ ...box, balance: e.target.value })}
              />
            </div>
            <button
              type="button"
              className="btn"
              style={{ marginTop: 10 }}
              disabled={busy || !box.name.trim() || !box.code.trim()}
              onClick={() =>
                void submit(
                  '/cashbox',
                  {
                    name: box.name.trim(),
                    code: box.code.trim(),
                    balance: Number(box.balance || 0),
                  },
                  () => setBox({ name: '', code: '', balance: '' }),
                )
              }
            >
              <Icon name="plus" size={17} /> {t('add')}
            </button>
          </div>

          <Grid
            rows={boxes}
            columns={boxColumns}
            rowKey={(row) => row.id}
            loading={loading}
            empty={t('noCashBoxes')}
            exportName="cash-boxes"
            height="auto"
            t={t}
          />
        </>
      ) : null}

      {/* ---------- انبار ---------- */}
      {tab === 'warehouses' ? (
        <>
          <div className="card">
            <h3>{t('newWarehouse')}</h3>
            <div className="form-row">
              <input
                style={TOUCH}
                placeholder={t('name')}
                value={warehouse.name}
                onChange={(e) => setWarehouse({ ...warehouse, name: e.target.value })}
              />
              <input
                style={TOUCH}
                placeholder={t('code')}
                value={warehouse.code}
                onChange={(e) => setWarehouse({ ...warehouse, code: e.target.value })}
                dir="ltr"
              />
            </div>
            <button
              type="button"
              className="btn"
              style={{ marginTop: 10 }}
              disabled={busy || !warehouse.name.trim()}
              onClick={() =>
                void submit(
                  '/warehouses',
                  {
                    name: warehouse.name.trim(),
                    code: warehouse.code.trim() || undefined,
                  },
                  () => setWarehouse({ name: '', code: '' }),
                )
              }
            >
              <Icon name="plus" size={17} /> {t('add')}
            </button>
          </div>

          <Grid
            rows={warehouses}
            columns={warehouseColumns}
            rowKey={(row) => row.id}
            loading={loading}
            empty={t('noData')}
            exportName="warehouses"
            height="auto"
            t={t}
          />
        </>
      ) : null}
    </AppShell>
  );
}

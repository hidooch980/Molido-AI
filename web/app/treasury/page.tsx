'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import AppShell from '../../components/AppShell';
import { api } from '../../lib/api';

type Account = {
  id: string;
  name: string;
  type: string;
  bankName?: string | null;
  accountNo?: string | null;
  iban?: string | null;
  balance: string | number;
  isActive: boolean;
};

type Tx = {
  id: string;
  accountId: string;
  type: string;
  amount: string | number;
  reference?: string | null;
  description?: string | null;
  date: string;
  account?: { id: string; name: string };
};

const ACCOUNT_TYPES = [
  { value: 'BANK', label: 'بانکی' },
  { value: 'CASH', label: 'نقدی' },
  { value: 'PETTY_CASH', label: 'تنخواه' },
];

const TX_FA: Record<string, string> = {
  DEPOSIT: 'واریز',
  WITHDRAWAL: 'برداشت',
  TRANSFER_IN: 'انتقال ورودی',
  TRANSFER_OUT: 'انتقال خروجی',
};

/** خزانه‌داری — حساب‌های بانکی/نقدی/تنخواه و گردش وجوه. */
export default function TreasuryPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [txs, setTxs] = useState<Tx[]>([]);

  const [newAcc, setNewAcc] = useState({
    name: '',
    type: 'BANK',
    bankName: '',
    accountNo: '',
  });

  const [tx, setTx] = useState({
    accountId: '',
    type: 'DEPOSIT',
    amount: 0,
    description: '',
  });

  const [transfer, setTransfer] = useState({
    fromAccountId: '',
    toAccountId: '',
    amount: 0,
    description: '',
  });

  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const fa = (v: unknown) => Number(v ?? 0).toLocaleString('fa-IR');

  const load = useCallback(async () => {
    try {
      const unwrap = <T,>(v: T[] | { data: T[] }): T[] =>
        Array.isArray(v) ? v : (v?.data ?? []);

      const [a, t] = await Promise.all([
        api<Account[] | { data: Account[] }>('/treasury/accounts'),
        api<Tx[] | { data: Tx[] }>('/treasury/transactions').catch(
          () => [] as Tx[],
        ),
      ]);

      const accs = unwrap(a);

      setAccounts(accs);
      setTxs(unwrap(t));
      setTx((p) => ({ ...p, accountId: p.accountId || (accs[0]?.id ?? '') }));
      setTransfer((p) => ({
        ...p,
        fromAccountId: p.fromAccountId || (accs[0]?.id ?? ''),
        toAccountId: p.toAccountId || (accs[1]?.id ?? ''),
      }));
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در دریافت اطلاعات');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const totalBalance = useMemo(
    () => accounts.reduce((s, a) => s + Number(a.balance), 0),
    [accounts],
  );

  async function run(label: string, fn: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    setMessage('');

    try {
      await fn();
      setMessage(label);
      void load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در انجام عملیات');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell title="خزانه‌داری" subtitle="حساب‌ها، واریز و برداشت، انتقال وجه">
      {error ? <div className="error">{error}</div> : null}
      {message ? <div className="ok">{message}</div> : null}

      <div className="stats-grid">
        <div className="stat-card">
          <span className="stat-icon">🏦</span>
          <span className="stat-label">تعداد حساب</span>
          <span className="stat-value">{fa(accounts.length)}</span>
        </div>
        <div className="stat-card">
          <span className="stat-icon">💰</span>
          <span className="stat-label">مجموع موجودی</span>
          <span className="stat-value">{fa(totalBalance)}</span>
        </div>
        <div className="stat-card">
          <span className="stat-icon">🔄</span>
          <span className="stat-label">گردش ثبت‌شده</span>
          <span className="stat-value">{fa(txs.length)}</span>
        </div>
      </div>

      {/* حساب‌ها */}
      <div className="card">
        <h3>🏦 حساب‌ها</h3>

        {accounts.length === 0 ? (
          <p className="muted empty">حسابی ثبت نشده است.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>نام</th>
                  <th>نوع</th>
                  <th>بانک</th>
                  <th>شماره حساب</th>
                  <th>موجودی</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((a) => (
                  <tr key={a.id}>
                    <td>{a.name}</td>
                    <td>
                      <span className="badge">
                        {ACCOUNT_TYPES.find((t) => t.value === a.type)?.label ??
                          a.type}
                      </span>
                    </td>
                    <td className="muted">{a.bankName ?? '—'}</td>
                    <td className="muted">{a.accountNo ?? '—'}</td>
                    <td>
                      <strong>{fa(a.balance)}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* حساب جدید */}
      <div className="card">
        <h3>➕ حساب جدید</h3>
        <div className="pos-settings" style={{ marginBottom: 12 }}>
          <label>
            <span className="muted">نام حساب</span>
            <input
              value={newAcc.name}
              onChange={(e) => setNewAcc({ ...newAcc, name: e.target.value })}
              placeholder="مثلاً صندوق فروشگاه"
            />
          </label>
          <label>
            <span className="muted">نوع</span>
            <select
              value={newAcc.type}
              onChange={(e) => setNewAcc({ ...newAcc, type: e.target.value })}
            >
              {ACCOUNT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="muted">بانک</span>
            <input
              value={newAcc.bankName}
              onChange={(e) =>
                setNewAcc({ ...newAcc, bankName: e.target.value })
              }
              placeholder="اختیاری"
            />
          </label>
          <label>
            <span className="muted">شماره حساب</span>
            <input
              value={newAcc.accountNo}
              onChange={(e) =>
                setNewAcc({ ...newAcc, accountNo: e.target.value })
              }
              placeholder="اختیاری"
            />
          </label>
        </div>
        <button
          type="button"
          className="btn-sm"
          disabled={busy || !newAcc.name.trim()}
          onClick={() =>
            void run('حساب ساخته شد ✅', async () => {
              await api('/treasury/accounts', {
                method: 'POST',
                body: {
                  name: newAcc.name.trim(),
                  type: newAcc.type,
                  bankName: newAcc.bankName || undefined,
                  accountNo: newAcc.accountNo || undefined,
                },
              });
              setNewAcc({ name: '', type: 'BANK', bankName: '', accountNo: '' });
            })
          }
        >
          ثبت حساب
        </button>
      </div>

      <div className="pos-layout">
        {/* واریز / برداشت */}
        <div className="card">
          <h3>💵 واریز و برداشت</h3>
          <div className="pos-settings" style={{ marginBottom: 12 }}>
            <label>
              <span className="muted">حساب</span>
              <select
                value={tx.accountId}
                onChange={(e) => setTx({ ...tx, accountId: e.target.value })}
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="muted">نوع</span>
              <select
                value={tx.type}
                onChange={(e) => setTx({ ...tx, type: e.target.value })}
              >
                <option value="DEPOSIT">واریز</option>
                <option value="WITHDRAWAL">برداشت</option>
              </select>
            </label>
            <label>
              <span className="muted">مبلغ</span>
              <input
                type="number"
                min={0}
                value={tx.amount}
                onChange={(e) =>
                  setTx({ ...tx, amount: Number(e.target.value) || 0 })
                }
              />
            </label>
            <label>
              <span className="muted">شرح</span>
              <input
                value={tx.description}
                onChange={(e) => setTx({ ...tx, description: e.target.value })}
                placeholder="اختیاری"
              />
            </label>
          </div>
          <button
            type="button"
            className="btn-sm"
            disabled={busy || !tx.accountId || tx.amount <= 0}
            onClick={() =>
              void run('گردش ثبت شد ✅', async () => {
                await api('/treasury/transactions', {
                  method: 'POST',
                  body: {
                    accountId: tx.accountId,
                    type: tx.type,
                    amount: tx.amount,
                    description: tx.description || undefined,
                  },
                });
                setTx({ ...tx, amount: 0, description: '' });
              })
            }
          >
            ثبت گردش
          </button>
        </div>

        {/* انتقال */}
        <div className="card">
          <h3>🔄 انتقال بین حساب‌ها</h3>
          <div className="pos-settings" style={{ marginBottom: 12 }}>
            <label>
              <span className="muted">از حساب</span>
              <select
                value={transfer.fromAccountId}
                onChange={(e) =>
                  setTransfer({ ...transfer, fromAccountId: e.target.value })
                }
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="muted">به حساب</span>
              <select
                value={transfer.toAccountId}
                onChange={(e) =>
                  setTransfer({ ...transfer, toAccountId: e.target.value })
                }
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="muted">مبلغ</span>
              <input
                type="number"
                min={0}
                value={transfer.amount}
                onChange={(e) =>
                  setTransfer({
                    ...transfer,
                    amount: Number(e.target.value) || 0,
                  })
                }
              />
            </label>
          </div>
          <button
            type="button"
            className="btn-sm"
            disabled={
              busy ||
              transfer.amount <= 0 ||
              !transfer.fromAccountId ||
              transfer.fromAccountId === transfer.toAccountId
            }
            onClick={() =>
              void run('انتقال انجام شد ✅', async () => {
                await api('/treasury/transfer', {
                  method: 'POST',
                  body: {
                    fromAccountId: transfer.fromAccountId,
                    toAccountId: transfer.toAccountId,
                    amount: transfer.amount,
                    description: transfer.description || undefined,
                  },
                });
                setTransfer({ ...transfer, amount: 0 });
              })
            }
          >
            انجام انتقال
          </button>
          {transfer.fromAccountId === transfer.toAccountId ? (
            <p className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>
              مبدأ و مقصد نباید یکی باشند.
            </p>
          ) : null}
        </div>
      </div>

      {/* گردش اخیر */}
      <div className="card">
        <h3>📜 گردش اخیر</h3>
        {txs.length === 0 ? (
          <p className="muted empty">گردشی ثبت نشده است.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>تاریخ</th>
                  <th>حساب</th>
                  <th>نوع</th>
                  <th>مبلغ</th>
                  <th>شرح</th>
                </tr>
              </thead>
              <tbody>
                {txs.slice(0, 30).map((t) => (
                  <tr key={t.id}>
                    <td>{new Date(t.date).toLocaleDateString('fa-IR')}</td>
                    <td>
                      {t.account?.name ??
                        accounts.find((a) => a.id === t.accountId)?.name ??
                        '—'}
                    </td>
                    <td>
                      <span className="badge">{TX_FA[t.type] ?? t.type}</span>
                    </td>
                    <td>
                      <strong>{fa(t.amount)}</strong>
                    </td>
                    <td className="muted">{t.description ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  );
}

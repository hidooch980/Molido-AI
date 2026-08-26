'use client';

/**
 * چرخهٔ اعتبار بودجه — تخصیص، تعهد، هزینهٔ قطعی.
 *
 * صفحهٔ `/records/budget` فقط CRUD بودجه را نشان می‌دهد: عنوان، سال،
 * مبلغ کل.  چیزی که آنجا نیست و بودجه‌ریزی را ممکن می‌کند، **ردیف‌ها**
 * و **اعتبارِ آزادِ** هرکدام است.
 *
 * ⚠️ ستونِ «آزاد» ستونِ اصلی است، نه «مصوب».
 *
 *    مصوب رقمی است که شورا اجازه داده؛ آزاد رقمی است که واقعاً می‌شود
 *    خرجش کرد.  مدیری که به مصوب نگاه کند، پولِ تعهدشده را دوباره
 *    خرج می‌کند.
 */

import { useCallback, useEffect, useState } from 'react';

import AppShell from '../../components/AppShell';
import { Icon } from '../../components/icons';
import { api } from '../../lib/api';
import { useI18n } from '../../lib/i18n-context';

type Budget = { id: string; title: string; year: number };

type Line = {
  id: string;
  title: string;
  amount: string | number;
  allocated: string | number | null;
  committed: string | number;
  spent: string | number | null;
  available: string | number;
};

type Commitment = {
  id: string;
  sourceType: string;
  sourceId: string | null;
  amount: string | number;
  status: string;
  note: string | null;
  createdAt: string;
};

const box: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 14,
  padding: 14,
};

export default function BudgetCyclePage() {
  const { t, locale } = useI18n();
  const fa = useCallback(
    (v: unknown) => Number(v ?? 0).toLocaleString(locale),
    [locale],
  );

  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [budgetId, setBudgetId] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [openLine, setOpenLine] = useState('');
  const [ledger, setLedger] = useState<Commitment[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  const [newLine, setNewLine] = useState({ title: '', amount: '', allocated: '' });
  const [commit, setCommit] = useState({ amount: '', sourceType: 'CONTRACT', note: '' });

  useEffect(() => {
    void (async () => {
      try {
        const rows = await api<Budget[] | { data: Budget[] }>('/budget');
        const list = Array.isArray(rows) ? rows : (rows.data ?? []);
        setBudgets(list);
        if (list.length && !budgetId) setBudgetId(list[0].id);
      } catch (err) {
        setError(err instanceof Error ? err.message : t('fetchError'));
      }
    })();
    // فقط یک بار: فهرست بودجه‌ها با انتخابِ ردیف عوض نمی‌شود.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadLines = useCallback(async () => {
    if (!budgetId) return;
    try {
      setLines(await api<Line[]>(`/budget/${budgetId}/lines`));
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('fetchError'));
    }
  }, [budgetId, t]);

  useEffect(() => {
    void loadLines();
  }, [loadLines]);

  async function addLine() {
    if (!newLine.title.trim() || !newLine.amount) {
      setError(t('budgetNeedLine'));
      return;
    }
    setBusy('line');
    try {
      await api(`/budget/${budgetId}/lines`, {
        method: 'POST',
        body: {
          title: newLine.title.trim(),
          amount: Number(newLine.amount),
          allocated: newLine.allocated ? Number(newLine.allocated) : undefined,
        },
      });
      setNewLine({ title: '', amount: '', allocated: '' });
      await loadLines();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('saveError'));
    } finally {
      setBusy('');
    }
  }

  async function openLedger(lineId: string) {
    if (openLine === lineId) {
      setOpenLine('');
      return;
    }
    setOpenLine(lineId);
    try {
      setLedger(await api<Commitment[]>(`/budget/lines/${lineId}/commitments`));
    } catch {
      setLedger([]);
    }
  }

  async function addCommitment(lineId: string) {
    if (!commit.amount) {
      setError(t('budgetNeedAmount'));
      return;
    }
    setBusy(lineId);
    try {
      await api(`/budget/lines/${lineId}/commit`, {
        method: 'POST',
        body: {
          amount: Number(commit.amount),
          sourceType: commit.sourceType,
          note: commit.note.trim() || undefined,
        },
      });
      setCommit({ amount: '', sourceType: 'CONTRACT', note: '' });
      await Promise.all([loadLines(), openLedger(lineId), openLedger(lineId)]);
      setError('');
    } catch (err) {
      // ⚠️ پیامِ سرور عیناً نشان داده می‌شود، چون رقمِ آزاد و درخواست
      //    را در خود دارد — بازنویسی‌اش آن را از بین می‌برد.
      setError(err instanceof Error ? err.message : t('saveError'));
    } finally {
      setBusy('');
    }
  }

  async function act(id: string, kind: 'settle' | 'release', lineId: string) {
    setBusy(id);
    try {
      await api(`/budget/commitments/${id}/${kind}`, { method: 'POST', body: {} });
      await loadLines();
      setLedger(await api<Commitment[]>(`/budget/lines/${lineId}/commitments`));
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('saveError'));
    } finally {
      setBusy('');
    }
  }

  return (
    <AppShell title={t('budgetCycle')}>
      {error ? (
        <div
          style={{
            ...box,
            borderColor: 'var(--danger)',
            color: 'var(--danger)',
            marginBottom: 12,
          }}
        >
          {error}
        </div>
      ) : null}

      <div style={{ ...box, marginBottom: 14 }}>
        {/*
          ⚠️ برچسب باید ورودی را **در بر بگیرد** یا با `htmlFor` به آن
             وصل شود.

             پیش‌تر `<label>` کنارِ `<select>` بود، نه دورش — یعنی هیچ
             ارتباطی بینشان نبود و صفحه‌خوان یک فهرستِ بی‌نام اعلام
             می‌کرد.  چشمی درست به نظر می‌رسید و همین پنهانش کرده بود.

             `verify-labels` گرفتش.
        */}
        <label
          htmlFor="budget-select"
          style={{ display: 'block', fontSize: 12.5, marginBottom: 6 }}
        >
          {t('budget')}
        </label>
        <select
          id="budget-select"
          value={budgetId}
          onChange={(e) => setBudgetId(e.target.value)}
        >
          {budgets.length === 0 ? <option value="">{t('noData')}</option> : null}
          {budgets.map((b) => (
            <option key={b.id} value={b.id}>
              {b.title} — {fa(b.year)}
            </option>
          ))}
        </select>
      </div>

      {/* ---------- ردیف تازه ---------- */}
      <div style={{ ...box, marginBottom: 14 }}>
        <h2 style={{ fontSize: 15, marginBottom: 10 }}>{t('budgetNewLine')}</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            placeholder={t('title')}
            value={newLine.title}
            onChange={(e) => setNewLine({ ...newLine, title: e.target.value })}
            style={{ flex: 2, minWidth: 160 }}
          />
          <input
            placeholder={t('budgetApproved')}
            value={newLine.amount}
            inputMode="numeric"
            onChange={(e) => setNewLine({ ...newLine, amount: e.target.value })}
            style={{ flex: 1, minWidth: 120 }}
          />
          <input
            placeholder={t('budgetAllocated')}
            value={newLine.allocated}
            inputMode="numeric"
            onChange={(e) => setNewLine({ ...newLine, allocated: e.target.value })}
            style={{ flex: 1, minWidth: 120 }}
          />
          <button type="button" disabled={busy === 'line' || !budgetId} onClick={() => void addLine()}>
            <Icon name="plus" size={16} /> {t('add')}
          </button>
        </div>
      </div>

      {/* ---------- ردیف‌ها ---------- */}
      {lines.length === 0 ? (
        <div style={box}>
          <p className="muted">{t('budgetNoLines')}</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {lines.map((line) => {
            const available = Number(line.available);
            // ⚠️ اعتبارِ تمام‌شده باید در یک نگاه دیده شود، نه با
            //    خواندنِ رقم.  رنگ تنها نشانه نیست: رقم هم کنارش هست.
            const tight = available <= 0;

            return (
              <div key={line.id} style={box}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 10,
                    flexWrap: 'wrap',
                  }}
                >
                  <strong>{line.title}</strong>
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => void openLedger(line.id)}
                  >
                    {openLine === line.id ? t('close') : t('budgetLedger')}
                  </button>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
                    gap: 8,
                    marginTop: 10,
                    fontSize: 13,
                  }}
                >
                  <Cell label={t('budgetApproved')} value={fa(line.amount)} />
                  <Cell
                    label={t('budgetAllocated')}
                    value={line.allocated === null ? '—' : fa(line.allocated)}
                  />
                  <Cell label={t('budgetCommitted')} value={fa(line.committed)} />
                  <Cell label={t('budgetSpent')} value={fa(line.spent)} />
                  <Cell
                    label={t('budgetAvailable')}
                    value={fa(available)}
                    tone={tight ? 'danger' : 'success'}
                  />
                </div>

                {openLine === line.id ? (
                  <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                      <input
                        placeholder={t('amount')}
                        value={commit.amount}
                        inputMode="numeric"
                        onChange={(e) => setCommit({ ...commit, amount: e.target.value })}
                        style={{ flex: 1, minWidth: 110 }}
                      />
                      <select
                        value={commit.sourceType}
                        onChange={(e) => setCommit({ ...commit, sourceType: e.target.value })}
                      >
                        <option value="CONTRACT">{t('srcContract')}</option>
                        <option value="PURCHASE">{t('srcPurchase')}</option>
                        <option value="EXPENSE">{t('srcExpense')}</option>
                        <option value="MANUAL">{t('srcManual')}</option>
                      </select>
                      <input
                        placeholder={t('note')}
                        value={commit.note}
                        onChange={(e) => setCommit({ ...commit, note: e.target.value })}
                        style={{ flex: 1, minWidth: 120 }}
                      />
                      <button
                        type="button"
                        disabled={busy === line.id}
                        onClick={() => void addCommitment(line.id)}
                      >
                        {t('budgetCommit')}
                      </button>
                    </div>

                    {ledger.length === 0 ? (
                      <p className="muted" style={{ fontSize: 13 }}>
                        {t('budgetNoCommitments')}
                      </p>
                    ) : (
                      <div className="table-wrap">
                        <table className="stack-table" style={{ width: '100%', fontSize: 12.5 }}>
                          <thead>
                            <tr style={{ color: 'var(--text-dim)' }}>
                              <th style={{ padding: 6, textAlign: 'start' }}>{t('source')}</th>
                              <th style={{ padding: 6, textAlign: 'start' }}>{t('amount')}</th>
                              <th style={{ padding: 6, textAlign: 'start' }}>{t('status')}</th>
                              <th style={{ padding: 6, textAlign: 'start' }}>{t('actions')}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {ledger.map((c) => (
                              <tr key={c.id}>
                                <td style={{ padding: 6 }} data-primary>
                                  {t(`src${c.sourceType.charAt(0)}${c.sourceType.slice(1).toLowerCase()}`)}
                                  {c.note ? <span className="muted"> — {c.note}</span> : null}
                                </td>
                                <td
                                  style={{ padding: 6, fontVariantNumeric: 'tabular-nums' }}
                                  data-label={t('amount')}
                                >
                                  {fa(c.amount)}
                                </td>
                                <td style={{ padding: 6 }} data-label={t('status')}>
                                  <span className="badge">{t(`cmt${c.status}`)}</span>
                                </td>
                                <td style={{ padding: 6 }} data-label={t('actions')}>
                                  {c.status === 'OPEN' ? (
                                    <span style={{ display: 'flex', gap: 6 }}>
                                      <button
                                        type="button"
                                        disabled={busy === c.id}
                                        onClick={() => void act(c.id, 'settle', line.id)}
                                      >
                                        {t('budgetSettle')}
                                      </button>
                                      <button
                                        type="button"
                                        className="ghost"
                                        disabled={busy === c.id}
                                        onClick={() => void act(c.id, 'release', line.id)}
                                      >
                                        {t('budgetRelease')}
                                      </button>
                                    </span>
                                  ) : (
                                    <span className="muted">—</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}

function Cell({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'danger' | 'success';
}) {
  return (
    <div>
      <div className="muted" style={{ fontSize: 11.5 }}>
        {label}
      </div>
      <div
        style={{
          fontWeight: 700,
          fontVariantNumeric: 'tabular-nums',
          color:
            tone === 'danger'
              ? 'var(--danger)'
              : tone === 'success'
                ? 'var(--success)'
                : undefined,
        }}
      >
        {value}
      </div>
    </div>
  );
}

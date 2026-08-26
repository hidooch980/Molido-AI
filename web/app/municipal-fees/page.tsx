'use client';

/**
 * عوارض و قبوض شهرداری.
 *
 * هفت مسیر API داشت و هیچ صفحه‌ای صدایشان نمی‌زد.
 *
 * ⚠️ چرا با موتورِ `[domain]` ساخته نشد؟
 *
 *    CRUD نیست: `:id/pay` و `:id/cancel` گردشِ کار دارند، و پرداخت
 *    باید مقصدِ پول را بگیرد (صندوق یا حسابِ خزانه).  فرمِ عمومی
 *    نه این را می‌سازد نه آن.
 *
 * ⚠️ چیزی که این صفحه باید بی‌درنگ جواب بدهد:
 *    **چقدر وصول نشده و از چه کسی.**
 *    بقیه مرجع است.
 *
 * ⚠️ «پرداخت» اینجا یعنی **ثبتِ دریافت**، نه درگاهِ آنلاین.
 *
 *    پول در صندوق یا حسابِ خزانه می‌نشیند و رسیدش در ماژول وصولی‌ها
 *    ثبت می‌شود.  اگر روزی درگاه اضافه شود، مسیرِ جداگانه‌ای است.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import AppShell from '../../components/AppShell';
import { api } from '../../lib/api';
import { useI18n } from '../../lib/i18n-context';

type Bill = {
  id: string;
  billNo: string;
  type: string;
  status: string;
  payerName: string;
  payerPhone: string | null;
  address: string | null;
  amount: string | number;
  description: string | null;
  paidAt: string | null;
  createdAt: string;
};

type Destination = { id: string; name: string };

const TYPE_FA: Record<string, string> = {
  VIOLATION_FINE: 'جریمهٔ تخلف',
  OTHER: 'سایر',
};

const STATUS_FA: Record<string, string> = {
  UNPAID: 'پرداخت‌نشده',
  PAID: 'پرداخت‌شده',
  CANCELLED: 'ابطال‌شده',
  FINED: 'جریمه‌شده',
};

const STATUS_COLOR: Record<string, string> = {
  UNPAID: 'var(--warning)',
  PAID: 'var(--success)',
  CANCELLED: 'var(--muted)',
  FINED: 'var(--danger)',
};

const METHOD_FA: [string, string][] = [
  ['CASH', 'نقدی'],
  ['CARD', 'کارت'],
  ['TRANSFER', 'حواله'],
  ['CHEQUE', 'چک'],
  ['POS', 'کارت‌خوان'],
];

const money = (v: string | number) =>
  Number(v ?? 0).toLocaleString('fa-IR', { maximumFractionDigits: 0 });

export default function MunicipalFeesPage() {
  const { t } = useI18n();

  const [list, setList] = useState<Bill[]>([]);
  const [boxes, setBoxes] = useState<Destination[]>([]);
  const [accounts, setAccounts] = useState<Destination[]>([]);
  const [filter, setFilter] = useState('UNPAID');
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [paying, setPaying] = useState<Bill | null>(null);

  const [dest, setDest] = useState('');
  const [method, setMethod] = useState('CASH');
  const [reference, setReference] = useState('');

  const [draft, setDraft] = useState({
    payerName: '',
    payerPhone: '',
    address: '',
    amount: '',
    type: 'OTHER',
    description: '',
  });

  const load = useCallback(async () => {
    try {
      setList(await api<Bill[]>('/municipal-fees'));
    } catch (caught) {
      setError((caught as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    // ⚠️ مقصدهای پول جداگانه و **بی‌سروصدا** بار می‌شوند.
    //
    //    کاربری که فقط قبض ثبت می‌کند ممکن است دسترسیِ خزانه نداشته
    //    باشد؛ ۴۰۳ گرفتن اینجا نباید کلِ صفحه را خراب کند.
    api<Destination[]>('/cashbox').then(setBoxes).catch(() => setBoxes([]));
    api<Destination[]>('/treasury/accounts').then(setAccounts).catch(() => setAccounts([]));
  }, []);

  const flash = (m: string) => {
    setNote(m);
    window.setTimeout(() => setNote(''), 2500);
  };

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');

    if (!draft.payerName.trim()) {
      setError('نام پرداخت‌کننده الزامی است');
      return;
    }
    const amount = Number(draft.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('مبلغ باید عددی بزرگ‌تر از صفر باشد');
      return;
    }

    const body: Record<string, unknown> = {
      payerName: draft.payerName.trim(),
      amount,
      type: draft.type,
    };
    for (const [key, value] of Object.entries({
      payerPhone: draft.payerPhone,
      address: draft.address,
      description: draft.description,
    })) {
      if (value.trim()) body[key] = value.trim();
    }

    setBusy('create');
    try {
      await api('/municipal-fees', { method: 'POST', body });
      flash('قبض ثبت شد');
      setDraft({ payerName: '', payerPhone: '', address: '', amount: '', type: 'OTHER', description: '' });
      await load();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const submitPayment = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!paying) return;
    setError('');

    // ⚠️ دقیقاً یکی از دو مقصد.  فرستادنِ هر دو یا هیچ‌کدام را سرور رد
    //    می‌کند؛ گرفتنش اینجا یک رفت‌وبرگشت را حذف می‌کند.
    if (!dest) {
      setError('مقصد دریافت را انتخاب کنید');
      return;
    }

    const [kind, id] = dest.split(':');
    const body: Record<string, unknown> = { method };
    if (kind === 'box') body.cashBoxId = id;
    else body.treasuryAccountId = id;
    if (reference.trim()) body.reference = reference.trim();

    setBusy(paying.id);
    try {
      await api(`/municipal-fees/${paying.id}/pay`, { method: 'PATCH', body });
      flash('دریافت ثبت شد');
      setPaying(null);
      setDest('');
      setReference('');
      await load();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const cancel = async (bill: Bill) => {
    // ⚠️ ابطال برگشت ندارد و قبض را از وصولی خارج می‌کند.
    if (!window.confirm(`قبض «${bill.billNo}» ابطال شود؟`)) return;
    setBusy(bill.id);
    setError('');
    try {
      await api(`/municipal-fees/${bill.id}/cancel`, { method: 'PATCH' });
      flash('قبض ابطال شد');
      await load();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return list.filter((b) => {
      if (filter && b.status !== filter) return false;
      if (!q) return true;
      return (
        b.billNo.toLowerCase().includes(q) ||
        b.payerName.toLowerCase().includes(q) ||
        (b.payerPhone ?? '').includes(q) ||
        (b.address ?? '').toLowerCase().includes(q)
      );
    });
  }, [list, filter, search]);

  /** ⚠️ از کلِ فهرست، نه از صافی‌شده — وگرنه با انتخابِ «پرداخت‌شده»
   *    عددِ معوق ناپدید می‌شد، که تنها عددِ مهمِ این صفحه است. */
  const summary = useMemo(() => {
    const unpaid = list.filter((b) => b.status === 'UNPAID');
    return {
      total: list.length,
      unpaidCount: unpaid.length,
      unpaidAmount: unpaid.reduce((s, b) => s + Number(b.amount ?? 0), 0),
    };
  }, [list]);

  const statuses = useMemo(() => [...new Set(list.map((b) => b.status))].sort(), [list]);

  return (
    <AppShell title={t('menuMunicipalFees')}>
      <div style={{ display: 'grid', gap: 16 }}>
        {error ? (
          <div role="alert" style={ALERT}>
            {error}
          </div>
        ) : null}
        {note ? (
          <div
            role="status"
            style={{
              ...ALERT,
              background: 'color-mix(in srgb, var(--success) 13%, transparent)',
              color: 'var(--success)',
            }}
          >
            {note}
          </div>
        ) : null}

        {summary.unpaidCount > 0 ? (
          <section style={CARD}>
            <h2 style={H2}>{t('mfOverdue')}</h2>
            <p style={{ margin: 0 }}>
              <span style={{ fontSize: 26, fontWeight: 700, color: 'var(--warning)' }}>
                {money(summary.unpaidAmount)}
              </span>{' '}
              <span style={{ fontSize: 14, color: 'var(--muted)' }}>
                ریال در {summary.unpaidCount} قبض
              </span>
            </p>
          </section>
        ) : null}

        <section style={CARD}>
          <h2 style={H2}>{t('mfNewBill')}</h2>
          <form style={FORM} onSubmit={create}>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={LABEL}>{t('ttPayer')}</span>
              <input
                style={INPUT}
                value={draft.payerName}
                onChange={(e) => setDraft({ ...draft, payerName: e.target.value })}
              />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={LABEL}>{t('ttPhone')}</span>
              <input
                style={INPUT}
                value={draft.payerPhone}
                onChange={(e) => setDraft({ ...draft, payerPhone: e.target.value })}
              />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={LABEL}>{t('ttAmount')}</span>
              <input
                style={INPUT}
                inputMode="numeric"
                value={draft.amount}
                onChange={(e) => setDraft({ ...draft, amount: e.target.value })}
              />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={LABEL}>{t('ttType')}</span>
              <select
                style={INPUT}
                value={draft.type}
                onChange={(e) => setDraft({ ...draft, type: e.target.value })}
              >
                <option value="OTHER">{t('mfOther')}</option>
                <option value="VIOLATION_FINE">{t('mfViolationFine')}</option>
              </select>
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={LABEL}>{t('ttAddress')}</span>
              <input
                style={INPUT}
                value={draft.address}
                onChange={(e) => setDraft({ ...draft, address: e.target.value })}
              />
            </label>
            <button type="submit" style={BTN_PRIMARY} disabled={busy === 'create'}>
              {busy === 'create' ? 'در حال ثبت…' : 'ثبت قبض'}
            </button>
          </form>
        </section>

        {paying ? (
          <section style={{ ...CARD, borderColor: 'var(--accent)' }}>
            <h2 style={H2}>
              ثبت دریافت — {paying.billNo}{' '}
              <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: 14 }}>
                {money(paying.amount)} ریال
              </span>
            </h2>
            <form style={FORM} onSubmit={submitPayment}>
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={LABEL}>{t('ttDestination')}</span>
                <select style={INPUT} value={dest} onChange={(e) => setDest(e.target.value)}>
                  <option value="">{t('ttChoose')}</option>
                  {boxes.map((b) => (
                    <option key={b.id} value={`box:${b.id}`}>
                      صندوق: {b.name}
                    </option>
                  ))}
                  {accounts.map((a) => (
                    <option key={a.id} value={`acc:${a.id}`}>
                      حساب: {a.name}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={LABEL}>{t('ttMethod')}</span>
                <select style={INPUT} value={method} onChange={(e) => setMethod(e.target.value)}>
                  {METHOD_FA.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={LABEL}>{t('mfReference')}</span>
                <input
                  style={INPUT}
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                />
              </label>
              <button type="submit" style={BTN_PRIMARY} disabled={busy === paying.id}>
                {t('mfRecordPayment')}
              </button>
              <button type="button" style={BTN} onClick={() => setPaying(null)}>
                {t('ttCancelBtn')}
              </button>
            </form>
          </section>
        ) : null}

        <section style={CARD}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <button type="button" style={filter === '' ? CHIP_ON : CHIP} onClick={() => setFilter('')}>
              همه ({summary.total})
            </button>
            {statuses.map((s) => (
              <button
                key={s}
                type="button"
                style={filter === s ? CHIP_ON : CHIP}
                onClick={() => setFilter(s)}
              >
                {STATUS_FA[s] ?? s}
              </button>
            ))}
            <input
              style={{ ...INPUT, flex: '1 1 180px' }}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('mfSearch')}
            />
          </div>

          {shown.length === 0 ? (
            <p style={EMPTY}>{t('mfNoBills')}</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                <thead>
                  <tr>
                    <th style={TH}>{t('ttNumber')}</th>
                    <th style={TH}>{t('ttPayer')}</th>
                    <th style={TH}>{t('ttType')}</th>
                    <th style={TH}>{t('ttStatus')}</th>
                    <th style={{ ...TH, textAlign: 'end' }}>{t('ttAmount')}</th>
                    <th style={TH}> </th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((b) => (
                    <tr key={b.id}>
                      <td style={{ ...TD, fontFamily: 'ui-monospace, monospace' }}>{b.billNo}</td>
                      <td style={TD}>
                        {b.payerName}
                        {b.payerPhone ? (
                          <span style={{ color: 'var(--muted)', fontSize: 12 }}> · {b.payerPhone}</span>
                        ) : null}
                      </td>
                      <td style={TD}>{TYPE_FA[b.type] ?? b.type}</td>
                      <td style={{ ...TD, color: STATUS_COLOR[b.status] ?? 'inherit', fontWeight: 700 }}>
                        {STATUS_FA[b.status] ?? b.status}
                      </td>
                      <td style={{ ...TD, textAlign: 'end', fontWeight: 700 }}>{money(b.amount)}</td>
                      <td style={{ ...TD, whiteSpace: 'nowrap' }}>
                        {b.status === 'UNPAID' ? (
                          <>
                            <button
                              type="button"
                              style={BTN_SM}
                              disabled={busy === b.id}
                              onClick={() => {
                                setPaying(b);
                                setError('');
                              }}
                            >
                              {t('mfCollect')}
                            </button>{' '}
                            <button
                              type="button"
                              style={{ ...BTN_SM, color: 'var(--danger)' }}
                              disabled={busy === b.id}
                              onClick={() => void cancel(b)}
                            >
                              {t('mfVoid')}
                            </button>
                          </>
                        ) : (
                          <span style={{ color: 'var(--muted)', fontSize: 13 }}>
                            {b.paidAt ? new Date(b.paidAt).toLocaleDateString('fa-IR') : '—'}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}

const CARD: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 12,
  padding: 16,
  display: 'grid',
  gap: 12,
};

const H2: React.CSSProperties = { margin: 0, fontSize: 17 };

const FORM: React.CSSProperties = {
  display: 'grid',
  gap: 12,
  gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
  alignItems: 'end',
};

const LABEL: React.CSSProperties = { fontSize: 13, color: 'var(--muted)' };

const INPUT: React.CSSProperties = {
  padding: '9px 11px',
  borderRadius: 9,
  border: '1px solid var(--border)',
  background: 'var(--bg)',
  color: 'var(--text)',
  fontSize: 15,
  fontFamily: 'inherit',
  minHeight: 40,
};

const BTN: React.CSSProperties = {
  padding: '10px 16px',
  borderRadius: 9,
  border: '1px solid var(--border)',
  background: 'var(--surface)',
  color: 'var(--text)',
  cursor: 'pointer',
  fontSize: 15,
  fontFamily: 'inherit',
  minHeight: 44,
};

const BTN_PRIMARY: React.CSSProperties = {
  ...BTN,
  background: 'var(--accent)',
  color: '#fff',
  border: 'none',
  fontWeight: 700,
};

const BTN_SM: React.CSSProperties = {
  ...BTN,
  padding: '6px 12px',
  fontSize: 13,
  minHeight: 36,
};

const CHIP: React.CSSProperties = {
  ...BTN,
  padding: '6px 14px',
  fontSize: 13,
  minHeight: 36,
};

const CHIP_ON: React.CSSProperties = {
  ...CHIP,
  background: 'var(--accent)',
  color: '#fff',
  border: 'none',
  fontWeight: 700,
};

const TH: React.CSSProperties = {
  textAlign: 'start',
  padding: '8px 10px',
  borderBottom: '1px solid var(--border)',
  color: 'var(--muted)',
  fontWeight: 600,
  whiteSpace: 'nowrap',
};

const TD: React.CSSProperties = {
  padding: '10px',
  borderBottom: '1px solid var(--border)',
};

const EMPTY: React.CSSProperties = {
  padding: 32,
  textAlign: 'center',
  color: 'var(--muted)',
};

const ALERT: React.CSSProperties = {
  padding: 12,
  borderRadius: 10,
  background: 'color-mix(in srgb, var(--danger) 13%, transparent)',
  color: 'var(--danger)',
};

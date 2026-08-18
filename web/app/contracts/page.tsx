'use client';

/**
 * قراردادها و اقساطشان.
 *
 * هشت مسیر API داشت و هیچ صفحه‌ای صدایشان نمی‌زد.  قرارداد اجارهٔ مغازه،
 * قرارداد بنکدار، قرارداد پیمانکار — همه جایی ثبت می‌شدند که فقط با
 * `curl` قابل دیدن بود.
 *
 * دو چیز که این صفحه باید جواب بدهد و بقیه فرع‌اند:
 *
 *   **کدام قرارداد نزدیک انقضاست؟** — قرارداد اجاره‌ای که یادت برود،
 *   خودش را با افزایش اجاره یادآوری می‌کند.
 *
 *   **کدام قسط عقب افتاده؟** — تاریخ سررسیدِ گذشته با وضعیت پرداخت‌نشده،
 *   تنها چیزی است که باید قرمز باشد.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import AppShell from '../../components/AppShell';
import { api } from '../../lib/api';
import { useI18n } from '../../lib/i18n-context';

type Payment = {
  id: string;
  contractId?: string;
  amount: string | number;
  dueDate: string;
  paidAt: string | null;
  status: string;
  note: string | null;
};

type Contract = {
  id: string;
  contractNo: string;
  title: string;
  type: string;
  status: string;
  partyName: string;
  partyPhone: string | null;
  amount: string | number;
  startDate: string | null;
  endDate: string | null;
  description: string | null;
  payments?: Payment[];
};

/** همان مقادیری که `CONTRACT_TYPES` در DTO می‌پذیرد. */
const TYPE_FA: Record<string, string> = {
  PURCHASE: 'خرید',
  SALE: 'فروش',
  SERVICE: 'خدمات',
  CONSTRUCTION: 'پیمانکاری',
  EMPLOYMENT: 'استخدام',
  RENT: 'اجاره',
  OTHER: 'سایر',
};

const STATUS_FA: Record<string, string> = {
  DRAFT: 'پیش‌نویس',
  ACTIVE: 'جاری',
  SUSPENDED: 'معلق',
  COMPLETED: 'خاتمه‌یافته',
  TERMINATED: 'فسخ‌شده',
};

const STATUS_COLOR: Record<string, string> = {
  DRAFT: '#6b7280',
  ACTIVE: 'var(--success)',
  SUSPENDED: 'var(--warning)',
  COMPLETED: '#1d4ed8',
  TERMINATED: 'var(--danger)',
};

/** گام بعدی طبیعی هر وضعیت — تا کاربر از فهرست پنج‌تایی انتخاب نکند. */
const NEXT_STATUS: Record<string, { to: string; label: string }[]> = {
  DRAFT: [{ to: 'ACTIVE', label: 'فعال‌سازی' }],
  ACTIVE: [
    { to: 'COMPLETED', label: 'خاتمه' },
    { to: 'SUSPENDED', label: 'تعلیق' },
    { to: 'TERMINATED', label: 'فسخ' },
  ],
  SUSPENDED: [
    { to: 'ACTIVE', label: 'ازسرگیری' },
    { to: 'TERMINATED', label: 'فسخ' },
  ],
  COMPLETED: [],
  TERMINATED: [],
};

const money = (v: string | number | null | undefined) =>
  v === null || v === undefined || v === '' ? '—' : Number(v).toLocaleString('fa-IR');

function localDate(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * روز تا انقضا.
 *
 * با اجزای محلی حساب می‌شود نه با اختلاف خام میلی‌ثانیه: قراردادی که
 * فردا ساعت ۹ صبح تمام می‌شود «۰ روز» نیست، «۱ روز» است.
 */
function daysLeft(endDate: string | null): number | null {
  if (!endDate) return null;
  const end = new Date(endDate);
  const a = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  const now = new Date();
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((a.getTime() - b.getTime()) / 86_400_000);
}

const EXPIRY_WARN_DAYS = 30;

type Draft = {
  contractNo: string;
  title: string;
  type: string;
  partyName: string;
  partyPhone: string;
  amount: string;
  startDate: string;
  endDate: string;
  description: string;
};

const EMPTY_DRAFT: Draft = {
  contractNo: '',
  title: '',
  type: 'SERVICE',
  partyName: '',
  partyPhone: '',
  amount: '',
  startDate: localDate(),
  endDate: '',
  description: '',
};

export default function ContractsPage() {
  const { t } = useI18n();
  const { locale } = useI18n();

  const [list, setList] = useState<Contract[]>([]);
  const [filter, setFilter] = useState('');
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [open, setOpen] = useState<string | null>(null);
  const [detail, setDetail] = useState<Contract | null>(null);

  const [payAmount, setPayAmount] = useState('');
  const [payDue, setPayDue] = useState(localDate());
  const [payNote, setPayNote] = useState('');

  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  /** ⚠️ در مسیر موفق خطا را پاک نمی‌کند — آن کارِ شروعِ هر عملیات است. */
  const load = useCallback(async () => {
    try {
      const query = filter ? `?status=${filter}` : '';
      setList(await api<Contract[]>(`/contracts${query}`));
    } catch (caught) {
      setError((caught as Error).message);
    }
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadDetail = useCallback(async (id: string) => {
    try {
      setDetail(await api<Contract>(`/contracts/${id}`));
    } catch (caught) {
      setError((caught as Error).message);
    }
  }, []);

  useEffect(() => {
    if (open) void loadDetail(open);
    else setDetail(null);
  }, [open, loadDetail]);

  const flash = (m: string) => {
    setNote(m);
    window.setTimeout(() => setNote(''), 2500);
  };

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');

    if (!draft.contractNo.trim() || !draft.title.trim() || !draft.partyName.trim()) {
      setError('شماره، عنوان و نام طرف قرارداد الزامی است');
      return;
    }

    const body: Record<string, unknown> = {
      contractNo: draft.contractNo.trim(),
      title: draft.title.trim(),
      type: draft.type,
      partyName: draft.partyName.trim(),
    };
    if (draft.partyPhone.trim()) body.partyPhone = draft.partyPhone.trim();
    if (draft.amount.trim()) body.amount = Number(draft.amount);
    if (draft.startDate) body.startDate = draft.startDate;
    if (draft.endDate) body.endDate = draft.endDate;
    if (draft.description.trim()) body.description = draft.description.trim();

    setBusy('create');
    try {
      await api('/contracts', { method: 'POST', body });
      flash('قرارداد ثبت شد');
      setDraft(EMPTY_DRAFT);
      await load();
    } catch (caught) {
      // شمارهٔ تکراری را سرور رد می‌کند — و از مهاجرت ۰۳۵ به بعد، فقط
      // در محدودهٔ همین شرکت.
      setError((caught as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const setStatus = async (c: Contract, status: string) => {
    setError('');
    setBusy(c.id);
    try {
      await api(`/contracts/${c.id}/status`, { method: 'PATCH', body: { status } });
      flash(`وضعیت به «${STATUS_FA[status] ?? status}» تغییر کرد`);
      await load();
      if (open === c.id) await loadDetail(c.id);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const addPayment = async () => {
    if (!detail) return;
    setError('');
    const amount = Number(payAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('مبلغ قسط باید عددی بزرگ‌تر از صفر باشد');
      return;
    }
    setBusy('pay');
    try {
      await api(`/contracts/${detail.id}/payments`, {
        method: 'POST',
        body: { amount, dueDate: payDue, note: payNote.trim() || undefined },
      });
      flash('قسط افزوده شد');
      setPayAmount('');
      setPayNote('');
      await loadDetail(detail.id);
      await load();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const payInstalment = async (p: Payment) => {
    setError('');
    setBusy(p.id);
    try {
      await api(`/contracts/payments/${p.id}/pay`, { method: 'PATCH' });
      flash('قسط پرداخت شد');
      if (detail) await loadDetail(detail.id);
      await load();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(null);
    }
  };

  /** جست‌وجو در خود صفحه: فهرست قراردادها کوتاه است. */
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.contractNo.toLowerCase().includes(q) ||
        c.partyName.toLowerCase().includes(q),
    );
  }, [list, search]);

  const expiring = useMemo(
    () =>
      list.filter((c) => {
        if (c.status !== 'ACTIVE') return false;
        const d = daysLeft(c.endDate);
        return d !== null && d <= EXPIRY_WARN_DAYS;
      }),
    [list],
  );

  const overdueOf = (c: Contract) =>
    (c.payments ?? []).filter(
      (p) => p.status !== 'PAID' && new Date(p.dueDate).getTime() < Date.now(),
    ).length;

  const totalOverdue = list.reduce((s, c) => s + overdueOf(c), 0);

  return (
    <AppShell title={t('menuContracts')}>
      <div style={{ display: 'grid', gap: 16 }}>
        {error ? (
          <div role="alert" style={ALERT}>
            {error}
          </div>
        ) : null}
        {note ? (
          <div role="status" style={{ ...ALERT, background: 'color-mix(in srgb, var(--success) 13%, transparent)', color: 'var(--success)' }}>
            {note}
          </div>
        ) : null}

        {/* دو هشدارِ تنها چیزی که واقعاً فوری‌اند؛ بقیهٔ صفحه مرجع است. */}
        {expiring.length > 0 || totalOverdue > 0 ? (
          <div
            role="status"
            style={{ ...ALERT, background: 'color-mix(in srgb, var(--warning) 13%, transparent)', color: 'var(--warning)', display: 'grid', gap: 4 }}
          >
            {expiring.length > 0 ? (
              <span>
                {expiring.length} قرارداد جاری تا {EXPIRY_WARN_DAYS} روز آینده تمام می‌شود:{' '}
                {expiring.map((c) => c.contractNo).join('، ')}
              </span>
            ) : null}
            {totalOverdue > 0 ? <span>{totalOverdue} قسط سررسیدگذشته و پرداخت‌نشده</span> : null}
          </div>
        ) : null}

        <section style={CARD}>
          <h2 style={H2}>{t('ctrNew')}</h2>
          <form onSubmit={create} style={FORM}>
            <Field label={t('colNumber')}>
              <input
                value={draft.contractNo}
                onChange={(e) => setDraft({ ...draft, contractNo: e.target.value })}
                style={INPUT}
                placeholder="C-1001"
              />
            </Field>
            <Field label={t('title')}>
              <input
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                style={INPUT}
                placeholder="اجارهٔ مغازه"
              />
            </Field>
            <Field label={t('returnType')}>
              <select
                value={draft.type}
                onChange={(e) => setDraft({ ...draft, type: e.target.value })}
                style={INPUT}
              >
                {Object.entries(TYPE_FA).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="طرف قرارداد">
              <input
                value={draft.partyName}
                onChange={(e) => setDraft({ ...draft, partyName: e.target.value })}
                style={INPUT}
              />
            </Field>
            <Field label={t('phone')}>
              <input
                value={draft.partyPhone}
                onChange={(e) => setDraft({ ...draft, partyPhone: e.target.value })}
                style={INPUT}
                inputMode="tel"
              />
            </Field>
            <Field label="مبلغ کل">
              <input
                value={draft.amount}
                onChange={(e) => setDraft({ ...draft, amount: e.target.value })}
                style={INPUT}
                inputMode="numeric"
              />
            </Field>
            <Field label={t('fromDate')}>
              <input
                type="date"
                value={draft.startDate}
                onChange={(e) => setDraft({ ...draft, startDate: e.target.value })}
                style={INPUT}
              />
            </Field>
            <Field label={t('toDate')}>
              <input
                type="date"
                value={draft.endDate}
                onChange={(e) => setDraft({ ...draft, endDate: e.target.value })}
                style={INPUT}
              />
            </Field>
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button type="submit" disabled={busy === 'create'} style={BTN_PRIMARY}>
                {busy === 'create' ? '…' : 'ثبت قرارداد'}
              </button>
            </div>
          </form>
        </section>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button type="button" onClick={() => setFilter('')} style={filter ? CHIP : CHIP_ON}>
            همه ({list.length})
          </button>
          {Object.entries(STATUS_FA).map(([k, v]) => (
            <button
              key={k}
              type="button"
              onClick={() => setFilter(k)}
              style={filter === k ? CHIP_ON : CHIP}
            >
              {v}
            </button>
          ))}
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="جست‌وجو…"
            style={{ ...INPUT, minWidth: 180, marginInlineStart: 'auto' }}
          />
        </div>

        {visible.length === 0 ? (
          <p style={EMPTY}>{t('ctrNone')}</p>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {visible.map((c) => {
              const left = daysLeft(c.endDate);
              const overdue = overdueOf(c);
              const paid = (c.payments ?? []).filter((p) => p.status === 'PAID').length;
              const totalPayments = (c.payments ?? []).length;

              return (
                <article
                  key={c.id}
                  style={{
                    ...CARD,
                    gap: 8,
                    borderInlineStartWidth: 4,
                    borderInlineStartStyle: 'solid',
                    borderInlineStartColor: STATUS_COLOR[c.status] ?? 'var(--border)',
                  }}
                >
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'baseline' }}>
                    <strong style={{ fontSize: 17 }}>{c.title}</strong>
                    <span style={{ color: 'var(--muted)' }}>{c.contractNo}</span>
                    <span style={{ color: 'var(--muted)' }}>· {TYPE_FA[c.type] ?? c.type}</span>
                    <span>{c.partyName}</span>
                    {c.partyPhone ? (
                      <a href={`tel:${c.partyPhone}`} style={{ color: 'var(--accent)' }}>
                        {c.partyPhone}
                      </a>
                    ) : null}
                    <strong style={{ marginInlineStart: 'auto' }}>{money(c.amount)} ریال</strong>
                    <span style={{ color: STATUS_COLOR[c.status], fontWeight: 700 }}>
                      {STATUS_FA[c.status] ?? c.status}
                    </span>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      gap: 12,
                      flexWrap: 'wrap',
                      fontSize: 14,
                      color: 'var(--muted)',
                    }}
                  >
                    {c.startDate ? (
                      <span>از {new Date(c.startDate).toLocaleDateString(locale)}</span>
                    ) : null}
                    {c.endDate ? (
                      <span
                        style={{
                          color:
                            left !== null && c.status === 'ACTIVE' && left <= EXPIRY_WARN_DAYS
                              ? left < 0
                                ? 'var(--danger)'
                                : 'var(--warning)'
                              : 'var(--muted)',
                          fontWeight:
                            left !== null && c.status === 'ACTIVE' && left <= EXPIRY_WARN_DAYS
                              ? 700
                              : 400,
                        }}
                      >
                        تا {new Date(c.endDate).toLocaleDateString(locale)}
                        {c.status === 'ACTIVE' && left !== null
                          ? left < 0
                            ? ` (${Math.abs(left)} روز گذشته)`
                            : ` (${left} روز مانده)`
                          : ''}
                      </span>
                    ) : null}
                    {totalPayments > 0 ? (
                      <span>
                        اقساط: {paid} از {totalPayments} پرداخت‌شده
                      </span>
                    ) : null}
                    {overdue > 0 ? (
                      <strong style={{ color: 'var(--danger)' }}>{overdue} قسط عقب‌افتاده</strong>
                    ) : null}
                  </div>

                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => setOpen(open === c.id ? null : c.id)}
                      style={BTN_SM}
                    >
                      {open === c.id ? 'بستن اقساط' : 'اقساط'}
                    </button>
                    {(NEXT_STATUS[c.status] ?? []).map((s) => (
                      <button
                        key={s.to}
                        type="button"
                        onClick={() => setStatus(c, s.to)}
                        disabled={busy === c.id}
                        style={
                          s.to === 'TERMINATED' ? { ...BTN_SM, color: 'var(--danger)' } : BTN_SM
                        }
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>

                  {open === c.id && detail ? (
                    <div style={{ display: 'grid', gap: 10, marginTop: 4 }}>
                      {detail.payments && detail.payments.length > 0 ? (
                        <div style={{ overflowX: 'auto' }}>
                          <table style={TABLE}>
                            <thead>
                              <tr>
                                {['سررسید', 'مبلغ', 'وضعیت', 'یادداشت', ''].map((h) => (
                                  <th key={h} style={TH}>
                                    {h}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {detail.payments.map((p) => {
                                const late =
                                  p.status !== 'PAID' &&
                                  new Date(p.dueDate).getTime() < Date.now();
                                return (
                                  <tr key={p.id}>
                                    <td
                                      style={{
                                        ...TD,
                                        color: late ? 'var(--danger)' : undefined,
                                        fontWeight: late ? 700 : 400,
                                      }}
                                    >
                                      {new Date(p.dueDate).toLocaleDateString(locale)}
                                      {late ? ' (عقب‌افتاده)' : ''}
                                    </td>
                                    <td style={{ ...TD, textAlign: 'left' }}>{money(p.amount)}</td>
                                    <td style={TD}>
                                      {p.status === 'PAID' ? (
                                        <span style={{ color: 'var(--success)' }}>
                                          {t('paid')}
                                          {p.paidAt
                                            ? ` · ${new Date(p.paidAt).toLocaleDateString(locale)}`
                                            : ''}
                                        </span>
                                      ) : (
                                        <span style={{ color: 'var(--muted)' }}>{t('unpaid')}</span>
                                      )}
                                    </td>
                                    <td style={{ ...TD, color: 'var(--muted)' }}>
                                      {p.note ?? '—'}
                                    </td>
                                    <td style={TD}>
                                      {p.status !== 'PAID' ? (
                                        <button
                                          type="button"
                                          onClick={() => payInstalment(p)}
                                          disabled={busy === p.id}
                                          style={BTN_SM}
                                        >
                                          {t('markCommissionPaid')}
                                        </button>
                                      ) : null}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <p style={{ margin: 0, color: 'var(--muted)', fontSize: 14 }}>
                          {t('ctrNoInstalment')}
                        </p>
                      )}

                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                        <Field label="مبلغ قسط">
                          <input
                            value={payAmount}
                            onChange={(e) => setPayAmount(e.target.value)}
                            style={{ ...INPUT, maxWidth: 160 }}
                            inputMode="numeric"
                          />
                        </Field>
                        <Field label={t('dueDate')}>
                          <input
                            type="date"
                            value={payDue}
                            onChange={(e) => setPayDue(e.target.value)}
                            style={INPUT}
                          />
                        </Field>
                        <Field label={t('note')}>
                          <input
                            value={payNote}
                            onChange={(e) => setPayNote(e.target.value)}
                            style={INPUT}
                          />
                        </Field>
                        <button
                          type="button"
                          onClick={addPayment}
                          disabled={busy === 'pay'}
                          style={BTN}
                        >
                          {busy === 'pay' ? '…' : 'افزودن قسط'}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'grid', gap: 4 }}>
      <span style={{ fontSize: 13, color: 'var(--muted)' }}>{label}</span>
      {children}
    </label>
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

const TABLE: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  minWidth: 560,
};

const TH: React.CSSProperties = {
  textAlign: 'start',
  padding: '8px 10px',
  fontSize: 13,
  color: 'var(--muted)',
  borderBottom: '1px solid var(--border)',
  fontWeight: 600,
};

const TD: React.CSSProperties = {
  padding: '9px 10px',
  fontSize: 14,
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

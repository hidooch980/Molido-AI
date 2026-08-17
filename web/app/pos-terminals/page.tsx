'use client';

/**
 * دستگاه‌های کارت‌خوان.
 *
 * هشت مسیر API داشت و هیچ صفحه‌ای صدایشان نمی‌زد.  هر مغازه‌ای در ایران
 * چند کارت‌خوان از چند بانک دارد و آخر ماه باید بداند کدام دستگاه به
 * کدام حساب می‌ریزد — بدون این صفحه، آن اطلاعات فقط در دفتر و حافظه
 * بود.
 *
 * چیزی که این صفحه باید بی‌درنگ جواب بدهد: **کدام دستگاه خراب است و
 * کدام حساب پشتش نشسته**.  بقیه مرجع است.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import AppShell from '../../components/AppShell';
import { api } from '../../lib/api';
import { useI18n } from '../../lib/i18n-context';

type Terminal = {
  id: string;
  terminalNo: string;
  serialNo: string | null;
  merchantId: string | null;
  bankName: string;
  pspName: string | null;
  type: string;
  status: string;
  accountNo: string | null;
  iban: string | null;
  holderName: string | null;
  location: string | null;
  simNumber: string | null;
  installedAt: string | null;
  note: string | null;
};

const TYPE_FA: Record<string, string> = { FIXED: 'ثابت', MOBILE: 'سیار' };

const STATUS_FA: Record<string, string> = {
  ACTIVE: 'فعال',
  INACTIVE: 'غیرفعال',
  UNDER_REPAIR: 'در تعمیر',
  RETURNED: 'عودت‌شده',
};

const STATUS_COLOR: Record<string, string> = {
  ACTIVE: 'var(--success)',
  INACTIVE: '#6b7280',
  UNDER_REPAIR: 'var(--warning)',
  RETURNED: 'var(--danger)',
};

/** گام بعدی طبیعی هر وضعیت. */
const NEXT_STATUS: Record<string, { to: string; label: string }[]> = {
  ACTIVE: [
    { to: 'UNDER_REPAIR', label: 'ارسال به تعمیر' },
    { to: 'INACTIVE', label: 'غیرفعال' },
  ],
  UNDER_REPAIR: [
    { to: 'ACTIVE', label: 'برگشت از تعمیر' },
    { to: 'RETURNED', label: 'عودت به بانک' },
  ],
  INACTIVE: [
    { to: 'ACTIVE', label: 'فعال‌سازی' },
    { to: 'RETURNED', label: 'عودت به بانک' },
  ],
  RETURNED: [],
};

/**
 * شبا را چهارتاچهارتا می‌شکند.
 *
 * ۲۴ رقم پشت سر هم با چشم قابل مقایسه نیست، و مقایسهٔ شبا دقیقاً کاری
 * است که آخر ماه انجام می‌شود.
 */
function groupIban(iban: string): string {
  const clean = iban.replace(/\s+/g, '').toUpperCase();
  return clean.replace(/(.{4})/g, '$1 ').trim();
}

type Draft = {
  terminalNo: string;
  bankName: string;
  pspName: string;
  type: string;
  serialNo: string;
  merchantId: string;
  accountNo: string;
  iban: string;
  holderName: string;
  location: string;
  simNumber: string;
};

const EMPTY_DRAFT: Draft = {
  terminalNo: '',
  bankName: '',
  pspName: '',
  type: 'FIXED',
  serialNo: '',
  merchantId: '',
  accountNo: '',
  iban: '',
  holderName: '',
  location: '',
  simNumber: '',
};

export default function PosTerminalsPage() {
  const { locale } = useI18n();

  const [list, setList] = useState<Terminal[]>([]);
  const [banks, setBanks] = useState<string[]>([]);
  const [psps, setPsps] = useState<string[]>([]);
  const [filter, setFilter] = useState('');
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [editing, setEditing] = useState<string | null>(null);

  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  /** ⚠️ در مسیر موفق خطا را پاک نمی‌کند — آن کارِ شروعِ هر عملیات است. */
  const load = useCallback(async () => {
    try {
      const [term, b] = await Promise.all([
        api<Terminal[]>('/pos-terminals'),
        // فهرست بانک‌ها ثابت است؛ اگر یک بار آمده دوباره نمی‌گیریمش.
        banks.length
          ? Promise.resolve({ banks, psps })
          : api<{ banks: string[]; psps: string[] }>('/pos-terminals/banks'),
      ]);
      setList(term);
      if (!banks.length) {
        const got = b as { banks: string[]; psps: string[] };
        setBanks(got.banks ?? []);
        setPsps(got.psps ?? []);
        setDraft((d) => (d.bankName ? d : { ...d, bankName: got.banks?.[0] ?? '' }));
      }
    } catch (caught) {
      setError((caught as Error).message);
    }
  }, [banks, psps]);

  useEffect(() => {
    void load();
    // فقط یک بار؛ `load` به banks وابسته است و حلقه می‌سازد.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reload = useCallback(async () => {
    try {
      setList(await api<Terminal[]>('/pos-terminals'));
    } catch (caught) {
      setError((caught as Error).message);
    }
  }, []);

  const flash = (m: string) => {
    setNote(m);
    window.setTimeout(() => setNote(''), 2500);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');

    if (!draft.terminalNo.trim()) {
      setError('شمارهٔ پایانه الزامی است');
      return;
    }
    if (!draft.bankName) {
      setError('بانک را انتخاب کنید');
      return;
    }
    // شبا ۲۴ رقم پس از IR است؛ گرفتنش اینجا از یک رفت‌وبرگشت جلوگیری
    // می‌کند و خطا را کنار همان میدان نگه می‌دارد.
    const iban = draft.iban.replace(/\s+/g, '').toUpperCase();
    if (iban && !/^IR\d{24}$/.test(iban)) {
      setError('شبا باید با IR شروع شود و ۲۴ رقم داشته باشد');
      return;
    }

    const body: Record<string, unknown> = {
      terminalNo: draft.terminalNo.trim(),
      bankName: draft.bankName,
      type: draft.type,
    };
    for (const [key, value] of Object.entries({
      pspName: draft.pspName,
      serialNo: draft.serialNo,
      merchantId: draft.merchantId,
      accountNo: draft.accountNo,
      holderName: draft.holderName,
      location: draft.location,
      simNumber: draft.simNumber,
    })) {
      if (value.trim()) body[key] = value.trim();
    }
    if (iban) body.iban = iban;

    setBusy('save');
    try {
      if (editing) {
        // `terminalNo` در ویرایش فرستاده نمی‌شود: DTO به‌روزرسانی آن را
        // نمی‌پذیرد و شمارهٔ پایانه روی خودِ دستگاه حک شده است.
        const { terminalNo, ...rest } = body as Record<string, unknown>;
        void terminalNo;
        await api(`/pos-terminals/${editing}`, { method: 'PATCH', body: rest });
        flash('ویرایش شد');
      } else {
        await api('/pos-terminals', { method: 'POST', body });
        flash('دستگاه ثبت شد');
      }
      setDraft({ ...EMPTY_DRAFT, bankName: banks[0] ?? '' });
      setEditing(null);
      await reload();
    } catch (caught) {
      // شمارهٔ تکراری را قید دیتابیس می‌گیرد و از مهاجرت ۰۳۵ به بعد
      // فقط در محدودهٔ همین شرکت.
      setError((caught as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const startEdit = (t: Terminal) => {
    setEditing(t.id);
    setDraft({
      terminalNo: t.terminalNo,
      bankName: t.bankName,
      pspName: t.pspName ?? '',
      type: t.type,
      serialNo: t.serialNo ?? '',
      merchantId: t.merchantId ?? '',
      accountNo: t.accountNo ?? '',
      iban: t.iban ?? '',
      holderName: t.holderName ?? '',
      location: t.location ?? '',
      simNumber: t.simNumber ?? '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const setStatus = async (t: Terminal, status: string) => {
    setError('');
    setBusy(t.id);
    try {
      await api(`/pos-terminals/${t.id}/status`, { method: 'PATCH', body: { status } });
      flash(`وضعیت به «${STATUS_FA[status] ?? status}» تغییر کرد`);
      await reload();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const remove = async (t: Terminal) => {
    if (!window.confirm(`دستگاه ${t.terminalNo} حذف شود؟`)) return;
    setError('');
    setBusy(t.id);
    try {
      await api(`/pos-terminals/${t.id}`, { method: 'DELETE' });
      flash('حذف شد');
      await reload();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return list.filter((term) => {
      if (filter && term.status !== filter) return false;
      if (!q) return true;
      return (
        term.terminalNo.toLowerCase().includes(q) ||
        term.bankName.toLowerCase().includes(q) ||
        (term.location ?? '').toLowerCase().includes(q) ||
        (term.merchantId ?? '').toLowerCase().includes(q)
      );
    });
  }, [list, filter, search]);

  /** خلاصه‌ای که مدیر باید بدون کلیک ببیند. */
  const summary = useMemo(() => {
    const byBank: Record<string, number> = {};
    for (const term of list) byBank[term.bankName] = (byBank[term.bankName] ?? 0) + 1;
    return {
      total: list.length,
      active: list.filter((term) => term.status === 'ACTIVE').length,
      broken: list.filter((term) => term.status === 'UNDER_REPAIR').length,
      noAccount: list.filter((term) => term.status === 'ACTIVE' && !term.iban && !term.accountNo).length,
      banks: Object.entries(byBank).sort((a, b) => b[1] - a[1]),
    };
  }, [list]);

  return (
    <AppShell title="کارت‌خوان‌ها">
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

        {/* دو چیزی که واقعاً فوری‌اند: دستگاه خراب، و دستگاه فعالی که
            معلوم نیست پولش کجا می‌رود. */}
        {summary.broken > 0 || summary.noAccount > 0 ? (
          <div
            role="status"
            style={{ ...ALERT, background: 'color-mix(in srgb, var(--warning) 13%, transparent)', color: 'var(--warning)', display: 'grid', gap: 4 }}
          >
            {summary.broken > 0 ? <span>{summary.broken} دستگاه در تعمیر است</span> : null}
            {summary.noAccount > 0 ? (
              <span>
                {summary.noAccount} دستگاه فعال بدون شبا یا شماره حساب — معلوم نیست پولش به
                کدام حساب می‌رود
              </span>
            ) : null}
          </div>
        ) : null}

        <section style={CARD}>
          <h2 style={H2}>{editing ? 'ویرایش دستگاه' : 'دستگاه تازه'}</h2>
          <form onSubmit={submit} style={FORM}>
            <Field label="شمارهٔ پایانه">
              <input
                value={draft.terminalNo}
                onChange={(e) => setDraft({ ...draft, terminalNo: e.target.value })}
                style={INPUT}
                disabled={!!editing}
                inputMode="numeric"
                placeholder="12345678"
              />
            </Field>
            <Field label="بانک">
              <select
                value={draft.bankName}
                onChange={(e) => setDraft({ ...draft, bankName: e.target.value })}
                style={INPUT}
              >
                <option value="">— انتخاب —</option>
                {banks.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="شرکت PSP">
              <select
                value={draft.pspName}
                onChange={(e) => setDraft({ ...draft, pspName: e.target.value })}
                style={INPUT}
              >
                <option value="">—</option>
                {psps.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="نوع">
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
            <Field label="شمارهٔ پذیرنده">
              <input
                value={draft.merchantId}
                onChange={(e) => setDraft({ ...draft, merchantId: e.target.value })}
                style={INPUT}
                inputMode="numeric"
              />
            </Field>
            <Field label="سریال دستگاه">
              <input
                value={draft.serialNo}
                onChange={(e) => setDraft({ ...draft, serialNo: e.target.value })}
                style={INPUT}
              />
            </Field>
            <Field label="شبا">
              <input
                value={draft.iban}
                onChange={(e) => setDraft({ ...draft, iban: e.target.value })}
                style={INPUT}
                placeholder="IR…"
              />
            </Field>
            <Field label="شماره حساب">
              <input
                value={draft.accountNo}
                onChange={(e) => setDraft({ ...draft, accountNo: e.target.value })}
                style={INPUT}
                inputMode="numeric"
              />
            </Field>
            <Field label="صاحب حساب">
              <input
                value={draft.holderName}
                onChange={(e) => setDraft({ ...draft, holderName: e.target.value })}
                style={INPUT}
              />
            </Field>
            <Field label="محل نصب">
              <input
                value={draft.location}
                onChange={(e) => setDraft({ ...draft, location: e.target.value })}
                style={INPUT}
                placeholder="صندوق ۱"
              />
            </Field>
            <Field label="شمارهٔ سیم‌کارت">
              <input
                value={draft.simNumber}
                onChange={(e) => setDraft({ ...draft, simNumber: e.target.value })}
                style={INPUT}
                inputMode="tel"
              />
            </Field>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <button type="submit" disabled={busy === 'save'} style={BTN_PRIMARY}>
                {busy === 'save' ? '…' : editing ? 'ذخیره' : 'افزودن'}
              </button>
              {editing ? (
                <button
                  type="button"
                  style={BTN}
                  onClick={() => {
                    setEditing(null);
                    setDraft({ ...EMPTY_DRAFT, bankName: banks[0] ?? '' });
                  }}
                >
                  انصراف
                </button>
              ) : null}
            </div>
          </form>
        </section>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button type="button" onClick={() => setFilter('')} style={filter ? CHIP : CHIP_ON}>
            همه ({summary.total})
          </button>
          {Object.entries(STATUS_FA).map(([k, v]) => (
            <button
              key={k}
              type="button"
              onClick={() => setFilter(k)}
              style={filter === k ? CHIP_ON : CHIP}
            >
              {v} ({list.filter((term) => term.status === k).length})
            </button>
          ))}
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="جست‌وجو…"
            style={{ ...INPUT, minWidth: 180, marginInlineStart: 'auto' }}
          />
        </div>

        {summary.banks.length > 1 ? (
          <div style={{ fontSize: 14, color: 'var(--muted)' }}>
            {summary.banks.map(([b, n]) => `${b}: ${n}`).join(' · ')}
          </div>
        ) : null}

        {visible.length === 0 ? (
          <p style={EMPTY}>دستگاهی یافت نشد</p>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {visible.map((term) => (
              <article
                key={term.id}
                style={{
                  ...CARD,
                  gap: 8,
                  borderInlineStartWidth: 4,
                  borderInlineStartStyle: 'solid',
                  borderInlineStartColor: STATUS_COLOR[term.status] ?? 'var(--border)',
                  opacity: term.status === 'RETURNED' ? 0.6 : 1,
                }}
              >
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'baseline' }}>
                  <strong style={{ fontSize: 17 }}>{term.terminalNo}</strong>
                  <span>{term.bankName}</span>
                  {term.pspName ? <span style={{ color: 'var(--muted)' }}>· {term.pspName}</span> : null}
                  <span style={{ color: 'var(--muted)' }}>· {TYPE_FA[term.type] ?? term.type}</span>
                  {term.location ? <span style={{ color: 'var(--muted)' }}>· {term.location}</span> : null}
                  <span
                    style={{
                      marginInlineStart: 'auto',
                      color: STATUS_COLOR[term.status],
                      fontWeight: 700,
                    }}
                  >
                    {STATUS_FA[term.status] ?? term.status}
                  </span>
                </div>

                <div
                  style={{
                    display: 'flex',
                    gap: 14,
                    flexWrap: 'wrap',
                    fontSize: 14,
                    color: 'var(--muted)',
                  }}
                >
                  {term.iban ? (
                    // شبا با فاصله، تا آخر ماه بشود با صورت‌حساب بانک
                    // مقایسه‌اش کرد.
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {groupIban(term.iban)}
                    </span>
                  ) : term.accountNo ? (
                    <span>حساب {term.accountNo}</span>
                  ) : (
                    <strong style={{ color: 'var(--warning)' }}>بدون حساب</strong>
                  )}
                  {term.holderName ? <span>{term.holderName}</span> : null}
                  {term.merchantId ? <span>پذیرنده {term.merchantId}</span> : null}
                  {term.serialNo ? <span>سریال {term.serialNo}</span> : null}
                  {term.simNumber ? <span>سیم‌کارت {term.simNumber}</span> : null}
                  {term.installedAt ? (
                    <span>نصب {new Date(term.installedAt).toLocaleDateString(locale)}</span>
                  ) : null}
                </div>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button type="button" onClick={() => startEdit(term)} style={BTN_SM}>
                    ویرایش
                  </button>
                  {(NEXT_STATUS[term.status] ?? []).map((s) => (
                    <button
                      key={s.to}
                      type="button"
                      onClick={() => setStatus(term, s.to)}
                      disabled={busy === term.id}
                      style={s.to === 'RETURNED' ? { ...BTN_SM, color: 'var(--danger)' } : BTN_SM}
                    >
                      {s.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => remove(term)}
                    disabled={busy === term.id}
                    style={{ ...BTN_SM, color: 'var(--danger)', marginInlineStart: 'auto' }}
                  >
                    حذف
                  </button>
                </div>
              </article>
            ))}
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
  gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
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

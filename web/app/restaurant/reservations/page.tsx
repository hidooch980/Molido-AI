'use client';

/**
 * رزرو میز.
 *
 * سه مسیر API داشت و هیچ صفحه‌ای صدایشان نمی‌زد — یعنی تلفن که زنگ
 * می‌زد، رزرو روی کاغذ نوشته می‌شد.
 *
 * این صفحه کنار تلفن استفاده می‌شود، وقتی مشتری پشت خط منتظر است.  پس
 * دو چیز مهم است: فرم کوتاه باشد، و «امروز چه کسی می‌آید» بدون هیچ
 * کلیکی دیده شود.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import AppShell from '../../../components/AppShell';
import { api } from '../../../lib/api';
import { useI18n } from '../../../lib/i18n-context';

type Table = { id: string; tableNo: string; capacity: number };

type Reservation = {
  id: string;
  tableId: string | null;
  tableNo: string | null;
  customerName: string;
  phone: string | null;
  guests: number;
  reservedAt: string;
  durationMin: number;
  status: string;
  note: string | null;
};

/**
 * وضعیت‌ها همان‌هایی‌اند که سرویس «فعال» می‌شمارد
 * (`ACTIVE_RESERVATION_STATUSES`) به‌علاوهٔ دو وضعیت پایانی.
 */
const STATUS_FA: Record<string, string> = {
  PENDING: 'در انتظار',
  CONFIRMED: 'تأیید شده',
  SEATED: 'نشسته',
  CANCELLED: 'لغو شده',
  NO_SHOW: 'نیامد',
};

const STATUS_COLOR: Record<string, string> = {
  PENDING: '#b45309',
  CONFIRMED: '#047857',
  SEATED: '#1d4ed8',
  CANCELLED: '#6b7280',
  NO_SHOW: '#b91c1c',
};

/** گام بعدی طبیعی هر وضعیت — تا متصدی مجبور نباشد از فهرست انتخاب کند. */
const NEXT_STEP: Record<string, { to: string; label: string }[]> = {
  PENDING: [
    { to: 'CONFIRMED', label: 'تأیید' },
    { to: 'CANCELLED', label: 'لغو' },
  ],
  CONFIRMED: [
    { to: 'SEATED', label: 'نشست' },
    { to: 'NO_SHOW', label: 'نیامد' },
    { to: 'CANCELLED', label: 'لغو' },
  ],
  SEATED: [],
  CANCELLED: [{ to: 'PENDING', label: 'بازگردانی' }],
  NO_SHOW: [{ to: 'PENDING', label: 'بازگردانی' }],
};

/**
 * تاریخ امروز به شکل `YYYY-MM-DD` **محلی**.
 *
 * `toISOString().slice(0,10)` وسوسه‌انگیز است ولی UTC می‌دهد: در تهران
 * تا ساعت ۳:۳۰ بامداد، روزِ دیروز را برمی‌گرداند.  همین اشتباه یک بار
 * در MCP رخ داد.
 */
function localDate(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** `datetime-local` هم مقدار محلی می‌خواهد، نه UTC. */
function localDateTime(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${localDate(d)}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

type Draft = {
  customerName: string;
  phone: string;
  guests: string;
  reservedAt: string;
  durationMin: string;
  tableId: string;
  note: string;
};

const emptyDraft = (): Draft => {
  // پیش‌فرض: یک ساعت بعد، گرد شده به نیم‌ساعت — نزدیک‌ترین حدس به
  // چیزی که پشت تلفن گفته می‌شود.
  const d = new Date(Date.now() + 3600_000);
  d.setMinutes(d.getMinutes() < 30 ? 30 : 0, 0, 0);
  if (d.getMinutes() === 0) d.setHours(d.getHours() + 1);
  return {
    customerName: '',
    phone: '',
    guests: '2',
    reservedAt: localDateTime(d),
    durationMin: '90',
    tableId: '',
    note: '',
  };
};

export default function ReservationsPage() {
  const { locale } = useI18n();

  const [list, setList] = useState<Reservation[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [date, setDate] = useState(localDate());
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  /**
   * ⚠️ در مسیر موفق خطا را **پاک نمی‌کند**.
   *
   * نسخهٔ اول اینجا `setError('')` داشت.  نتیجه‌اش این بود که هر
   * عملیاتی که خطا می‌داد و بعد فهرست را تازه می‌کرد، پیام خطایش بی‌صدا
   * محو می‌شد: «سه میز افزوده شد، سه‌تا تکراری بود» کاملاً ناپدید
   * می‌شد و کاربر فقط می‌دید تعداد میزها آن نیست که خواسته بود.
   *
   * پاک کردن خطا کارِ *شروعِ* هر عملیات است، نه کارِ بارگذاری.
   */
  const load = useCallback(async () => {
    try {
      const [r, t] = await Promise.all([
        api<Reservation[]>(`/restaurant/reservations?date=${date}`),
        api<Table[]>('/restaurant/tables'),
      ]);
      setList(r);
      setTables(t);
    } catch (caught) {
      setError((caught as Error).message);
    }
  }, [date]);

  useEffect(() => {
    void load();
  }, [load]);

  const flash = (m: string) => {
    setNote(m);
    window.setTimeout(() => setNote(''), 2500);
  };

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');

    if (!draft.customerName.trim()) {
      setError('نام مشتری را بنویسید');
      return;
    }
    if (!draft.reservedAt) {
      setError('زمان رزرو را انتخاب کنید');
      return;
    }

    const body: Record<string, unknown> = {
      customerName: draft.customerName.trim(),
      guests: Number(draft.guests) || 2,
      // `datetime-local` بدون منطقهٔ زمانی می‌دهد؛ `new Date()` آن را
      // محلی می‌خواند و `toISOString` به UTC می‌برد — همان چیزی که
      // سرور انتظار دارد.
      reservedAt: new Date(draft.reservedAt).toISOString(),
      durationMin: Number(draft.durationMin) || 90,
    };
    if (draft.phone.trim()) body.phone = draft.phone.trim();
    if (draft.tableId) body.tableId = draft.tableId;
    if (draft.note.trim()) body.note = draft.note.trim();

    setBusy('create');
    try {
      await api('/restaurant/reservations', { method: 'POST', body });
      flash('رزرو ثبت شد');
      setDraft(emptyDraft());
      // اگر رزرو برای روز دیگری بود، به همان روز می‌رویم تا کاربر
      // ببیند کارش گرفت — وگرنه فهرست دست‌نخورده می‌ماند و شبیه
      // شکست به نظر می‌رسد.
      const target = localDate(new Date(draft.reservedAt));
      if (target !== date) setDate(target);
      else await load();
    } catch (caught) {
      // تداخل رزرو همین‌جا برمی‌گردد؛ پیام سرور دقیق‌تر از هر چیزی
      // است که اینجا بنویسیم.
      setError((caught as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const setStatus = async (r: Reservation, status: string) => {
    setError('');
    setBusy(r.id);
    try {
      await api(`/restaurant/reservations/${r.id}`, {
        method: 'PATCH',
        body: { status },
      });
      setList((prev) => prev.map((x) => (x.id === r.id ? { ...x, status } : x)));
    } catch (caught) {
      setError((caught as Error).message);
      await load();
    } finally {
      setBusy(null);
    }
  };

  /** خلاصهٔ روز — چیزی که متصدی بدون هیچ کلیکی باید ببیند. */
  const summary = useMemo(() => {
    const active = list.filter((r) => ['PENDING', 'CONFIRMED', 'SEATED'].includes(r.status));
    return {
      count: active.length,
      guests: active.reduce((s, r) => s + (Number(r.guests) || 0), 0),
      pending: list.filter((r) => r.status === 'PENDING').length,
    };
  }, [list]);

  const shiftDay = (days: number) => {
    const d = new Date(`${date}T12:00:00`);
    d.setDate(d.getDate() + days);
    setDate(localDate(d));
  };

  return (
    <AppShell title="رزرو">
      <div style={{ display: 'grid', gap: 16 }}>
        {error ? (
          <div role="alert" style={ALERT}>
            {error}
          </div>
        ) : null}
        {note ? (
          <div role="status" style={{ ...ALERT, background: '#04785722', color: '#047857' }}>
            {note}
          </div>
        ) : null}

        <section style={CARD}>
          <h2 style={H2}>رزرو تازه</h2>
          <form onSubmit={create} style={FORM}>
            <Field label="نام مشتری">
              <input
                value={draft.customerName}
                onChange={(e) => setDraft({ ...draft, customerName: e.target.value })}
                style={INPUT}
                placeholder="آقای رضایی"
              />
            </Field>
            <Field label="تلفن">
              <input
                value={draft.phone}
                onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
                style={INPUT}
                inputMode="tel"
                placeholder="۰۹۱۲…"
              />
            </Field>
            <Field label="نفرات">
              <input
                value={draft.guests}
                onChange={(e) => setDraft({ ...draft, guests: e.target.value })}
                style={INPUT}
                inputMode="numeric"
              />
            </Field>
            <Field label="زمان">
              <input
                type="datetime-local"
                value={draft.reservedAt}
                onChange={(e) => setDraft({ ...draft, reservedAt: e.target.value })}
                style={INPUT}
              />
            </Field>
            <Field label="مدت (دقیقه)">
              <input
                value={draft.durationMin}
                onChange={(e) => setDraft({ ...draft, durationMin: e.target.value })}
                style={INPUT}
                inputMode="numeric"
              />
            </Field>
            <Field label="میز">
              <select
                value={draft.tableId}
                onChange={(e) => setDraft({ ...draft, tableId: e.target.value })}
                style={INPUT}
              >
                {/* میز اختیاری است: خیلی از رزروها بدون تعیین میز گرفته
                    می‌شوند و سرِ شب تخصیص داده می‌شوند. */}
                <option value="">— هر میزی —</option>
                {tables.map((t) => (
                  <option key={t.id} value={t.id}>
                    میز {t.tableNo} ({t.capacity} نفره)
                  </option>
                ))}
              </select>
            </Field>
            <Field label="یادداشت">
              <input
                value={draft.note}
                onChange={(e) => setDraft({ ...draft, note: e.target.value })}
                style={INPUT}
                placeholder="کنار پنجره"
              />
            </Field>
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button type="submit" disabled={busy === 'create'} style={BTN_PRIMARY}>
                {busy === 'create' ? '…' : 'ثبت رزرو'}
              </button>
            </div>
          </form>
        </section>

        <section style={{ display: 'grid', gap: 10 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <button type="button" style={BTN} onClick={() => shiftDay(-1)}>
              ‹ دیروز
            </button>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              style={INPUT}
            />
            <button type="button" style={BTN} onClick={() => shiftDay(1)}>
              فردا ›
            </button>
            <button type="button" style={BTN} onClick={() => setDate(localDate())}>
              امروز
            </button>

            <span style={{ marginInlineStart: 'auto', fontSize: 14, color: 'var(--muted)' }}>
              {summary.count} رزرو فعال · {summary.guests} نفر
              {summary.pending > 0 ? ` · ${summary.pending} در انتظار تأیید` : ''}
            </span>
          </div>

          {list.length === 0 ? (
            <p style={{ padding: 32, textAlign: 'center', color: 'var(--muted)' }}>
              برای این روز رزروی ثبت نشده
            </p>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              {list.map((r) => {
                const when = new Date(r.reservedAt);
                return (
                  <article
                    key={r.id}
                    style={{
                      ...CARD,
                      gap: 8,
                      borderInlineStartWidth: 4,
                      borderInlineStartStyle: 'solid',
                      borderInlineStartColor: STATUS_COLOR[r.status] ?? 'var(--border)',
                      opacity: ['CANCELLED', 'NO_SHOW'].includes(r.status) ? 0.55 : 1,
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        gap: 12,
                        flexWrap: 'wrap',
                        alignItems: 'baseline',
                      }}
                    >
                      {/* ساعت بزرگ‌ترین عنصر است: متصدی فهرست را با چشم
                          روی ساعت می‌خواند، نه روی نام. */}
                      <strong style={{ fontSize: 22 }}>
                        {when.toLocaleTimeString(locale, {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </strong>
                      <strong style={{ fontSize: 17 }}>{r.customerName}</strong>
                      <span style={{ color: 'var(--muted)' }}>{r.guests} نفر</span>
                      {r.tableNo ? (
                        <span style={{ color: 'var(--muted)' }}>· میز {r.tableNo}</span>
                      ) : (
                        <span style={{ color: 'var(--muted)' }}>· میز تعیین نشده</span>
                      )}
                      {r.phone ? (
                        <a href={`tel:${r.phone}`} style={{ color: 'var(--accent)' }}>
                          {r.phone}
                        </a>
                      ) : null}
                      <span
                        style={{
                          marginInlineStart: 'auto',
                          color: STATUS_COLOR[r.status] ?? 'var(--text)',
                          fontWeight: 700,
                        }}
                      >
                        {STATUS_FA[r.status] ?? r.status}
                      </span>
                    </div>

                    {r.note ? (
                      <div style={{ fontSize: 14, color: 'var(--muted)' }}>{r.note}</div>
                    ) : null}

                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {(NEXT_STEP[r.status] ?? []).map((step) => (
                        <button
                          key={step.to}
                          type="button"
                          onClick={() => setStatus(r, step.to)}
                          disabled={busy === r.id}
                          style={step.to === 'CANCELLED' || step.to === 'NO_SHOW'
                            ? { ...BTN, color: '#b91c1c' }
                            : BTN}
                        >
                          {step.label}
                        </button>
                      ))}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
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

const ALERT: React.CSSProperties = {
  padding: 12,
  borderRadius: 10,
  background: '#b91c1c22',
  color: '#b91c1c',
};

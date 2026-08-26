'use client';

/**
 * شکایات شهروندی.
 *
 * هفت مسیر API داشت و هیچ صفحه‌ای صدایشان نمی‌زد.
 *
 * ⚠️ چرا با موتورِ `[domain]` ساخته نشد؟
 *
 *    این ماژول CRUD نیست: دو مسیرِ گردشِ کار دارد — `:id/refer` و
 *    `:id/status` — که فرمِ عمومی نمی‌سازدشان.  ارجاع و تغییرِ وضعیت
 *    کارِ روزمرهٔ این ماژول است، نه ویرایشِ میدان‌ها.
 *
 * ⚠️ چیزی که این صفحه باید بی‌درنگ جواب بدهد:
 *    **کدام شکایت بی‌پاسخ مانده و چند روز است.**
 *    شکایتی که کسی بهش دست نزده، تنها خرابیِ واقعیِ این جدول است.
 *
 * ⚠️ حذف عمداً نیست.
 *
 *    کنترلر مسیرِ حذف ندارد و درست است: شکایتِ شهروند سند است، و
 *    «بستن» با وضعیتِ `CLOSED` انجام می‌شود نه با پاک کردن.  دکمه‌ای
 *    که نیست، امکانِ ازقلم‌افتاده نیست.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import AppShell from '../../components/AppShell';
import { api } from '../../lib/api';
import { useI18n } from '../../lib/i18n-context';

type Complaint = {
  id: string;
  trackingNo: string;
  category: string;
  status: string;
  citizenName: string | null;
  citizenPhone: string | null;
  address: string | null;
  subject: string;
  description: string | null;
  referredTo: string | null;
  responseNote: string | null;
  createdAt: string;
};

const STATUS_FA: Record<string, string> = {
  REGISTERED: 'ثبت‌شده',
  REFERRED: 'ارجاع‌شده',
  IN_PROGRESS: 'در حال بررسی',
  RESOLVED: 'رفع‌شده',
  REJECTED: 'ردشده',
  CLOSED: 'بسته',
};

const STATUS_COLOR: Record<string, string> = {
  REGISTERED: 'var(--accent)',
  REFERRED: 'var(--warning)',
  IN_PROGRESS: 'var(--warning)',
  RESOLVED: 'var(--success)',
  REJECTED: 'var(--danger)',
  CLOSED: 'var(--muted)',
};

/**
 * وضعیت‌هایی که هنوز کارِ ناتمام‌اند.
 *
 * ⚠️ `REJECTED` هم پایان است، نه ناتمام: تصمیم گرفته شده.  اگر جزو
 *    باز شمرده شود، هشدارِ «بی‌پاسخ» هیچ‌وقت خالی نمی‌شود و کسی دیگر
 *    نگاهش نمی‌کند.
 */
const OPEN = new Set(['REGISTERED', 'REFERRED', 'IN_PROGRESS']);

const NEXT: Record<string, { to: string; label: string }[]> = {
  REGISTERED: [
    { to: 'IN_PROGRESS', label: 'شروع بررسی' },
    { to: 'REJECTED', label: 'رد' },
  ],
  REFERRED: [
    { to: 'IN_PROGRESS', label: 'شروع بررسی' },
    { to: 'REJECTED', label: 'رد' },
  ],
  IN_PROGRESS: [
    { to: 'RESOLVED', label: 'رفع شد' },
    { to: 'REJECTED', label: 'رد' },
  ],
  RESOLVED: [{ to: 'CLOSED', label: 'بستن' }],
  REJECTED: [{ to: 'CLOSED', label: 'بستن' }],
  CLOSED: [],
};

const DAY = 86_400_000;

function ageDays(iso: string): number {
  const at = new Date(iso).getTime();
  return Number.isFinite(at) ? Math.floor((Date.now() - at) / DAY) : 0;
}

export default function ComplaintsPage() {
  const { t } = useI18n();

  const [list, setList] = useState<Complaint[]>([]);
  const [filter, setFilter] = useState('');
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setList(await api<Complaint[]>('/complaints'));
    } catch (caught) {
      setError((caught as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const flash = (m: string) => {
    setNote(m);
    window.setTimeout(() => setNote(''), 2500);
  };

  const move = async (c: Complaint, to: string) => {
    // ⚠️ وضعیتِ پایانی بدونِ توضیح، برای شهروند بی‌معناست.
    //
    //    «رفع شد» و «رد» چیزی هستند که پیگیریِ عمومی نشان می‌دهد؛ اگر
    //    یادداشت نداشته باشند، شهروند فقط یک برچسب می‌بیند بی‌آنکه
    //    بداند چه شد.  برای گام‌های میانی پرسیده نمی‌شود.
    let responseNote: string | null = null;
    if (to === 'RESOLVED' || to === 'REJECTED') {
      responseNote = window.prompt(
        to === 'RESOLVED' ? 'توضیح رفع (اختیاری)' : 'دلیل رد (اختیاری)',
        c.responseNote ?? '',
      );
      // ⚠️ `null` یعنی کاربر انصراف داد — عملیات نباید انجام شود.
      //    رشتهٔ تهی یعنی عمداً خالی گذاشت، که فرق دارد.
      if (responseNote === null) return;
    }

    setBusy(c.id);
    setError('');
    try {
      const body: Record<string, unknown> = { status: to };
      // ⚠️ فقط وقتی فرستاده می‌شود که چیزی نوشته باشد: رشتهٔ تهی
      //    یادداشتِ قبلی را پاک می‌کرد.
      if (responseNote && responseNote.trim()) body.responseNote = responseNote.trim();
      await api(`/complaints/${c.id}/status`, { method: 'PATCH', body });
      flash(`وضعیت به «${STATUS_FA[to] ?? to}» تغییر کرد`);
      await load();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const refer = async (c: Complaint) => {
    const unit = window.prompt('ارجاع به کدام واحد؟', c.referredTo ?? '');
    if (!unit || !unit.trim()) return;
    setBusy(c.id);
    setError('');
    try {
      await api(`/complaints/${c.id}/refer`, {
        method: 'PATCH',
        body: { referredTo: unit.trim() },
      });
      flash('ارجاع شد');
      await load();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return list.filter((c) => {
      if (filter && c.status !== filter) return false;
      if (!q) return true;
      return (
        c.trackingNo.toLowerCase().includes(q) ||
        c.subject.toLowerCase().includes(q) ||
        (c.citizenName ?? '').toLowerCase().includes(q) ||
        (c.citizenPhone ?? '').includes(q)
      );
    });
  }, [list, filter, search]);

  /** ⚠️ خلاصه از **کلِ** فهرست است نه از صافی‌شده: وگرنه با انتخابِ
   *    یک وضعیت، هشدارِ «بی‌پاسخ» ناپدید می‌شد. */
  const summary = useMemo(() => {
    const openOnes = list.filter((c) => OPEN.has(c.status));
    return {
      total: list.length,
      open: openOnes.length,
      stale: openOnes.filter((c) => ageDays(c.createdAt) > 7).length,
      unassigned: openOnes.filter((c) => !c.referredTo).length,
    };
  }, [list]);

  const statuses = useMemo(
    () => [...new Set(list.map((c) => c.status))].sort(),
    [list],
  );

  return (
    <AppShell title={t('menuComplaints')}>
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

        {summary.stale > 0 || summary.unassigned > 0 ? (
          <div
            role="status"
            style={{
              ...ALERT,
              background: 'color-mix(in srgb, var(--warning) 13%, transparent)',
              color: 'var(--warning)',
              display: 'grid',
              gap: 4,
            }}
          >
            {summary.stale > 0 ? (
              <span>{summary.stale} شکایت بیش از یک هفته است باز مانده</span>
            ) : null}
            {summary.unassigned > 0 ? (
              <span>{summary.unassigned} شکایت به هیچ واحدی ارجاع نشده</span>
            ) : null}
          </div>
        ) : null}

        <section style={CARD}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              type="button"
              style={filter === '' ? CHIP_ON : CHIP}
              onClick={() => setFilter('')}
            >
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
              placeholder="کد رهگیری، موضوع، نام یا تلفن"
            />
          </div>
        </section>

        <section style={CARD}>
          <h2 style={H2}>
            شکایات{' '}
            <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: 14 }}>
              {summary.open} باز از {summary.total}
            </span>
          </h2>

          {shown.length === 0 ? (
            <p style={EMPTY}>شکایتی مطابق این صافی نیست.</p>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {shown.map((c) => {
                const age = ageDays(c.createdAt);
                const isOpen = open === c.id;
                return (
                  <div
                    key={c.id}
                    style={{
                      border: '1px solid var(--border)',
                      borderRadius: 10,
                      padding: 12,
                      display: 'grid',
                      gap: 8,
                    }}
                  >
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                      <code style={{ fontFamily: 'ui-monospace, monospace', fontSize: 13 }}>
                        {c.trackingNo}
                      </code>
                      <strong style={{ flex: '1 1 200px' }}>{c.subject}</strong>
                      <span
                        style={{
                          color: STATUS_COLOR[c.status] ?? 'inherit',
                          fontWeight: 700,
                          fontSize: 13,
                        }}
                      >
                        {STATUS_FA[c.status] ?? c.status}
                      </span>
                      <span
                        style={{
                          fontSize: 13,
                          color: OPEN.has(c.status) && age > 7 ? 'var(--warning)' : 'var(--muted)',
                        }}
                      >
                        {age === 0 ? 'امروز' : `${age} روز پیش`}
                      </span>
                    </div>

                    <div style={{ fontSize: 13, color: 'var(--muted)', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                      <span>{c.category}</span>
                      {c.citizenName ? <span>{c.citizenName}</span> : null}
                      {c.citizenPhone ? <span>{c.citizenPhone}</span> : null}
                      <span>
                        {c.referredTo ? `ارجاع: ${c.referredTo}` : 'ارجاع نشده'}
                      </span>
                    </div>

                    {isOpen ? (
                      <div style={{ display: 'grid', gap: 8, fontSize: 14 }}>
                        {c.address ? <div>نشانی: {c.address}</div> : null}
                        {c.description ? (
                          <div style={{ whiteSpace: 'pre-wrap' }}>{c.description}</div>
                        ) : null}
                        {c.responseNote ? (
                          <div style={{ color: 'var(--success)', whiteSpace: 'pre-wrap' }}>
                            پاسخ: {c.responseNote}
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        style={BTN_SM}
                        onClick={() => setOpen(isOpen ? null : c.id)}
                      >
                        {isOpen ? 'بستن جزئیات' : 'جزئیات'}
                      </button>
                      <button
                        type="button"
                        style={BTN_SM}
                        disabled={busy === c.id}
                        onClick={() => void refer(c)}
                      >
                        ارجاع
                      </button>
                      {(NEXT[c.status] ?? []).map((step) => (
                        <button
                          key={step.to}
                          type="button"
                          style={BTN_SM}
                          disabled={busy === c.id}
                          onClick={() => void move(c, step.to)}
                        >
                          {step.label}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
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

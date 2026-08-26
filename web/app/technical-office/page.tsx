'use client';

/**
 * دفتر فنی — پروانهٔ ساختمان و تخلفات.
 *
 * سیزده مسیر API داشت و هیچ صفحه‌ای صدایشان نمی‌زد — بزرگ‌ترین
 * بدهیِ باقی‌مانده پس از آتش‌نشانی.
 *
 * ⚠️ با موتورِ `[domain]` ساخته نشد و نمی‌شد.
 *
 *    سه موجودیت با گردشِ کارِ واقعی: پروانه (تأیید/رد/بازرسی)،
 *    بازرسی (زیرمجموعهٔ پروانه)، و تخلف (جریمه).  فرمِ عمومی هیچ‌کدام
 *    را نمی‌سازد.
 *
 * ⚠️ «جریمه» به‌تنهایی قبض **نمی‌سازد** — این را با آزمون فهمیدم.
 *
 *    نسخهٔ اول این فایل ادعا می‌کرد که می‌سازد و پیامش کاربر را به
 *    «عوارض و قبوض» می‌فرستاد.  اجرای واقعی نشان داد `fine` فقط
 *    وضعیت را `FINED` می‌کند؛ صدورِ قبض مسیرِ جدا
 *    (`municipal-fees/from-violation`) و نقشِ جدا (`ACCOUNTANT`)
 *    دارد.
 *
 *    زنجیرهٔ واقعی هست — تخلف ← جریمه ← قبض ← دریافت ← رسید — ولی
 *    حلقهٔ سومش دستی است.  پس صفحه پس از جریمه **پیشنهاد** می‌دهد،
 *    نه اینکه فرض کند.
 *
 * ⚠️ دو دسته در یک صفحه، نه دو صفحه.
 *
 *    کاربرِ دفتر فنی هر دو را کنارِ هم می‌خواهد: تخلف معمولاً روی
 *    ملکی است که پروانه دارد یا ندارد.  جدا کردنشان یعنی رفت‌وبرگشتِ
 *    دائمی.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import AppShell from '../../components/AppShell';
import { api } from '../../lib/api';
import { useI18n } from '../../lib/i18n-context';

type Permit = {
  id: string;
  permitNo: string;
  type: string;
  status: string;
  ownerName: string;
  ownerPhone: string | null;
  address: string;
  area: string | number;
  floors: number;
  rejectReason: string | null;
  issuedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
};

type Violation = {
  id: string;
  caseNo: string;
  ownerName: string;
  address: string;
  description: string;
  status: string;
  fineAmount: string | number | null;
  createdAt: string;
};

const PERMIT_STATUS_FA: Record<string, string> = {
  PENDING: 'در انتظار',
  UNDER_REVIEW: 'در حال بررسی',
  APPROVED: 'تأییدشده',
  REJECTED: 'ردشده',
};

const PERMIT_COLOR: Record<string, string> = {
  PENDING: 'var(--warning)',
  UNDER_REVIEW: 'var(--accent)',
  APPROVED: 'var(--success)',
  REJECTED: 'var(--danger)',
};

const VIOLATION_FA: Record<string, string> = {
  REPORTED: 'گزارش‌شده',
  FINED: 'جریمه‌شده',
};

const money = (v: string | number | null) =>
  Number(v ?? 0).toLocaleString('fa-IR', { maximumFractionDigits: 0 });

const DAY = 86_400_000;

/** ⚠️ پروانهٔ منقضی که هنوز «تأییدشده» است، ریسکِ اصلیِ این جدول است. */
function expiryState(iso: string | null): 'none' | 'soon' | 'expired' {
  if (!iso) return 'none';
  const at = new Date(iso).getTime();
  if (!Number.isFinite(at)) return 'none';
  if (at < Date.now()) return 'expired';
  return at - Date.now() < 30 * DAY ? 'soon' : 'none';
}

export default function TechnicalOfficePage() {
  const { t } = useI18n();

  const [tab, setTab] = useState<'permits' | 'violations'>('permits');
  const [permits, setPermits] = useState<Permit[]>([]);
  const [violations, setViolations] = useState<Violation[]>([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  /**
   * خبرِ صدورِ قبض — جدا از `note`.
   *
   * ⚠️ `note` پس از ۳ ثانیه محو می‌شود و برای «ثبت شد» مناسب است.
   *    این یکی می‌ماند تا کاربر بخواندش: می‌گوید قبض صادر شد یا نه، و
   *    اگر نشد چرا.
   */
  const [billNote, setBillNote] = useState('');

  const load = useCallback(async () => {
    // ⚠️ هر دسته جدا خطا می‌دهد: نقشِ کاربر ممکن است فقط یکی را ببیند.
    api<Permit[]>('/technical-office/permits').then(setPermits).catch((e) =>
      setError((e as Error).message),
    );
    api<Violation[]>('/technical-office/violations')
      .then(setViolations)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const flash = (m: string) => {
    setNote(m);
    window.setTimeout(() => setNote(''), 3000);
  };

  const act = async (id: string, work: () => Promise<unknown>, ok: string) => {
    setBusy(id);
    setError('');
    try {
      await work();
      flash(ok);
      await load();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const approve = (p: Permit) => {
    const years = window.prompt('اعتبار پروانه چند سال باشد؟', '3');
    if (years === null) return;
    const n = Number(years);
    if (!Number.isFinite(n) || n <= 0) {
      setError('مدت اعتبار باید عددی بزرگ‌تر از صفر باشد');
      return;
    }
    void act(
      p.id,
      () =>
        api(`/technical-office/permits/${p.id}/approve`, {
          method: 'PATCH',
          body: { validYears: n },
        }),
      'پروانه تأیید شد',
    );
  };

  const reject = (p: Permit) => {
    // ⚠️ دلیل اجباری است — سرور هم اجباری‌اش می‌داند.
    //    ردِ بی‌دلیل یعنی مالک نمی‌داند چه چیزی را اصلاح کند.
    const reason = window.prompt('دلیل رد؟');
    if (reason === null) return;
    if (!reason.trim()) {
      setError('دلیل رد الزامی است');
      return;
    }
    void act(
      p.id,
      () =>
        api(`/technical-office/permits/${p.id}/reject`, {
          method: 'PATCH',
          body: { reason: reason.trim() },
        }),
      'پروانه رد شد',
    );
  };

  const inspect = (p: Permit) => {
    const inspector = window.prompt('نام بازرس؟');
    if (inspector === null) return;
    if (!inspector.trim()) {
      setError('نام بازرس الزامی است');
      return;
    }
    const passed = window.confirm('نتیجهٔ بازرسی قبول است؟\n(لغو = مردود)');
    void act(
      p.id,
      () =>
        api(`/technical-office/permits/${p.id}/inspections`, {
          method: 'POST',
          body: {
            inspectorName: inspector.trim(),
            result: passed ? 'APPROVED' : 'FAILED',
          },
        }),
      passed ? 'بازرسی قبول ثبت شد' : 'بازرسی مردود ثبت شد',
    );
  };

  const fine = (v: Violation) => {
    const amount = window.prompt('مبلغ جریمه (ریال)؟', String(v.fineAmount ?? ''));
    if (amount === null) return;
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) {
      setError('مبلغ جریمه باید عددی بزرگ‌تر از صفر باشد');
      return;
    }
    void act(
      v.id,
      async () => {
        await api(`/technical-office/violations/${v.id}/fine`, {
          method: 'PATCH',
          body: { fineAmount: n },
        });

        // ⚠️ جریمه به‌تنهایی **قبض نمی‌سازد**.
        //
        //    آزمودم: `fine` فقط وضعیت را `FINED` می‌کند و مبلغ را
        //    می‌نشاند.  صدورِ قبض مسیرِ جداگانه‌ای است
        //    (`municipal-fees/from-violation`) و نقشِ دیگری می‌خواهد
        //    (`ACCOUNTANT`) — کارشناسِ دفتر فنی لزوماً آن را ندارد.
        //
        //    پس زنجیره خودکار بسته نمی‌شود، پیشنهاد می‌شود.  فرضِ
        //    خودکار یعنی کاربرِ بی‌دسترسی یک ۴۰۳ می‌گرفت که با جریمهٔ
        //    **موفقش** هیچ ربطی نداشت.
        if (!window.confirm('جریمه ثبت شد. قبض عوارض هم صادر شود؟')) {
          setBillNote('جریمه ثبت شد؛ قبضی صادر نشد.');
          return;
        }

        try {
          await api(`/municipal-fees/from-violation/${v.id}`, { method: 'POST' });
          setBillNote('قبض صادر شد — در «عوارض و قبوض» قابل دریافت است.');
        } catch (caught) {
          // شکستِ صدورِ قبض، جریمه را باطل نمی‌کند؛ پس خطا نیست، خبر است.
          setBillNote(
            `جریمه ثبت شد، ولی قبض صادر نشد: ${(caught as Error).message}`,
          );
        }
      },
      'جریمه ثبت شد',
    );
  };

  const shownPermits = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return permits;
    return permits.filter(
      (p) =>
        p.permitNo.toLowerCase().includes(q) ||
        p.ownerName.toLowerCase().includes(q) ||
        p.address.toLowerCase().includes(q),
    );
  }, [permits, search]);

  const shownViolations = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return violations;
    return violations.filter(
      (v) =>
        v.caseNo.toLowerCase().includes(q) ||
        v.ownerName.toLowerCase().includes(q) ||
        v.address.toLowerCase().includes(q),
    );
  }, [violations, search]);

  const summary = useMemo(
    () => ({
      pending: permits.filter((p) => p.status === 'PENDING' || p.status === 'UNDER_REVIEW').length,
      expired: permits.filter(
        (p) => p.status === 'APPROVED' && expiryState(p.expiresAt) === 'expired',
      ).length,
      unfined: violations.filter((v) => v.status === 'REPORTED').length,
    }),
    [permits, violations],
  );

  return (
    <AppShell title={t('menuTechnicalOffice')}>
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

        {billNote ? (
          <div
            role="status"
            style={{
              ...ALERT,
              background: 'color-mix(in srgb, var(--accent) 12%, transparent)',
              color: 'var(--text)',
              display: 'flex',
              gap: 10,
              alignItems: 'center',
            }}
          >
            <span style={{ flex: 1 }}>{billNote}</span>
            <button type="button" style={BTN_SM} onClick={() => setBillNote('')}>
              باشه
            </button>
          </div>
        ) : null}

        {summary.expired > 0 || summary.unfined > 0 ? (
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
            {summary.expired > 0 ? (
              <span>{summary.expired} پروانهٔ منقضی هنوز تأییدشده است</span>
            ) : null}
            {summary.unfined > 0 ? (
              <span>{summary.unfined} تخلف بدون جریمه مانده</span>
            ) : null}
          </div>
        ) : null}

        <section style={CARD}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              type="button"
              style={tab === 'permits' ? CHIP_ON : CHIP}
              onClick={() => setTab('permits')}
            >
              پروانه‌ها ({permits.length})
              {summary.pending > 0 ? ` · ${summary.pending} در انتظار` : ''}
            </button>
            <button
              type="button"
              style={tab === 'violations' ? CHIP_ON : CHIP}
              onClick={() => setTab('violations')}
            >
              تخلفات ({violations.length})
            </button>
            <input
              style={{ ...INPUT, flex: '1 1 180px' }}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="شماره، مالک یا نشانی"
            />
          </div>
        </section>

        {tab === 'permits' ? (
          <section style={CARD}>
            {shownPermits.length === 0 ? (
              <p style={EMPTY}>پروانه‌ای نیست.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                  <thead>
                    <tr>
                      <th style={TH}>شماره</th>
                      <th style={TH}>مالک</th>
                      <th style={TH}>نشانی</th>
                      <th style={{ ...TH, textAlign: 'end' }}>مساحت</th>
                      <th style={{ ...TH, textAlign: 'end' }}>طبقات</th>
                      <th style={TH}>وضعیت</th>
                      <th style={TH}>انقضا</th>
                      <th style={TH}> </th>
                    </tr>
                  </thead>
                  <tbody>
                    {shownPermits.map((p) => {
                      const exp = expiryState(p.expiresAt);
                      return (
                        <tr key={p.id}>
                          <td style={{ ...TD, fontFamily: 'ui-monospace, monospace' }}>
                            {p.permitNo}
                          </td>
                          <td style={TD}>{p.ownerName}</td>
                          <td style={TD}>{p.address}</td>
                          <td style={{ ...TD, textAlign: 'end' }}>{money(p.area)}</td>
                          <td style={{ ...TD, textAlign: 'end' }}>{p.floors}</td>
                          <td
                            style={{
                              ...TD,
                              color: PERMIT_COLOR[p.status] ?? 'inherit',
                              fontWeight: 700,
                            }}
                          >
                            {PERMIT_STATUS_FA[p.status] ?? p.status}
                            {p.rejectReason ? (
                              <div style={{ fontWeight: 400, fontSize: 12, color: 'var(--muted)' }}>
                                {p.rejectReason}
                              </div>
                            ) : null}
                          </td>
                          <td
                            style={{
                              ...TD,
                              color:
                                exp === 'expired'
                                  ? 'var(--danger)'
                                  : exp === 'soon'
                                    ? 'var(--warning)'
                                    : 'inherit',
                            }}
                          >
                            {p.expiresAt
                              ? new Date(p.expiresAt).toLocaleDateString('fa-IR')
                              : '—'}
                          </td>
                          <td style={{ ...TD, whiteSpace: 'nowrap' }}>
                            {p.status === 'PENDING' || p.status === 'UNDER_REVIEW' ? (
                              <>
                                <button
                                  type="button"
                                  style={BTN_SM}
                                  disabled={busy === p.id}
                                  onClick={() => approve(p)}
                                >
                                  تأیید
                                </button>{' '}
                                <button
                                  type="button"
                                  style={{ ...BTN_SM, color: 'var(--danger)' }}
                                  disabled={busy === p.id}
                                  onClick={() => reject(p)}
                                >
                                  رد
                                </button>{' '}
                              </>
                            ) : null}
                            <button
                              type="button"
                              style={BTN_SM}
                              disabled={busy === p.id}
                              onClick={() => inspect(p)}
                            >
                              بازرسی
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ) : (
          <section style={CARD}>
            {shownViolations.length === 0 ? (
              <p style={EMPTY}>تخلفی ثبت نشده.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                  <thead>
                    <tr>
                      <th style={TH}>پرونده</th>
                      <th style={TH}>مالک</th>
                      <th style={TH}>نشانی</th>
                      <th style={TH}>شرح</th>
                      <th style={TH}>وضعیت</th>
                      <th style={{ ...TH, textAlign: 'end' }}>جریمه</th>
                      <th style={TH}> </th>
                    </tr>
                  </thead>
                  <tbody>
                    {shownViolations.map((v) => (
                      <tr key={v.id}>
                        <td style={{ ...TD, fontFamily: 'ui-monospace, monospace' }}>{v.caseNo}</td>
                        <td style={TD}>{v.ownerName}</td>
                        <td style={TD}>{v.address}</td>
                        <td style={TD}>{v.description}</td>
                        <td
                          style={{
                            ...TD,
                            color: v.status === 'FINED' ? 'var(--success)' : 'var(--warning)',
                            fontWeight: 700,
                          }}
                        >
                          {VIOLATION_FA[v.status] ?? v.status}
                        </td>
                        <td style={{ ...TD, textAlign: 'end', fontWeight: 700 }}>
                          {v.fineAmount ? money(v.fineAmount) : '—'}
                        </td>
                        <td style={{ ...TD, whiteSpace: 'nowrap' }}>
                          {v.status === 'REPORTED' ? (
                            <button
                              type="button"
                              style={BTN_SM}
                              disabled={busy === v.id}
                              onClick={() => fine(v)}
                            >
                              ثبت جریمه
                            </button>
                          ) : (
                            <span style={{ color: 'var(--muted)', fontSize: 13 }}>—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
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

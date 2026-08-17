'use client';

/**
 * کارکنان — حضور، مرخصی و حقوق.
 *
 * سه ماژول (`payroll`، `attendance`، `leave-requests`) با ۲۴ مسیر API و
 * بیست سنجهٔ آزمون وجود داشتند و **هیچ صفحه‌ای صدایشان نمی‌زد**.  یعنی
 * حضور کارمند، تأیید مرخصی و صدور فیش حقوقی فقط با `curl` ممکن بود.
 *
 * هر فروشگاه و رستورانی کارمند دارد؛ این نه قابلیت سازمانی که پایه است.
 *
 * چهار بخش در یک صفحه، چون هر چهار به یک نفر مربوط‌اند و مدیر بین‌شان
 * جابه‌جا می‌شود: کارمند را می‌بیند، حضورش را ثبت می‌کند، مرخصی‌اش را
 * تأیید می‌کند، فیشش را صادر می‌کند.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import AppShell from '../../components/AppShell';
import { api } from '../../lib/api';
import { useI18n } from '../../lib/i18n-context';

type Employee = {
  id: string;
  employeeNo: string;
  firstName: string;
  lastName: string;
  position: string | null;
  department: string | null;
  phone: string | null;
  baseSalary: string | number;
  housingAllowance: string | number;
  foodAllowance: string | number;
  isActive: boolean;
};

type SummaryRow = {
  employeeId: string;
  employeeNo: string;
  employeeName: string;
  workedHours: string;
  overtimeHours: string;
  presentDays: string;
  absentDays: string;
  leaveDays: string;
};

type Leave = {
  id: string;
  employeeId: string;
  employeeName?: string | null;
  kind: string;
  startDate: string;
  endDate: string;
  days: string | number;
  reason: string | null;
  status: string;
};

type Balance = {
  employeeId: string;
  employeeNo: string;
  employeeName: string;
  entitled: string | number;
  used: string | number;
  carriedOver: string | number;
  remaining: string | number;
};

type Slip = {
  id: string;
  employeeId: string;
  employeeName?: string | null;
  period: string;
  baseSalary: string | number;
  allowances: string | number;
  overtimePay: string | number;
  bonus: string | number;
  deductions: string | number;
  insurance: string | number;
  tax: string | number;
  netPay: string | number;
  status: string;
};

const LEAVE_KIND_FA: Record<string, string> = {
  ANNUAL: 'استحقاقی',
  SICK: 'استعلاجی',
  UNPAID: 'بدون حقوق',
  EMERGENCY: 'اضطراری',
};

const LEAVE_STATUS_FA: Record<string, string> = {
  PENDING: 'در انتظار',
  APPROVED: 'تأیید شده',
  REJECTED: 'رد شده',
};

const SLIP_STATUS_FA: Record<string, string> = {
  DRAFT: 'پیش‌نویس',
  APPROVED: 'تأیید شده',
  PAID: 'پرداخت شده',
};

const money = (v: string | number | null | undefined) =>
  v === null || v === undefined || v === '' ? '—' : Number(v).toLocaleString('fa-IR');

/**
 * تاریخ محلی، نه UTC.
 *
 * `toISOString().slice(0,10)` در تهران تا ۳:۳۰ بامداد روزِ دیروز را
 * می‌دهد — حضور و غیاب دقیقاً جایی است که این یک روز اهمیت دارد.
 */
function localDate(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** دورهٔ حقوق به شکل `YYYY-MM` محلی. */
function localPeriod(d = new Date()): string {
  return localDate(d).slice(0, 7);
}

type Tab = 'people' | 'attendance' | 'leave' | 'payroll';

const TABS: { key: Tab; label: string }[] = [
  { key: 'people', label: 'کارکنان' },
  { key: 'attendance', label: 'حضور' },
  { key: 'leave', label: 'مرخصی' },
  { key: 'payroll', label: 'حقوق' },
];

export default function StaffPage() {
  const { t } = useI18n();
  const { locale } = useI18n();

  const [tab, setTab] = useState<Tab>('people');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [summary, setSummary] = useState<SummaryRow[]>([]);
  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [slips, setSlips] = useState<Slip[]>([]);

  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const [period, setPeriod] = useState(localPeriod());

  // ثبت حضور
  const [attEmp, setAttEmp] = useState('');
  const [attDate, setAttDate] = useState(localDate());
  const [attIn, setAttIn] = useState('08:00');
  const [attOut, setAttOut] = useState('17:00');

  // درخواست مرخصی
  const [lvEmp, setLvEmp] = useState('');
  const [lvKind, setLvKind] = useState('ANNUAL');
  const [lvFrom, setLvFrom] = useState(localDate());
  const [lvTo, setLvTo] = useState(localDate());
  const [lvReason, setLvReason] = useState('');

  // فیش حقوقی
  const [slEmp, setSlEmp] = useState('');
  const [slOvertime, setSlOvertime] = useState('0');
  const [slBonus, setSlBonus] = useState('0');
  const [slDeduct, setSlDeduct] = useState('0');

  /**
   * ⚠️ خطا را در مسیر موفق پاک نمی‌کند.
   *
   * وگرنه هر عملیاتی که خطا می‌داد و بعد فهرست را تازه می‌کرد، پیام
   * خطایش بی‌صدا محو می‌شد.  پاک کردن خطا کارِ شروعِ هر عملیات است.
   */
  const load = useCallback(async () => {
    try {
      const [e, s, l, b, p] = await Promise.all([
        api<Employee[]>('/payroll/employees?limit=500'),
        api<SummaryRow[]>(`/attendance/summary?period=${period}-01`),
        api<Leave[]>('/attendance/leaves'),
        api<Balance[]>('/attendance/balances'),
        api<Slip[]>('/payroll/slips?limit=200'),
      ]);
      setEmployees(e);
      setSummary(s);
      setLeaves(l);
      setBalances(b);
      setSlips(p);
      setAttEmp((prev) => prev || e[0]?.id || '');
      setLvEmp((prev) => prev || e[0]?.id || '');
      setSlEmp((prev) => prev || e[0]?.id || '');
    } catch (caught) {
      setError((caught as Error).message);
    }
  }, [period]);

  useEffect(() => {
    void load();
  }, [load]);

  const flash = (m: string) => {
    setNote(m);
    window.setTimeout(() => setNote(''), 2500);
  };

  const nameOf = (id: string) => {
    const e = employees.find((x) => x.id === id);
    return e ? `${e.firstName} ${e.lastName}` : '—';
  };

  const recordAttendance = async () => {
    setError('');
    if (!attEmp) {
      setError('کارمند را انتخاب کنید');
      return;
    }
    setBusy('att');
    try {
      // ساعت‌ها به تاریخ کامل تبدیل می‌شوند؛ سرور از اختلافشان ساعت
      // کارکرد و اضافه‌کار را حساب می‌کند.
      const body: Record<string, unknown> = { employeeId: attEmp, date: attDate };
      if (attIn) body.checkIn = new Date(`${attDate}T${attIn}`).toISOString();
      if (attOut) body.checkOut = new Date(`${attDate}T${attOut}`).toISOString();
      await api('/attendance', { method: 'POST', body });
      flash('حضور ثبت شد');
      await load();
    } catch (caught) {
      // خروج پیش از ورود را سرور رد می‌کند.
      setError((caught as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const requestLeave = async () => {
    setError('');
    if (!lvEmp) {
      setError('کارمند را انتخاب کنید');
      return;
    }
    if (lvTo < lvFrom) {
      setError('تاریخ پایان نمی‌تواند پیش از شروع باشد');
      return;
    }
    setBusy('leave');
    try {
      const body: Record<string, unknown> = {
        employeeId: lvEmp,
        kind: lvKind,
        startDate: lvFrom,
        endDate: lvTo,
      };
      if (lvReason.trim()) body.reason = lvReason.trim();
      await api('/attendance/leaves', { method: 'POST', body });
      flash('درخواست مرخصی ثبت شد');
      setLvReason('');
      await load();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const decide = async (leave: Leave, approve: boolean) => {
    setError('');
    setBusy(leave.id);
    try {
      await api(`/attendance/leaves/${leave.id}/decide`, {
        method: 'PATCH',
        body: { approve },
      });
      flash(approve ? 'مرخصی تأیید شد' : 'مرخصی رد شد');
      await load();
    } catch (caught) {
      // مرخصی بیش از مانده را دیتابیس رد می‌کند و حالا پیام روشن
      // برمی‌گردد، نه «خطای داخلی سرور».
      setError((caught as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const createSlip = async () => {
    setError('');
    if (!slEmp) {
      setError('کارمند را انتخاب کنید');
      return;
    }
    setBusy('slip');
    try {
      await api('/payroll/slips', {
        method: 'POST',
        body: {
          employeeId: slEmp,
          period,
          overtimeHours: Number(slOvertime) || 0,
          bonus: Number(slBonus) || 0,
          deductions: Number(slDeduct) || 0,
        },
      });
      flash('فیش صادر شد');
      setSlOvertime('0');
      setSlBonus('0');
      setSlDeduct('0');
      await load();
    } catch (caught) {
      // فیش تکراری همان دوره را سرور رد می‌کند.
      setError((caught as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const slipAction = async (slip: Slip, action: 'approve' | 'pay') => {
    setError('');
    setBusy(slip.id);
    try {
      await api(`/payroll/slips/${slip.id}/${action}`, { method: 'PATCH' });
      flash(action === 'approve' ? 'فیش تأیید شد' : 'فیش پرداخت شد');
      await load();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const pendingLeaves = useMemo(
    () => leaves.filter((l) => l.status === 'PENDING'),
    [leaves],
  );

  const periodSlips = useMemo(
    () => slips.filter((s) => s.period === period),
    [slips, period],
  );

  const payrollTotal = periodSlips.reduce((s, x) => s + Number(x.netPay || 0), 0);

  return (
    <AppShell title="کارکنان">
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

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {TABS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setTab(item.key)}
              style={tab === item.key ? CHIP_ON : CHIP}
            >
              {item.label}
              {/* شمار مرخصی‌های در انتظار روی خودِ زبانه: کاری که منتظر
                  تصمیم است نباید پشت یک کلیک پنهان بماند. */}
              {item.key === 'leave' && pendingLeaves.length > 0 ? ` (${pendingLeaves.length})` : ''}
            </button>
          ))}

          {tab === 'attendance' || tab === 'payroll' ? (
            <label style={{ marginInlineStart: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: 'var(--muted)' }}>{t('stfPeriod')}</span>
              <input
                type="month"
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                style={INPUT}
              />
            </label>
          ) : null}
        </div>

        {tab === 'people' ? (
          <section style={{ display: 'grid', gap: 10 }}>
            {employees.length === 0 ? (
              <p style={EMPTY}>{t('stfNoStaff')}</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={TABLE}>
                  <thead>
                    <tr>
                      {['کد', 'نام', 'سمت', 'واحد', 'تلفن', 'حقوق پایه', 'مزایا', 'وضعیت'].map((h) => (
                        <th key={h} style={TH}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {employees.map((e) => (
                      <tr key={e.id} style={{ opacity: e.isActive ? 1 : 0.5 }}>
                        <td style={TD}>{e.employeeNo}</td>
                        <td style={TD}>
                          <strong>
                            {e.firstName} {e.lastName}
                          </strong>
                        </td>
                        <td style={TD}>{e.position ?? '—'}</td>
                        <td style={TD}>{e.department ?? '—'}</td>
                        <td style={TD}>{e.phone ?? '—'}</td>
                        <td style={{ ...TD, textAlign: 'left' }}>{money(e.baseSalary)}</td>
                        <td style={{ ...TD, textAlign: 'left', color: 'var(--muted)' }}>
                          {money(
                            Number(e.housingAllowance || 0) + Number(e.foodAllowance || 0),
                          )}
                        </td>
                        <td style={TD}>
                          <span style={{ color: e.isActive ? 'var(--success)' : 'var(--muted)' }}>
                            {e.isActive ? 'فعال' : 'غیرفعال'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ) : null}

        {tab === 'attendance' ? (
          <>
            <section style={CARD}>
              <h2 style={H2}>{t('stfRecordAttendance')}</h2>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <Field label="کارمند">
                  <select value={attEmp} onChange={(e) => setAttEmp(e.target.value)} style={INPUT}>
                    {employees.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.firstName} {e.lastName}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="تاریخ">
                  <input
                    type="date"
                    value={attDate}
                    onChange={(e) => setAttDate(e.target.value)}
                    style={INPUT}
                  />
                </Field>
                <Field label="ورود">
                  <input
                    type="time"
                    value={attIn}
                    onChange={(e) => setAttIn(e.target.value)}
                    style={INPUT}
                  />
                </Field>
                <Field label="خروج">
                  <input
                    type="time"
                    value={attOut}
                    onChange={(e) => setAttOut(e.target.value)}
                    style={INPUT}
                  />
                </Field>
                <button
                  type="button"
                  onClick={recordAttendance}
                  disabled={busy === 'att'}
                  style={BTN_PRIMARY}
                >
                  {busy === 'att' ? '…' : 'ثبت'}
                </button>
              </div>
            </section>

            <section style={{ display: 'grid', gap: 10 }}>
              <h2 style={H2}>{t('stfPeriodSummary')}</h2>
              {summary.length === 0 ? (
                <p style={EMPTY}>{t('stfNoAttendance')}</p>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={TABLE}>
                    <thead>
                      <tr>
                        {['کد', 'نام', 'حاضر', 'غایب', 'مرخصی', 'ساعت کارکرد', 'اضافه‌کار'].map(
                          (h) => (
                            <th key={h} style={TH}>
                              {h}
                            </th>
                          ),
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {summary.map((r) => (
                        <tr key={r.employeeId}>
                          <td style={TD}>{r.employeeNo}</td>
                          <td style={TD}>
                            <strong>{r.employeeName}</strong>
                          </td>
                          <td style={{ ...TD, textAlign: 'left' }}>
                            {Number(r.presentDays).toLocaleString('fa-IR')}
                          </td>
                          <td
                            style={{
                              ...TD,
                              textAlign: 'left',
                              color: Number(r.absentDays) > 0 ? 'var(--danger)' : 'var(--muted)',
                            }}
                          >
                            {Number(r.absentDays).toLocaleString('fa-IR')}
                          </td>
                          <td style={{ ...TD, textAlign: 'left' }}>
                            {Number(r.leaveDays).toLocaleString('fa-IR')}
                          </td>
                          <td style={{ ...TD, textAlign: 'left' }}>
                            {Number(r.workedHours).toLocaleString('fa-IR')}
                          </td>
                          <td
                            style={{
                              ...TD,
                              textAlign: 'left',
                              color: Number(r.overtimeHours) > 0 ? 'var(--warning)' : 'var(--muted)',
                            }}
                          >
                            {Number(r.overtimeHours).toLocaleString('fa-IR')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        ) : null}

        {tab === 'leave' ? (
          <>
            <section style={CARD}>
              <h2 style={H2}>{t('stfLeaveRequest')}</h2>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <Field label="کارمند">
                  <select value={lvEmp} onChange={(e) => setLvEmp(e.target.value)} style={INPUT}>
                    {employees.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.firstName} {e.lastName}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="نوع">
                  <select value={lvKind} onChange={(e) => setLvKind(e.target.value)} style={INPUT}>
                    {Object.entries(LEAVE_KIND_FA).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="از">
                  <input
                    type="date"
                    value={lvFrom}
                    onChange={(e) => setLvFrom(e.target.value)}
                    style={INPUT}
                  />
                </Field>
                <Field label="تا">
                  <input
                    type="date"
                    value={lvTo}
                    onChange={(e) => setLvTo(e.target.value)}
                    style={INPUT}
                  />
                </Field>
                <Field label="دلیل">
                  <input
                    value={lvReason}
                    onChange={(e) => setLvReason(e.target.value)}
                    style={INPUT}
                  />
                </Field>
                <button
                  type="button"
                  onClick={requestLeave}
                  disabled={busy === 'leave'}
                  style={BTN_PRIMARY}
                >
                  {busy === 'leave' ? '…' : 'ثبت درخواست'}
                </button>
              </div>
            </section>

            <section style={{ display: 'grid', gap: 10 }}>
              <h2 style={H2}>{t('stfLeaveBalance')}</h2>
              {balances.length === 0 ? (
                <p style={EMPTY}>{t('stfNoEntitlement')}</p>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={TABLE}>
                    <thead>
                      <tr>
                        {['نام', 'سهمیه', 'استفاده‌شده', 'انتقالی', 'مانده'].map((h) => (
                          <th key={h} style={TH}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {balances.map((b) => (
                        <tr key={b.employeeId}>
                          <td style={TD}>
                            <strong>{b.employeeName}</strong>
                          </td>
                          <td style={{ ...TD, textAlign: 'left' }}>{money(b.entitled)}</td>
                          <td style={{ ...TD, textAlign: 'left' }}>{money(b.used)}</td>
                          <td style={{ ...TD, textAlign: 'left', color: 'var(--muted)' }}>
                            {money(b.carriedOver)}
                          </td>
                          <td
                            style={{
                              ...TD,
                              textAlign: 'left',
                              fontWeight: 700,
                              color: Number(b.remaining) <= 0 ? 'var(--danger)' : 'var(--success)',
                            }}
                          >
                            {money(b.remaining)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section style={{ display: 'grid', gap: 10 }}>
              <h2 style={H2}>{t('stfRequests')}</h2>
              {leaves.length === 0 ? (
                <p style={EMPTY}>{t('stfNoRequests')}</p>
              ) : (
                leaves.map((l) => (
                  <article
                    key={l.id}
                    style={{
                      ...CARD,
                      gap: 8,
                      opacity: l.status === 'REJECTED' ? 0.6 : 1,
                    }}
                  >
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'baseline' }}>
                      <strong style={{ fontSize: 16 }}>
                        {l.employeeName ?? nameOf(l.employeeId)}
                      </strong>
                      <span>{LEAVE_KIND_FA[l.kind] ?? l.kind}</span>
                      <span style={{ color: 'var(--muted)' }}>
                        {new Date(l.startDate).toLocaleDateString(locale)} تا{' '}
                        {new Date(l.endDate).toLocaleDateString(locale)}
                      </span>
                      <strong>{Number(l.days).toLocaleString('fa-IR')} روز</strong>
                      <span
                        style={{
                          marginInlineStart: 'auto',
                          fontWeight: 700,
                          color:
                            l.status === 'APPROVED'
                              ? 'var(--success)'
                              : l.status === 'REJECTED'
                                ? 'var(--danger)'
                                : 'var(--warning)',
                        }}
                      >
                        {LEAVE_STATUS_FA[l.status] ?? l.status}
                      </span>
                    </div>
                    {l.reason ? (
                      <div style={{ fontSize: 14, color: 'var(--muted)' }}>{l.reason}</div>
                    ) : null}
                    {l.status === 'PENDING' ? (
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          type="button"
                          onClick={() => decide(l, true)}
                          disabled={busy === l.id}
                          style={BTN}
                        >
                          {t('confirm')}
                        </button>
                        <button
                          type="button"
                          onClick={() => decide(l, false)}
                          disabled={busy === l.id}
                          style={{ ...BTN, color: 'var(--danger)' }}
                        >
                          {t('vcReject')}
                        </button>
                      </div>
                    ) : null}
                  </article>
                ))
              )}
            </section>
          </>
        ) : null}

        {tab === 'payroll' ? (
          <>
            <section style={CARD}>
              <h2 style={H2}>صدور فیش — دورهٔ {period}</h2>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <Field label="کارمند">
                  <select value={slEmp} onChange={(e) => setSlEmp(e.target.value)} style={INPUT}>
                    {employees
                      .filter((e) => e.isActive)
                      .map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.firstName} {e.lastName}
                        </option>
                      ))}
                  </select>
                </Field>
                <Field label="اضافه‌کار (ساعت)">
                  <input
                    value={slOvertime}
                    onChange={(e) => setSlOvertime(e.target.value)}
                    style={{ ...INPUT, maxWidth: 110 }}
                    inputMode="decimal"
                  />
                </Field>
                <Field label="پاداش">
                  <input
                    value={slBonus}
                    onChange={(e) => setSlBonus(e.target.value)}
                    style={{ ...INPUT, maxWidth: 140 }}
                    inputMode="numeric"
                  />
                </Field>
                <Field label="کسورات">
                  <input
                    value={slDeduct}
                    onChange={(e) => setSlDeduct(e.target.value)}
                    style={{ ...INPUT, maxWidth: 140 }}
                    inputMode="numeric"
                  />
                </Field>
                <button
                  type="button"
                  onClick={createSlip}
                  disabled={busy === 'slip'}
                  style={BTN_PRIMARY}
                >
                  {busy === 'slip' ? '…' : 'صدور فیش'}
                </button>
              </div>
            </section>

            <section style={{ display: 'grid', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <h2 style={H2}>{t('stfPayslips')}</h2>
                <span style={{ marginInlineStart: 'auto', fontSize: 14, color: 'var(--muted)' }}>
                  جمع خالص پرداختی: <strong>{money(payrollTotal)}</strong> ریال
                </span>
              </div>

              {periodSlips.length === 0 ? (
                <p style={EMPTY}>{t('stfNoPayslip')}</p>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={TABLE}>
                    <thead>
                      <tr>
                        {['نام', 'پایه', 'مزایا', 'اضافه‌کار', 'پاداش', 'کسورات', 'بیمه', 'مالیات', 'خالص', 'وضعیت', ''].map(
                          (h) => (
                            <th key={h} style={TH}>
                              {h}
                            </th>
                          ),
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {periodSlips.map((s) => (
                        <tr key={s.id}>
                          <td style={TD}>
                            <strong>{s.employeeName ?? nameOf(s.employeeId)}</strong>
                          </td>
                          <td style={{ ...TD, textAlign: 'left' }}>{money(s.baseSalary)}</td>
                          <td style={{ ...TD, textAlign: 'left' }}>{money(s.allowances)}</td>
                          <td style={{ ...TD, textAlign: 'left' }}>{money(s.overtimePay)}</td>
                          <td style={{ ...TD, textAlign: 'left' }}>{money(s.bonus)}</td>
                          <td style={{ ...TD, textAlign: 'left', color: 'var(--danger)' }}>
                            {money(s.deductions)}
                          </td>
                          <td style={{ ...TD, textAlign: 'left', color: 'var(--danger)' }}>
                            {money(s.insurance)}
                          </td>
                          <td style={{ ...TD, textAlign: 'left', color: 'var(--danger)' }}>
                            {money(s.tax)}
                          </td>
                          <td style={{ ...TD, textAlign: 'left', fontWeight: 700 }}>
                            {money(s.netPay)}
                          </td>
                          <td style={TD}>
                            <span
                              style={{
                                color: s.status === 'PAID' ? 'var(--success)' : 'var(--muted)',
                                fontWeight: s.status === 'PAID' ? 700 : 400,
                              }}
                            >
                              {SLIP_STATUS_FA[s.status] ?? s.status}
                            </span>
                          </td>
                          <td style={{ ...TD, whiteSpace: 'nowrap' }}>
                            {/* فقط گام بعدی نشان داده می‌شود: پیش‌نویس
                                تأیید می‌خواهد، تأییدشده پرداخت. */}
                            {s.status === 'DRAFT' ? (
                              <button
                                type="button"
                                onClick={() => slipAction(s, 'approve')}
                                disabled={busy === s.id}
                                style={BTN_SM}
                              >
                                {t('confirm')}
                              </button>
                            ) : null}
                            {s.status === 'APPROVED' ? (
                              <button
                                type="button"
                                onClick={() => slipAction(s, 'pay')}
                                disabled={busy === s.id}
                                style={BTN_SM}
                              >
                                {t('payment')}
                              </button>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        ) : null}
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
  padding: '6px 10px',
  fontSize: 13,
  minHeight: 34,
};

const CHIP: React.CSSProperties = {
  ...BTN,
  padding: '8px 16px',
  fontSize: 14,
  minHeight: 40,
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
  minWidth: 720,
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

'use client';

/**
 * شیفت و گزارش فروش.
 *
 * شش مسیر API که هیچ صفحه‌ای صدایشان نمی‌زد.  بدون این صفحه، «آخر شب
 * چقدر فروختیم و صندوق چقدر باید داشته باشد» فقط با `curl` قابل
 * جواب دادن بود.
 *
 * شیفت و گزارش عمداً یک‌جا هستند: هر دو کارِ آخرِ شبِ مدیرند و پشت سر
 * هم انجام می‌شوند — شیفت را می‌بندی، بعد می‌بینی چه فروختی.
 */

import { useCallback, useEffect, useState } from 'react';

import AppShell from '../../../components/AppShell';
import { api } from '../../../lib/api';
import { useI18n } from '../../../lib/i18n-context';

type Shift = {
  id: string;
  userId: string | null;
  firstName: string | null;
  lastName: string | null;
  openingCash: string | number | null;
  closingCash: string | number | null;
  totalSales: string | number | null;
  tipsAmount: string | number | null;
  ordersCount: number | null;
  startedAt: string;
  endedAt: string | null;
  note: string | null;
};

type TopItem = {
  menuItemId: string | null;
  name: string;
  qty: string | number;
  revenue: string | number;
};

type Stats = {
  openOrders?: number;
  todayOrders?: number;
  todaySales?: number;
  avgTicket?: number;
  guests?: number;
  freeTables?: number;
  tables?: number;
};

const money = (v: string | number | null | undefined) =>
  v === null || v === undefined || v === '' ? '—' : Number(v).toLocaleString('fa-IR');

function localDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** بازه‌های آمادهٔ گزارش — تایپ تاریخ آخر شب کار کسی نیست. */
const RANGES = [
  { days: 1, label: 'امروز' },
  { days: 7, label: '۷ روز' },
  { days: 30, label: '۳۰ روز' },
  { days: 90, label: '۹۰ روز' },
];

export default function ShiftPage() {
  const { locale } = useI18n();

  const [shifts, setShifts] = useState<Shift[]>([]);
  const [top, setTop] = useState<TopItem[]>([]);
  const [stats, setStats] = useState<Stats>({});
  const [days, setDays] = useState(30);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const [openingCash, setOpeningCash] = useState('0');
  const [closingCash, setClosingCash] = useState('');

  const load = useCallback(async () => {
    try {
      // `from` محلی ساخته می‌شود نه با toISOString روی نیمه‌شب: در
      // تهران آن روش یک روز عقب می‌رود.
      const from = new Date();
      from.setDate(from.getDate() - days + 1);
      from.setHours(0, 0, 0, 0);

      const [s, t, st] = await Promise.all([
        api<Shift[]>('/restaurant/shifts'),
        api<TopItem[]>(
          `/restaurant/reports/top-items?from=${localDate(from)}&limit=20`,
        ),
        api<Stats>('/restaurant/stats'),
      ]);
      setShifts(s);
      setTop(t);
      setStats(st);
      setError('');
    } catch (caught) {
      setError((caught as Error).message);
    }
  }, [days]);

  useEffect(() => {
    void load();
  }, [load]);

  const flash = (m: string) => {
    setNote(m);
    window.setTimeout(() => setNote(''), 2500);
  };

  // شیفت باز، اگر هست.  سرویس فهرست را نزولی برمی‌گرداند، پس اولین
  // ردیفِ بدون `endedAt` همان شیفت جاری است.
  const openShift = shifts.find((s) => !s.endedAt) ?? null;

  const doOpen = async () => {
    setBusy('open');
    try {
      await api('/restaurant/shifts/open', {
        method: 'POST',
        body: { openingCash: Number(openingCash) || 0 },
      });
      flash('شیفت باز شد');
      setOpeningCash('0');
      await load();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const doClose = async () => {
    if (!openShift) return;
    setBusy('close');
    try {
      await api(`/restaurant/shifts/${openShift.id}/close`, {
        method: 'POST',
        body: { closingCash: Number(closingCash) || 0 },
      });
      flash('شیفت بسته شد');
      setClosingCash('');
      await load();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const totalRevenue = top.reduce((s, i) => s + Number(i.revenue || 0), 0);

  return (
    <AppShell title="شیفت و گزارش">
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

        <section style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
          <Tile label="سفارش‌های باز" value={String(stats.openOrders ?? 0)} />
          <Tile label="سفارش امروز" value={String(stats.todayOrders ?? 0)} />
          <Tile label="فروش امروز" value={money(stats.todaySales)} unit="ریال" />
          <Tile label="میانگین فاکتور" value={money(stats.avgTicket)} unit="ریال" />
          <Tile
            label="میز آزاد"
            value={`${stats.freeTables ?? 0} از ${stats.tables ?? 0}`}
          />
        </section>

        <section style={CARD}>
          <h2 style={H2}>شیفت</h2>
          {openShift ? (
            <>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 15 }}>
                <span>
                  باز شده{' '}
                  <strong>
                    {new Date(openShift.startedAt).toLocaleString(locale, {
                      hour: '2-digit',
                      minute: '2-digit',
                      day: 'numeric',
                      month: 'short',
                    })}
                  </strong>
                </span>
                <span style={{ color: 'var(--muted)' }}>
                  صندوق ابتدای شیفت: {money(openShift.openingCash)} ریال
                </span>
                {openShift.firstName || openShift.lastName ? (
                  <span style={{ color: 'var(--muted)' }}>
                    {openShift.firstName ?? ''} {openShift.lastName ?? ''}
                  </span>
                ) : null}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <Field label="موجودی شمرده‌شدهٔ صندوق">
                  <input
                    value={closingCash}
                    onChange={(e) => setClosingCash(e.target.value)}
                    style={INPUT}
                    inputMode="numeric"
                    placeholder="۰"
                  />
                </Field>
                <button type="button" onClick={doClose} disabled={busy === 'close'} style={BTN_PRIMARY}>
                  {busy === 'close' ? '…' : 'بستن شیفت'}
                </button>
                {/* فروش شیفت هنگام بستن از روی سفارش‌های تسویه‌شدهٔ همان
                    بازه محاسبه می‌شود؛ اینجا وعده‌اش را نمی‌دهیم. */}
                <span style={{ fontSize: 13, color: 'var(--muted)' }}>
                  فروش شیفت هنگام بستن محاسبه می‌شود
                </span>
              </div>
            </>
          ) : (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <Field label="موجودی ابتدای صندوق">
                <input
                  value={openingCash}
                  onChange={(e) => setOpeningCash(e.target.value)}
                  style={INPUT}
                  inputMode="numeric"
                />
              </Field>
              <button type="button" onClick={doOpen} disabled={busy === 'open'} style={BTN_PRIMARY}>
                {busy === 'open' ? '…' : 'باز کردن شیفت'}
              </button>
            </div>
          )}
        </section>

        {shifts.filter((s) => s.endedAt).length > 0 ? (
          <section style={{ display: 'grid', gap: 10 }}>
            <h2 style={H2}>شیفت‌های بسته‌شده</h2>
            <div style={{ overflowX: 'auto' }}>
              <table style={TABLE}>
                <thead>
                  <tr>
                    {['از', 'تا', 'سفارش', 'فروش', 'انعام', 'صندوق پایان', 'اختلاف'].map((h) => (
                      <th key={h} style={TH}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {shifts
                    .filter((s) => s.endedAt)
                    .map((s) => {
                      // اختلاف صندوق = آنچه شمرده شد − (ابتدای صندوق +
                      // فروش).  عددی که مدیر واقعاً دنبالش است؛ صفر
                      // یعنی حساب می‌خواند.
                      const expected =
                        Number(s.openingCash ?? 0) + Number(s.totalSales ?? 0);
                      const diff = Number(s.closingCash ?? 0) - expected;
                      return (
                        <tr key={s.id}>
                          <td style={TD}>
                            {new Date(s.startedAt).toLocaleString(locale, {
                              day: 'numeric',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </td>
                          <td style={TD}>
                            {s.endedAt
                              ? new Date(s.endedAt).toLocaleTimeString(locale, {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })
                              : '—'}
                          </td>
                          <td style={TD}>{s.ordersCount ?? 0}</td>
                          <td style={{ ...TD, textAlign: 'left' }}>{money(s.totalSales)}</td>
                          <td style={{ ...TD, textAlign: 'left' }}>{money(s.tipsAmount)}</td>
                          <td style={{ ...TD, textAlign: 'left' }}>{money(s.closingCash)}</td>
                          <td
                            style={{
                              ...TD,
                              textAlign: 'left',
                              color: diff === 0 ? 'var(--muted)' : diff < 0 ? '#b91c1c' : '#b45309',
                              fontWeight: diff === 0 ? 400 : 700,
                            }}
                          >
                            {diff === 0 ? '۰' : `${diff > 0 ? '+' : '−'}${money(Math.abs(diff))}`}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        <section style={{ display: 'grid', gap: 10 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <h2 style={{ ...H2, marginInlineEnd: 8 }}>پرفروش‌ها</h2>
            {RANGES.map((r) => (
              <button
                key={r.days}
                type="button"
                onClick={() => setDays(r.days)}
                style={days === r.days ? CHIP_ON : CHIP}
              >
                {r.label}
              </button>
            ))}
            <span style={{ marginInlineStart: 'auto', fontSize: 14, color: 'var(--muted)' }}>
              جمع: <strong>{money(totalRevenue)}</strong> ریال
            </span>
          </div>

          {top.length === 0 ? (
            <p style={{ padding: 32, textAlign: 'center', color: 'var(--muted)' }}>
              در این بازه فروشی ثبت نشده
            </p>
          ) : (
            <div style={{ display: 'grid', gap: 6 }}>
              {top.map((item, idx) => {
                // نوار سهم نسبت به پرفروش‌ترین قلم — ستون عدد به‌تنهایی
                // فاصله‌ها را نشان نمی‌دهد.
                const max = Number(top[0]?.revenue || 1);
                const pct = Math.max(2, (Number(item.revenue) / max) * 100);
                return (
                  <div
                    key={`${item.menuItemId ?? item.name}-${idx}`}
                    style={{ display: 'grid', gap: 4 }}
                  >
                    <div style={{ display: 'flex', gap: 8, fontSize: 15 }}>
                      <span style={{ color: 'var(--muted)', minWidth: 24 }}>{idx + 1}</span>
                      <strong>{item.name}</strong>
                      {/* قلمی که غذایش حذف شده هنوز در تاریخچه هست؛
                          بی‌نشان گذاشتنش گمراه‌کننده است. */}
                      {item.menuItemId === null ? (
                        <span style={{ color: 'var(--muted)', fontSize: 12 }}>
                          (از منو حذف شده)
                        </span>
                      ) : null}
                      <span style={{ marginInlineStart: 'auto', color: 'var(--muted)' }}>
                        {Number(item.qty).toLocaleString('fa-IR')} عدد
                      </span>
                      <strong style={{ minWidth: 100, textAlign: 'left' }}>
                        {money(item.revenue)}
                      </strong>
                    </div>
                    <div style={{ height: 6, background: 'var(--border)', borderRadius: 3 }}>
                      <div
                        style={{
                          width: `${pct}%`,
                          height: '100%',
                          background: 'var(--accent)',
                          borderRadius: 3,
                        }}
                      />
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

function Tile({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div style={{ ...CARD, gap: 4 }}>
      <span style={{ fontSize: 13, color: 'var(--muted)' }}>{label}</span>
      <strong style={{ fontSize: 22 }}>
        {value}
        {unit ? <span style={{ fontSize: 13, fontWeight: 400 }}> {unit}</span> : null}
      </strong>
    </div>
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

const CHIP: React.CSSProperties = {
  ...BTN,
  padding: '6px 12px',
  fontSize: 13,
  minHeight: 34,
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
  minWidth: 680,
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

const ALERT: React.CSSProperties = {
  padding: 12,
  borderRadius: 10,
  background: '#b91c1c22',
  color: '#b91c1c',
};

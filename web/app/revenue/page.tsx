'use client';

/**
 * دریافت‌های وصول‌شده.
 *
 * دو مسیر API داشت و هیچ صفحه‌ای صدایشان نمی‌زد.
 *
 * ⚠️ این صفحه عمداً **فقط خواندنی** است.
 *
 *    خودِ کنترلر هم همین است و دلیلش را نوشته: رسید تنها از راهِ
 *    زیرسامانه‌ای ساخته می‌شود که مالکِ سندِ پرداخت‌شده است (قبض،
 *    پروانه، فاکتور).  هیچ مسیری وجود ندارد که بتواند صندوق را بدونِ
 *    سندِ متناظر بستانکار کند.
 *
 *    افزودنِ دکمهٔ «ثبت دریافت» به این صفحه دقیقاً همان درِ پشتی را
 *    باز می‌کرد.  نبودش امکانِ ازقلم‌افتاده نیست؛ خودِ طراحی است.
 *
 * ⚠️ چیزی که این صفحه باید بی‌درنگ جواب بدهد:
 *    **امروز چقدر وصول شد و از کدام زیرسامانه.**
 *    تفکیکِ زیرسامانه همان عددی است که حسابداری می‌خواهد و در هیچ
 *    گزارشِ دیگری کنارِ هم نیست.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import AppShell from '../../components/AppShell';
import { api } from '../../lib/api';
import { useI18n } from '../../lib/i18n-context';

type Receipt = {
  id: string;
  receiptNo: string;
  entityType: string;
  entityId: string | null;
  amount: string | number;
  method: string | null;
  payerName: string | null;
  reference: string | null;
  paidAt: string | null;
  cashBoxName: string | null;
  treasuryAccountName: string | null;
};

type Stats = {
  total: number;
  totalAmount: number;
  byEntityType: Record<string, { count: number; amount: number }>;
};

/**
 * ⚠️ نامِ زیرسامانه از سرور خام می‌آید (`MunicipalBill`, …).
 *
 *    نگاشتِ ناقص نباید متن را خالی کند: هر کلیدی که اینجا نباشد،
 *    خودش نمایش داده می‌شود.  زیرسامانهٔ تازه‌ای که اضافه شود، در
 *    بدترین حالت انگلیسی دیده می‌شود، نه ناپدید.
 */
const ENTITY_FA: Record<string, string> = {
  MunicipalBill: 'قبض عوارض',
  BusinessLicense: 'پروانهٔ کسب',
  ConstructionProject: 'پروژهٔ عمرانی',
  Sale: 'فروش',
  SalesOrder: 'سفارش فروش',
  Contract: 'قرارداد',
  Parking: 'پارکینگ',
  UtilityMeter: 'کنتور خدماتی',
  PropertyAudit: 'ممیزی املاک',
};

const METHOD_FA: Record<string, string> = {
  CASH: 'نقدی',
  CARD: 'کارت',
  TRANSFER: 'حواله',
  CHEQUE: 'چک',
  ONLINE: 'آنلاین',
  POS: 'کارت‌خوان',
};

const money = (v: string | number) =>
  Number(v ?? 0).toLocaleString('fa-IR', { maximumFractionDigits: 0 });

/** تاریخِ امروز به شکلی که میدانِ `date` می‌پذیرد. */
function isoDay(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

export default function RevenuePage() {
  const { t } = useI18n();

  const [list, setList] = useState<Receipt[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [from, setFrom] = useState(isoDay(-30));
  const [to, setTo] = useState(isoDay());
  const [entityType, setEntityType] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    setError('');
    const qs = new URLSearchParams();
    if (from) qs.set('from', from);
    if (to) qs.set('to', to);
    if (entityType) qs.set('entityType', entityType);

    try {
      // ⚠️ هر دو با هم: اگر جدا بارگذاری شوند، خلاصه و فهرست می‌توانند
      //    دو بازهٔ متفاوت را نشان بدهند و عددها با هم نخوانند.
      const [rows, s] = await Promise.all([
        api<Receipt[]>(`/revenue/receipts?${qs.toString()}`),
        api<Stats>(`/revenue/stats?${qs.toString()}`),
      ]);
      setList(rows);
      setStats(s);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  }, [from, to, entityType]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * زیرسامانه‌ها به ترتیبِ مبلغ.
   *
   * فهرست از `stats` ساخته می‌شود نه از `list`: فهرست سقفِ تعداد دارد
   * و اگر از آن ساخته شود، زیرسامانه‌ای که رسیدهایش بیرونِ سقف افتاده
   * از تفکیک حذف می‌شود — یعنی جمعِ تفکیک با جمعِ کل نمی‌خواند.
   */
  const breakdown = useMemo(() => {
    if (!stats) return [];
    return Object.entries(stats.byEntityType).sort((a, b) => b[1].amount - a[1].amount);
  }, [stats]);

  return (
    <AppShell title={t('menuRevenue')}>
      <div style={{ display: 'grid', gap: 16 }}>
        {error ? (
          <div role="alert" style={ALERT}>
            {error}
          </div>
        ) : null}

        <section style={CARD}>
          <h2 style={H2}>بازه</h2>
          <div style={FORM}>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={LABEL}>از</span>
              <input style={INPUT} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={LABEL}>تا</span>
              <input style={INPUT} type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={LABEL}>زیرسامانه</span>
              <select
                style={INPUT}
                value={entityType}
                onChange={(e) => setEntityType(e.target.value)}
              >
                <option value="">همه</option>
                {breakdown.map(([key]) => (
                  <option key={key} value={key}>
                    {ENTITY_FA[key] ?? key}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        {stats ? (
          <section style={CARD}>
            <h2 style={H2}>
              جمعِ وصولی{' '}
              <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: 14 }}>
                {stats.total} رسید
              </span>
            </h2>
            <p style={{ margin: 0, fontSize: 26, fontWeight: 700 }}>
              {money(stats.totalAmount)}{' '}
              <span style={{ fontSize: 14, fontWeight: 400, color: 'var(--muted)' }}>ریال</span>
            </p>

            {breakdown.length === 0 ? (
              <p style={EMPTY}>در این بازه دریافتی ثبت نشده است.</p>
            ) : (
              <div style={{ display: 'grid', gap: 8 }}>
                {breakdown.map(([key, value]) => {
                  // نسبت نسبت به بزرگ‌ترین، نه به جمع: با یک زیرسامانهٔ
                  // غالب، همهٔ نوارهای دیگر نامرئی می‌شدند.
                  const max = breakdown[0][1].amount || 1;
                  const pct = Math.max(2, Math.round((value.amount / max) * 100));
                  return (
                    <div key={key} style={{ display: 'grid', gap: 4 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                        <span>
                          {ENTITY_FA[key] ?? key}{' '}
                          <span style={{ color: 'var(--muted)' }}>({value.count})</span>
                        </span>
                        <span style={{ fontWeight: 700 }}>{money(value.amount)}</span>
                      </div>
                      <div
                        style={{
                          height: 6,
                          borderRadius: 3,
                          background: 'var(--border)',
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          style={{ width: `${pct}%`, height: '100%', background: 'var(--accent)' }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        ) : null}

        <section style={CARD}>
          <h2 style={H2}>
            رسیدها{' '}
            {busy ? (
              <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: 14 }}>
                در حال بارگذاری…
              </span>
            ) : null}
          </h2>

          {list.length === 0 && !busy ? (
            <p style={EMPTY}>رسیدی در این بازه نیست.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                <thead>
                  <tr>
                    <th style={TH}>شماره</th>
                    <th style={TH}>زیرسامانه</th>
                    <th style={TH}>پرداخت‌کننده</th>
                    <th style={TH}>روش</th>
                    <th style={TH}>مقصد</th>
                    <th style={TH}>تاریخ</th>
                    <th style={{ ...TH, textAlign: 'end' }}>مبلغ</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((r) => (
                    <tr key={r.id}>
                      <td style={{ ...TD, fontFamily: 'ui-monospace, monospace' }}>{r.receiptNo}</td>
                      <td style={TD}>{ENTITY_FA[r.entityType] ?? r.entityType}</td>
                      <td style={TD}>
                        {r.payerName ?? <span style={{ color: 'var(--muted)' }}>—</span>}
                      </td>
                      <td style={TD}>{r.method ? (METHOD_FA[r.method] ?? r.method) : '—'}</td>
                      <td style={TD}>
                        {/* صندوق یا حسابِ خزانه — دقیقاً یکی از این دو پر است. */}
                        {r.cashBoxName ?? r.treasuryAccountName ?? (
                          <span style={{ color: 'var(--muted)' }}>—</span>
                        )}
                      </td>
                      <td style={TD}>
                        {r.paidAt ? new Date(r.paidAt).toLocaleDateString('fa-IR') : '—'}
                      </td>
                      <td style={{ ...TD, textAlign: 'end', fontWeight: 700 }}>{money(r.amount)}</td>
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
  gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
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

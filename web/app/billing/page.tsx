'use client';

/**
 * اشتراک و تمدید.
 *
 * ---------- چرا صفحهٔ جدا و نه بخشی از تنظیمات ----------
 *
 * ⚠️ این صفحه باید با اشتراکِ **منقضی** هم کار کند.
 *
 *    مسیرهای `/billing` و `/subscription` در `edition.interceptor.ts`
 *    از قاعدهٔ «منقضی ⇒ فقط‌خواندنی» مستثنا هستند.  اگر این صفحه به
 *    مسیرهای دیگری تکیه کند، مشتریِ منقضی صفحه‌ای می‌بیند که پر از
 *    خطاست — درست در لحظه‌ای که می‌خواهد پول بدهد.
 */

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

import AppShell from '../../components/AppShell';
import { DataTable, ROW, TD, TOUCH } from '../../components/ui';
import { api } from '../../lib/api';
import { useI18n } from '../../lib/i18n-context';

type Mine = {
  plan: string | null;
  status: string | null;
  endsOn: string | null;
  active: boolean;
  daysLeft: number | null;
  reason: string | null;
};

type Term = { months: number; amountRial: number };

type Offer = {
  plan: string;
  title: string;
  note: string | null;
  monthlyRial: number;
  terms: Term[];
};

type Invoice = {
  id: string;
  plan: string;
  months: number;
  amountRial: string;
  status: string;
  trackingCode: string | null;
  paidAt: string | null;
  createdAt: string;
};

function Billing() {
  const { t, locale } = useI18n();
  const params = useSearchParams();

  const [mine, setMine] = useState<Mine | null>(null);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [choice, setChoice] = useState<{ plan: string; months: number } | null>(
    null,
  );
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const fa = useCallback(
    (value: unknown) => Number(value ?? 0).toLocaleString(locale),
    [locale],
  );

  const load = useCallback(async () => {
    try {
      const [m, p, inv] = await Promise.all([
        api<Mine>('/subscription/mine'),
        api<Offer[]>('/billing/plans'),
        // نقشِ صندوق‌دار صورت‌حساب نمی‌بیند؛ نبودنش نباید صفحه را بشکند.
        api<Invoice[]>('/billing/invoices').catch(() => []),
      ]);
      setMine(m ?? null);
      setOffers(Array.isArray(p) ? p : []);
      setInvoices(Array.isArray(inv) ? inv : []);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('fetchError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * بازگشت از درگاه.
   *
   * ⚠️ تأیید **همیشه** فرستاده می‌شود، حتی وقتی درگاه «ناموفق»
   *    برگردانده.
   *
   *    زرین‌پال گاهی `Status=NOK` می‌دهد در حالی که پول کم شده؛ تنها
   *    منبعِ حقیقت، پرس‌وجوی تأیید است نه پارامترِ نشانی.  و چون
   *    سرور صورت‌حسابِ پرداخت‌شده را دوباره تمدید نمی‌کند، فرستادنِ
   *    اضافه بی‌خطر است.
   */
  const invoiceId = params?.get('invoice') ?? '';

  useEffect(() => {
    if (!invoiceId) return;

    let cancelled = false;
    setBusy(true);

    api<{ ok?: boolean; error?: string; endsOn?: string }>(
      `/billing/verify/${invoiceId}`,
      { method: 'POST' },
    )
      .then((result) => {
        if (cancelled) return;
        if (result?.ok) {
          setNotice(t('billingPaid'));
          setError('');
        } else {
          setError(result?.error ?? t('billingFailed'));
        }
        return load();
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : t('billingFailed'));
        }
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });

    return () => {
      cancelled = true;
    };
  }, [invoiceId, load, t]);

  async function buy() {
    if (!choice) return;

    setBusy(true);
    try {
      const result = await api<{ redirectUrl?: string }>('/billing/start', {
        method: 'POST',
        body: { plan: choice.plan, months: choice.months },
      });

      if (result?.redirectUrl) {
        window.location.href = result.redirectUrl;
        return;
      }
      setError(t('billingNoGateway'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('actionError'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell title={t('billingTitle')} subtitle={t('billingSubtitle')}>
      {error ? <div className="error">{error}</div> : null}
      {notice ? (
        <div className="card" style={{ borderColor: 'var(--success)' }}>
          <strong style={{ color: 'var(--success)' }}>{notice}</strong>
        </div>
      ) : null}

      {/* ───── وضعیت فعلی ───── */}
      <div className="card">
        <h3 style={{ marginTop: 0 }}>{t('billingCurrent')}</h3>
        {loading ? (
          <p className="muted">{t('loading')}</p>
        ) : (
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            <div>
              <div className="muted">{t('vendorColPlan')}</div>
              <strong>{mine?.plan ?? t('vendorNoSub')}</strong>
            </div>
            <div>
              <div className="muted">{t('vendorColStatus')}</div>
              <strong
                style={{
                  color: mine?.active ? 'var(--success)' : 'var(--danger)',
                }}
              >
                {mine?.active ? t('vendorActive') : t('vendorInactive')}
              </strong>
            </div>
            <div>
              <div className="muted">{t('vendorColEndsOn')}</div>
              <strong dir="ltr">
                {mine?.endsOn ? mine.endsOn.slice(0, 10) : '—'}
              </strong>
            </div>
            <div>
              <div className="muted">{t('vendorColDaysLeft')}</div>
              <strong>
                {mine?.daysLeft === null || mine?.daysLeft === undefined
                  ? '—'
                  : fa(mine.daysLeft)}
              </strong>
            </div>
          </div>
        )}

        {/* ⚠️ دلیلِ قطع صریح نوشته می‌شود.  «سرویس شما فعال نیست» بدونِ
            علت، کاربر را به پشتیبانی می‌فرستد تا همان جمله را بشنود. */}
        {mine && !mine.active && mine.reason ? (
          <p style={{ color: 'var(--danger)', marginBottom: 0 }}>
            {mine.reason}
          </p>
        ) : null}
      </div>

      {/* ───── خرید ───── */}
      <div className="card">
        <h3 style={{ marginTop: 0 }}>{t('billingBuy')}</h3>

        {offers.length === 0 ? (
          <p className="muted">{t('billingContactVendor')}</p>
        ) : (
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            {offers.map((offer) =>
              offer.terms.map((term) => {
                const selected =
                  choice?.plan === offer.plan && choice?.months === term.months;

                return (
                  <button
                    key={`${offer.plan}-${term.months}`}
                    type="button"
                    onClick={() =>
                      setChoice({ plan: offer.plan, months: term.months })
                    }
                    style={{
                      ...TOUCH,
                      minWidth: 190,
                      textAlign: 'start',
                      borderColor: selected ? 'var(--accent)' : 'var(--border)',
                      borderWidth: selected ? 2 : 1,
                      borderStyle: 'solid',
                    }}
                  >
                    <div style={{ fontWeight: 700 }}>{offer.title}</div>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {`${fa(term.months)} ${t('vendorMonths')}`}
                    </div>
                    {/* ⚠️ واحد **ریال** نوشته می‌شود، نه تومان.
                        کلِ سامانه ریال است و «۲۵٬۰۰۰٬۰۰۰» بی‌واحد،
                        ده برابر یا یک‌دهمِ چیزی است که کاربر فکر
                        می‌کند. */}
                    <div style={{ marginTop: 6 }}>
                      {`${fa(term.amountRial)} ${t('rial')}`}
                    </div>
                  </button>
                );
              }),
            )}
          </div>
        )}

        {choice ? (
          <div style={{ marginTop: 16 }}>
            <button
              type="button"
              style={TOUCH}
              disabled={busy}
              onClick={() => void buy()}
            >
              {busy ? t('loading') : t('billingGoToGateway')}
            </button>
          </div>
        ) : null}
      </div>

      {/* ───── تاریخچه ───── */}
      <div className="card">
        <h3 style={{ marginTop: 0 }}>{t('billingHistory')}</h3>
        <DataTable
          headers={[
            t('vendorColPlan'),
            t('vendorMonths'),
            t('amount'),
            t('vendorColStatus'),
            t('billingTracking'),
            t('date'),
          ]}
          empty={t('billingNoInvoice')}
          loading={loading}
          loadingLabel={t('loading')}
          rows={invoices.length}
        >
          {invoices.map((row) => (
            <tr key={row.id} style={ROW}>
              <td style={TD}>{row.plan}</td>
              <td style={TD}>{fa(row.months)}</td>
              <td style={TD}>{fa(row.amountRial)}</td>
              <td style={TD}>
                <span
                  style={{
                    color:
                      row.status === 'PAID'
                        ? 'var(--success)'
                        : row.status === 'PENDING'
                          ? 'var(--warning)'
                          : 'var(--danger)',
                  }}
                >
                  {t(`billingStatus${row.status}`)}
                </span>
              </td>
              <td style={TD} dir="ltr">
                {row.trackingCode ?? '—'}
              </td>
              <td style={TD} dir="ltr">
                {row.createdAt.slice(0, 10)}
              </td>
            </tr>
          ))}
        </DataTable>
      </div>
    </AppShell>
  );
}

/**
 * ⚠️ `useSearchParams` مرزِ Suspense می‌خواهد.
 *
 *    بدونش `next build` می‌شکند — خودِ ساخت می‌گیردش، نه اجرا.  مرز
 *    این‌جاست تا فقط همین صفحه منتظر بماند، نه کلِ پوسته.
 */
export default function BillingPage() {
  return (
    <Suspense fallback={null}>
      <Billing />
    </Suspense>
  );
}

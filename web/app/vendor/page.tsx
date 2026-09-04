'use client';

/**
 * پنلِ فروشنده — فهرستِ مشتریان و اشتراکشان.
 *
 * ---------- چرا لازم است ----------
 *
 * ⚠️ تا امروز تنها راهِ تمدیدِ اشتراکِ یک مشتری، `UPDATE` دستی در
 *    پایگاه‌داده بود.  یعنی هر تمدید یک ssh می‌خواست، و روزی که کسی
 *    اشتباه تایپ کند، سرویسِ مشتری قطع می‌شود بی‌آنکه ردی بماند.
 *
 * ---------- چه چیزی این‌جا نیست ----------
 *
 * ⚠️ این صفحه شرکت **نمی‌سازد**.  ثبت‌نامِ خودکار کارِ `/signup` است و
 *    فروشنده فقط نسخه و انقضا را تنظیم می‌کند.  یک صفحه که هم شرکت
 *    بسازد و هم اشتراک بدهد، در لحظهٔ اشتباه دو چیز را با هم خراب
 *    می‌کند.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import AppShell from '../../components/AppShell';
import { DataTable, ROW, StatCard, TD, TOUCH } from '../../components/ui';
import { api } from '../../lib/api';
import { useI18n } from '../../lib/i18n-context';
import { isVendor } from '../../lib/session';

type Customer = {
  companyId: string | null;
  companyName: string;
  plan: string | null;
  status: string | null;
  endsOn: string | null;
  maxUsers: number | null;
  userCount: number;
  active: boolean;
  daysLeft: number | null;
  reason: string | null;
};

type Plan = {
  plan: string;
  title: string;
  maxUsers: number | null;
  maxBranches: number | null;
  note: string | null;
};

/** انقضاهای پیشنهادی — ماه‌های واقعیِ فروش، نه عددِ گرد. */
const TERMS = [1, 3, 6, 12] as const;

export default function VendorPage() {
  const { t, locale } = useI18n();

  const [rows, setRows] = useState<Customer[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState({ plan: '', months: 12, status: 'ACTIVE' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  const allowed = isVendor();

  const fa = useCallback(
    (value: unknown) => Number(value ?? 0).toLocaleString(locale),
    [locale],
  );

  const load = useCallback(async () => {
    try {
      const [c, p] = await Promise.all([
        api<Customer[]>('/subscription/customers'),
        api<Plan[]>('/subscription/plans'),
      ]);
      setRows(Array.isArray(c) ? c : []);
      setPlans(Array.isArray(p) ? p : []);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('fetchError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (!allowed) {
      setLoading(false);
      return;
    }
    void load();
  }, [allowed, load]);

  const stats = useMemo(() => {
    // ⚠️ «رو به انقضا» یعنی ۳۰ روز، نه ۷.  تمدید تماس و پرداخت می‌خواهد؛
    //    یک هفته برای هر دو کافی نیست و مشتری در روزِ صفر قطع می‌شود.
    const soon = rows.filter(
      (r) => r.active && r.daysLeft !== null && r.daysLeft <= 30,
    ).length;

    return {
      total: rows.length,
      active: rows.filter((r) => r.active).length,
      expired: rows.filter((r) => !r.active).length,
      soon,
    };
  }, [rows]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.companyName.toLowerCase().includes(q));
  }, [rows, query]);

  function beginEdit(row: Customer) {
    setEditing(row.companyId);
    setDraft({
      plan: row.plan ?? plans[0]?.plan ?? 'BASIC',
      months: 12,
      status: 'ACTIVE',
    });
  }

  /**
   * ⚠️ انقضا از **امروز** حساب می‌شود، نه از انقضای قبلی.
   *
   *    تمدیدِ زنجیره‌ای درست‌تر به نظر می‌رسد، ولی مشتری‌ای که شش ماه
   *    قطع بوده و حالا پول می‌دهد، شش ماهِ گذشته را نمی‌خرد.  اگر روزی
   *    تمدیدِ پیوسته لازم شد، باید صریح انتخاب شود نه پیش‌فرض.
   */
  async function save(companyId: string) {
    setBusy(true);
    try {
      const endsOn = new Date();
      endsOn.setMonth(endsOn.getMonth() + draft.months);

      await api(`/subscription/customers/${companyId}`, {
        method: 'PUT',
        body: {
          plan: draft.plan,
          status: draft.status,
          endsOn: endsOn.toISOString().slice(0, 10),
        },
      });

      setEditing(null);
      await load();
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('actionError'));
    } finally {
      setBusy(false);
    }
  }

  /** قطعِ فوری — بدونِ تغییرِ نسخه، تا وصلِ دوباره همان را برگرداند. */
  async function suspend(companyId: string) {
    setBusy(true);
    try {
      await api(`/subscription/customers/${companyId}`, {
        method: 'PUT',
        body: { status: 'SUSPENDED' },
      });
      await load();
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('actionError'));
    } finally {
      setBusy(false);
    }
  }

  if (!allowed) {
    return (
      <AppShell title={t('vendorTitle')} subtitle={t('vendorSubtitle')}>
        <div className="card">
          <p className="muted">{t('vendorForbidden')}</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      title={t('vendorTitle')}
      subtitle={t('vendorSubtitle')}
      actions={
        <button type="button" className="btn-sm" onClick={() => void load()}>
          {t('refresh')}
        </button>
      }
    >
      {error ? <div className="error">{error}</div> : null}

      <div className="stats-grid">
        <StatCard icon="building" label={t('vendorStatTotal')} value={fa(stats.total)} />
        <StatCard
          icon="check"
          label={t('vendorStatActive')}
          value={fa(stats.active)}
          accent="var(--success)"
        />
        <StatCard
          icon="alert"
          label={t('vendorStatSoon')}
          value={fa(stats.soon)}
          accent="var(--warning)"
        />
        <StatCard
          icon="alert"
          label={t('vendorStatExpired')}
          value={fa(stats.expired)}
          accent="var(--danger)"
        />
      </div>

      <div className="card">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('search')}
          style={{ ...TOUCH, minWidth: 220, marginBottom: 14 }}
        />

        <DataTable
          headers={[
            t('vendorColCompany'),
            t('vendorColPlan'),
            t('vendorColStatus'),
            t('vendorColEndsOn'),
            t('vendorColDaysLeft'),
            t('vendorColUsers'),
            '',
          ]}
          empty={t('vendorEmpty')}
          loading={loading}
          loadingLabel={t('loading')}
          rows={visible.length}
        >
          {visible.map((row) => (
            <tr key={row.companyId ?? row.companyName} style={ROW}>
              <td style={TD}>{row.companyName}</td>
              <td style={TD}>
                {row.plan
                  ? (plans.find((p) => p.plan === row.plan)?.title ?? row.plan)
                  : t('vendorNoSub')}
              </td>
              <td style={TD}>
                <span
                  style={{
                    color: row.active ? 'var(--success)' : 'var(--danger)',
                  }}
                >
                  {row.active ? t('vendorActive') : t('vendorInactive')}
                </span>
              </td>
              <td style={TD} dir="ltr">
                {row.endsOn ? row.endsOn.slice(0, 10) : '—'}
              </td>
              <td style={TD}>
                {row.daysLeft === null ? '—' : fa(row.daysLeft)}
              </td>
              <td style={TD}>
                {fa(row.userCount)}
                {row.maxUsers ? ` / ${fa(row.maxUsers)}` : ''}
              </td>
              <td style={TD}>
                {row.companyId ? (
                  <button
                    type="button"
                    className="btn-sm"
                    onClick={() => beginEdit(row)}
                  >
                    {t('vendorRenew')}
                  </button>
                ) : null}
              </td>
            </tr>
          ))}
        </DataTable>

        {editing ? (
          <div
            style={{
              display: 'flex',
              gap: 10,
              flexWrap: 'wrap',
              alignItems: 'center',
              marginTop: 18,
              padding: 14,
              borderRadius: 'var(--radius)',
              background: 'var(--panel-strong)',
            }}
          >
            <strong>
              {rows.find((r) => r.companyId === editing)?.companyName}
            </strong>

            <select
              value={draft.plan}
              onChange={(e) => setDraft({ ...draft, plan: e.target.value })}
              style={{ ...TOUCH, minWidth: 170 }}
            >
              {plans.map((p) => (
                <option key={p.plan} value={p.plan}>
                  {p.title}
                </option>
              ))}
            </select>

            <select
              value={draft.months}
              onChange={(e) =>
                setDraft({ ...draft, months: Number(e.target.value) })
              }
              style={{ ...TOUCH, minWidth: 140 }}
            >
              {TERMS.map((m) => (
                <option key={m} value={m}>
                  {`${fa(m)} ${t('vendorMonths')}`}
                </option>
              ))}
            </select>

            <button
              type="button"
              style={TOUCH}
              disabled={busy}
              onClick={() => void save(editing)}
            >
              {t('save')}
            </button>
            <button
              type="button"
              className="btn-sm"
              disabled={busy}
              onClick={() => void suspend(editing)}
            >
              {t('vendorSuspend')}
            </button>
            <button
              type="button"
              className="btn-sm"
              onClick={() => setEditing(null)}
            >
              {t('close')}
            </button>
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}

'use client';

/**
 * کالابرگ الکترونیکی — حساب‌ها، تخصیص اعتبار و تسویه.
 *
 * هشت مسیر API و بیست‌وسه سنجهٔ آزمون وجود داشت و **هیچ صفحه‌ای
 * صدایشان نمی‌زد**.  یعنی ساختن حساب، شارژ اعتبار و گرفتن گزارش تسویه
 * فقط با `curl` ممکن بود — و در `MIGRATION_STATUS` هم تنها بندی بود که
 * پس از بررسیِ همهٔ بندها واقعاً باز ماند.
 *
 * سه بخش در یک صفحه، چون کاربر بینشان جابه‌جا می‌شود: حساب را پیدا
 * می‌کند، اعتبارش را شارژ می‌کند، و آخر دوره تسویه می‌گیرد.
 */

import { useCallback, useEffect, useState } from 'react';

import AppShell from '../../components/AppShell';
import { Icon } from '../../components/icons';
import { api } from '../../lib/api';
import { useI18n } from '../../lib/i18n-context';

type Account = {
  id: string;
  nationalCode: string;
  holderName: string | null;
  phone: string | null;
  householdSize: number | null;
  balance: string | number;
  periodCode: string | null;
  isActive: boolean;
};

type Settlement = {
  totalUsed?: string | number;
  count?: number;
};

const box: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 14,
  padding: 14,
};

export default function RationPage() {
  const { t, locale } = useI18n();
  const fa = useCallback(
    (v: unknown) => Number(v ?? 0).toLocaleString(locale),
    [locale],
  );

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [flash, setFlash] = useState('');
  const [busy, setBusy] = useState(false);

  const [form, setForm] = useState({
    nationalCode: '',
    holderName: '',
    phone: '',
    householdSize: '',
  });

  const [alloc, setAlloc] = useState({ id: '', amount: '', periodCode: '' });
  const [settlement, setSettlement] = useState<Settlement | null>(null);

  const load = useCallback(async () => {
    try {
      const query = search.trim()
        ? `?search=${encodeURIComponent(search.trim())}`
        : '';
      const rows = await api<Account[] | { data: Account[] }>(
        `/ration/accounts${query}`,
      );
      setAccounts(Array.isArray(rows) ? rows : (rows.data ?? []));
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('fetchError'));
    }
  }, [search, t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createAccount() {
    // ⚠️ کدِ ملی تنها کلیدِ یکتای حساب است؛ بدونش رکوردی می‌ماند که
    //    هیچ‌وقت با صندوق جور درنمی‌آید.
    if (!form.nationalCode.trim()) {
      setError(t('rationNeedCode'));
      return;
    }

    setBusy(true);
    try {
      await api('/ration/accounts', {
        method: 'POST',
        body: {
          nationalCode: form.nationalCode.trim(),
          holderName: form.holderName.trim() || undefined,
          phone: form.phone.trim() || undefined,
          householdSize: form.householdSize
            ? Number(form.householdSize)
            : undefined,
        },
      });
      setForm({ nationalCode: '', holderName: '', phone: '', householdSize: '' });
      setFlash(t('rationCreated'));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('saveError'));
    } finally {
      setBusy(false);
    }
  }

  async function allocate() {
    if (!alloc.id || !alloc.amount || !alloc.periodCode.trim()) {
      setError(t('rationNeedAlloc'));
      return;
    }

    setBusy(true);
    try {
      await api(`/ration/accounts/${alloc.id}/allocate`, {
        method: 'POST',
        body: {
          amount: Number(alloc.amount),
          periodCode: alloc.periodCode.trim(),
        },
      });
      setAlloc({ id: '', amount: '', periodCode: '' });
      setFlash(t('rationAllocated'));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('saveError'));
    } finally {
      setBusy(false);
    }
  }

  async function loadSettlement() {
    try {
      setSettlement(await api<Settlement>('/ration/settlement'));
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('fetchError'));
    }
  }

  return (
    <AppShell title={t('menuRation')}>
      {flash ? (
        <div
          style={{
            ...box,
            borderColor: 'var(--success)',
            color: 'var(--success)',
            marginBottom: 12,
          }}
        >
          {flash}
        </div>
      ) : null}
      {error ? (
        <div
          style={{
            ...box,
            borderColor: 'var(--danger)',
            color: 'var(--danger)',
            marginBottom: 12,
          }}
        >
          {error}
        </div>
      ) : null}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: 14,
          alignItems: 'start',
        }}
      >
        {/* ---------- حساب تازه ---------- */}
        <section style={box}>
          <h2 style={{ fontSize: 15, marginBottom: 10 }}>
            {t('rationNewAccount')}
          </h2>

          <div style={{ display: 'grid', gap: 8 }}>
            <input
              placeholder={t('rationNationalCode')}
              value={form.nationalCode}
              inputMode="numeric"
              onChange={(e) => setForm({ ...form, nationalCode: e.target.value })}
            />
            <input
              placeholder={t('rationHolder')}
              value={form.holderName}
              onChange={(e) => setForm({ ...form, holderName: e.target.value })}
            />
            <input
              placeholder={t('phone')}
              value={form.phone}
              inputMode="numeric"
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
            <input
              placeholder={t('rationHousehold')}
              value={form.householdSize}
              inputMode="numeric"
              onChange={(e) =>
                setForm({ ...form, householdSize: e.target.value })
              }
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => void createAccount()}
            >
              <Icon name="plus" size={16} /> {t('add')}
            </button>
          </div>
        </section>

        {/* ---------- تخصیص اعتبار ---------- */}
        <section style={box}>
          <h2 style={{ fontSize: 15, marginBottom: 10 }}>
            {t('rationAllocate')}
          </h2>

          <div style={{ display: 'grid', gap: 8 }}>
            <select
              value={alloc.id}
              onChange={(e) => setAlloc({ ...alloc, id: e.target.value })}
            >
              <option value="">{t('rationPickAccount')}</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.holderName || a.nationalCode} — {fa(a.balance)}
                </option>
              ))}
            </select>
            <input
              placeholder={t('amount')}
              value={alloc.amount}
              inputMode="numeric"
              onChange={(e) => setAlloc({ ...alloc, amount: e.target.value })}
            />
            {/* ⚠️ دورهٔ تخصیص اجباری است: بدونش دو شارژِ یک ماه از هم
                قابل تفکیک نیست و تسویه با دولت نمی‌خواند. */}
            <input
              placeholder={t('rationPeriod')}
              value={alloc.periodCode}
              onChange={(e) => setAlloc({ ...alloc, periodCode: e.target.value })}
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => void allocate()}
            >
              <Icon name="money" size={16} /> {t('rationAllocate')}
            </button>
          </div>
        </section>

        {/* ---------- تسویه ---------- */}
        <section style={box}>
          <h2 style={{ fontSize: 15, marginBottom: 10 }}>
            {t('rationSettlement')}
          </h2>

          <button type="button" onClick={() => void loadSettlement()}>
            <Icon name="chart" size={16} /> {t('rationLoadSettlement')}
          </button>

          {settlement ? (
            <div style={{ marginTop: 10, display: 'grid', gap: 6, fontSize: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span className="muted">{t('rationTotalUsed')}</span>
                <strong style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {fa(settlement.totalUsed)}
                </strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span className="muted">{t('count')}</span>
                <strong>{fa(settlement.count)}</strong>
              </div>
            </div>
          ) : null}
        </section>
      </div>

      {/* ---------- فهرست حساب‌ها ---------- */}
      <section style={{ ...box, marginTop: 14 }}>
        <div
          style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}
        >
          <input
            placeholder={t('search')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ flex: 1, minWidth: 180 }}
          />
        </div>

        {accounts.length === 0 ? (
          <p className="muted">{t('noData')}</p>
        ) : (
          <div className="table-wrap">
            <table className="stack-table" style={{ width: '100%', fontSize: 13 }}>
              <thead>
                <tr style={{ color: 'var(--text-dim)' }}>
                  <th style={{ padding: 8, textAlign: 'start' }}>
                    {t('rationHolder')}
                  </th>
                  <th style={{ padding: 8, textAlign: 'start' }}>
                    {t('rationNationalCode')}
                  </th>
                  <th style={{ padding: 8, textAlign: 'start' }}>{t('phone')}</th>
                  <th style={{ padding: 8, textAlign: 'start' }}>
                    {t('rationHousehold')}
                  </th>
                  <th style={{ padding: 8, textAlign: 'start' }}>
                    {t('balance')}
                  </th>
                  <th style={{ padding: 8, textAlign: 'start' }}>
                    {t('status')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((a) => (
                  <tr key={a.id}>
                    <td style={{ padding: 8 }} data-primary>
                      {a.holderName || '—'}
                    </td>
                    <td
                      style={{ padding: 8, fontVariantNumeric: 'tabular-nums' }}
                      data-label={t('rationNationalCode')}
                    >
                      {a.nationalCode}
                    </td>
                    <td
                      style={{ padding: 8, fontVariantNumeric: 'tabular-nums' }}
                      data-label={t('phone')}
                    >
                      {a.phone || '—'}
                    </td>
                    <td style={{ padding: 8 }} data-label={t('rationHousehold')}>
                      {a.householdSize ? fa(a.householdSize) : '—'}
                    </td>
                    <td
                      style={{
                        padding: 8,
                        fontWeight: 700,
                        fontVariantNumeric: 'tabular-nums',
                      }}
                      data-label={t('balance')}
                    >
                      {fa(a.balance)}
                    </td>
                    <td style={{ padding: 8 }} data-label={t('status')}>
                      <span className="badge">
                        {a.isActive ? t('active') : t('inactive')}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </AppShell>
  );
}

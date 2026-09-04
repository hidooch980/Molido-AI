'use client';

import { useCallback, useEffect, useState } from 'react';

import AppShell from '../../components/AppShell';
import { Icon } from '../../components/icons';
import { DataTable, NUM, ROW, TD, TOUCH } from '../../components/ui';
import { api } from '../../lib/api';
import { useI18n } from '../../lib/i18n-context';

type Stats = {
  activeCount?: string | number;
  totalCost?: string | number;
  totalDepreciation?: string | number;
  totalBookValue?: string | number;
};

type Asset = {
  id: string;
  assetNo: string;
  name: string;
  category: string | null;
  location: string | null;
  purchasePrice: string | number;
  salvageValue: string | number | null;
  usefulLifeYears: number | null;
  accumulatedDepreciation: string | number;
  bookValue: string | number;
  depreciationMethod: string;
  status: string;
};

const METHODS = ['STRAIGHT_LINE', 'DECLINING_BALANCE', 'NONE'] as const;

/** اولین روز ماه جاری — دورهٔ پیش‌فرض استهلاک. */
function currentPeriod(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .slice(0, 10);
}

export default function AssetsPage() {
  const { t, locale } = useI18n();

  const [stats, setStats] = useState<Stats | null>(null);
  const [rows, setRows] = useState<Asset[]>([]);
  const [period, setPeriod] = useState(currentPeriod());
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const [form, setForm] = useState({
    name: '',
    category: '',
    location: '',
    purchasePrice: '',
    salvageValue: '0',
    usefulLifeYears: '5',
    depreciationMethod: 'STRAIGHT_LINE' as (typeof METHODS)[number],
    inServiceDate: new Date().toISOString().slice(0, 10),
  });

  const fa = useCallback(
    (value: unknown) => Number(value ?? 0).toLocaleString(locale),
    [locale],
  );

  const load = useCallback(async () => {
    try {
      const [s, list] = await Promise.all([
        api<Stats>('/assets/stats'),
        api<Asset[]>('/assets'),
      ]);

      setStats(s);
      setRows(Array.isArray(list) ? list : []);
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

  async function submit() {
    if (!form.name.trim() || !Number(form.purchasePrice)) return;

    setBusy(true);
    try {
      await api('/assets', {
        method: 'POST',
        body: {
          name: form.name.trim(),
          category: form.category.trim() || undefined,
          location: form.location.trim() || undefined,
          purchasePrice: Number(form.purchasePrice),
          salvageValue: Number(form.salvageValue) || 0,
          usefulLifeYears: Number(form.usefulLifeYears) || null,
          depreciationMethod: form.depreciationMethod,
          inServiceDate: form.inServiceDate,
        },
      });

      setForm({ ...form, name: '', purchasePrice: '' });
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('saveError'));
    } finally {
      setBusy(false);
    }
  }

  async function runDepreciation() {
    setBusy(true);
    try {
      const result = await api<{ count: number; total: number }>(
        '/assets/depreciation/run',
        { method: 'POST', body: { period } },
      );

      // تعداد و مبلغ صریح نشان داده می‌شود چون اجرای دوباره برای همان ماه
      // عمداً صفر برمی‌گرداند؛ بدون این عدد، کاربر فکر می‌کند کار نکرده.
      setMessage(
        `${t('depreciationRan')}: ${fa(result.count)} — ${fa(result.total)}`,
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('actionError'));
    } finally {
      setBusy(false);
    }
  }

  async function dispose(asset: Asset) {
    if (!window.confirm(t('confirmDispose'))) return;

    const answer = window.prompt(
      `${asset.name} — ${t('bookValue')}: ${fa(asset.bookValue)}\n${t('proceeds')}`,
      '0',
    );
    if (answer === null) return;

    setBusy(true);
    try {
      await api(`/assets/${asset.id}/dispose`, {
        method: 'POST',
        body: { proceeds: Number(answer) || 0 },
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('actionError'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell
      title={t('assetsTitle')}
      subtitle={t('assetsSubtitle')}
      actions={
        <button type="button" className="btn-sm" onClick={() => void load()}>
          {t('refresh')}
        </button>
      }
    >
      {error ? <div className="error">{error}</div> : null}
      {message ? (
        <div
          className="card"
          style={{ borderInlineStart: '4px solid var(--success)' }}
        >
          {message}
        </div>
      ) : null}

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon"><Icon name="building" size={22} /></div>
          <div className="stat-label">{t('statAssetCount')}</div>
          <div className="stat-value">{fa(stats?.activeCount)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon"><Icon name="money" size={22} /></div>
          <div className="stat-label">{t('statAssetCost')}</div>
          <div className="stat-value">{fa(stats?.totalCost)}</div>
        </div>
        <div className="stat-card" style={{ borderTop: '3px solid var(--warning)' }}>
          <div className="stat-icon"><Icon name="trendDown" size={22} /></div>
          <div className="stat-label">{t('statAccumulated')}</div>
          <div className="stat-value">{fa(stats?.totalDepreciation)}</div>
        </div>
        <div className="stat-card" style={{ borderTop: '3px solid var(--success)' }}>
          <div className="stat-icon"><Icon name="ledger" size={22} /></div>
          <div className="stat-label">{t('statBookValue')}</div>
          <div className="stat-value">{fa(stats?.totalBookValue)}</div>
        </div>
      </div>

      {/* اجرای استهلاک */}
      <div
        className="card"
        style={{
          margin: '18px 0',
          display: 'flex',
          gap: 10,
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <label htmlFor="asset-period" className="muted">{t('depPeriod')}</label>
        <input id="asset-period"
          type="date"
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          style={TOUCH}
        />
        <button
          type="button"
          style={TOUCH}
          disabled={busy}
          onClick={() => void runDepreciation()}
        >
          <Icon name="settings" size={18} /> {t('runDepreciation')}
        </button>

        <button
          type="button"
          className={showForm ? 'ghost' : ''}
          style={{ ...TOUCH, marginInlineStart: 'auto' }}
          onClick={() => setShowForm((v) => !v)}
        >
          {showForm ? t('cancel') : `+ ${t('newAsset')}`}
        </button>
      </div>

      {/* فرم ثبت دارایی */}
      {showForm ? (
        <div className="card" style={{ marginBottom: 18 }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: 12,
            }}
          >
            <label>
              <div className="muted" style={{ marginBottom: 4 }}>
                {t('name')}
              </div>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                style={{ ...TOUCH, width: '100%' }}
              />
            </label>

            <label>
              <div className="muted" style={{ marginBottom: 4 }}>
                {t('assetCategory')}
              </div>
              <input
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                style={{ ...TOUCH, width: '100%' }}
              />
            </label>

            <label>
              <div className="muted" style={{ marginBottom: 4 }}>
                {t('location')}
              </div>
              <input
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                style={{ ...TOUCH, width: '100%' }}
              />
            </label>

            <label>
              <div className="muted" style={{ marginBottom: 4 }}>
                {t('purchasePrice2')}
              </div>
              <input
                type="number"
                min={0}
                value={form.purchasePrice}
                onChange={(e) =>
                  setForm({ ...form, purchasePrice: e.target.value })
                }
                style={{ ...TOUCH, width: '100%' }}
              />
            </label>

            <label>
              <div className="muted" style={{ marginBottom: 4 }}>
                {t('salvageValue')}
              </div>
              <input
                type="number"
                min={0}
                value={form.salvageValue}
                onChange={(e) =>
                  setForm({ ...form, salvageValue: e.target.value })
                }
                style={{ ...TOUCH, width: '100%' }}
              />
            </label>

            <label>
              <div className="muted" style={{ marginBottom: 4 }}>
                {t('usefulLife')}
              </div>
              <input
                type="number"
                min={1}
                value={form.usefulLifeYears}
                onChange={(e) =>
                  setForm({ ...form, usefulLifeYears: e.target.value })
                }
                style={{ ...TOUCH, width: '100%' }}
              />
            </label>

            <label>
              <div className="muted" style={{ marginBottom: 4 }}>
                {t('depMethod')}
              </div>
              <select
                value={form.depreciationMethod}
                onChange={(e) =>
                  setForm({
                    ...form,
                    depreciationMethod: e.target
                      .value as (typeof METHODS)[number],
                  })
                }
                style={{ ...TOUCH, width: '100%' }}
              >
                {METHODS.map((method) => (
                  <option key={method} value={method}>
                    {t(`method${method}`)}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <div className="muted" style={{ marginBottom: 4 }}>
                {t('date')}
              </div>
              <input
                type="date"
                value={form.inServiceDate}
                onChange={(e) =>
                  setForm({ ...form, inServiceDate: e.target.value })
                }
                style={{ ...TOUCH, width: '100%' }}
              />
            </label>
          </div>

          <button
            type="button"
            style={{ ...TOUCH, marginTop: 14 }}
            disabled={busy || !form.name.trim() || !Number(form.purchasePrice)}
            onClick={() => void submit()}
          >
            {t('save')}
          </button>
        </div>
      ) : null}

      <div className="card">
        <DataTable
          headers={[
            t('assetNo'),
            t('name'),
            t('purchasePrice2'),
            t('accumulated'),
            t('bookValue'),
            t('depMethod'),
            t('status'),
            t('actions'),
          ]}
          empty={t('noAssets')}
          loading={loading}
          loadingLabel={t('loading')}
          rows={rows.length}
        >
          {rows.map((asset) => (
            <tr key={asset.id} style={ROW}>
              <td style={TD} className="muted">
                {asset.assetNo}
              </td>
              <td style={TD}>
                {asset.name}
                {asset.category ? (
                  <div className="muted" style={{ fontSize: 12 }}>
                    {asset.category}
                  </div>
                ) : null}
              </td>
              <td style={NUM}>{fa(asset.purchasePrice)}</td>
              <td style={{ ...NUM, color: 'var(--warning)' }}>
                {fa(asset.accumulatedDepreciation)}
              </td>
              <td style={{ ...NUM, fontWeight: 700 }}>{fa(asset.bookValue)}</td>
              <td style={TD} className="muted">
                {t(`method${asset.depreciationMethod}`)}
              </td>
              <td
                style={{
                  ...TD,
                  color:
                    asset.status === 'ACTIVE'
                      ? 'var(--success)'
                      : asset.status === 'FULLY_DEPRECIATED'
                        ? 'var(--warning)'
                        : 'var(--text-dim)',
                }}
              >
                {t(`aStatus${asset.status}`)}
              </td>
              <td style={TD}>
                {['ACTIVE', 'FULLY_DEPRECIATED', 'IDLE'].includes(
                  asset.status,
                ) ? (
                  <button
                    type="button"
                    className="ghost"
                    style={TOUCH}
                    disabled={busy}
                    onClick={() => void dispose(asset)}
                  >
                    {t('dispose')}
                  </button>
                ) : null}
              </td>
            </tr>
          ))}
        </DataTable>
      </div>
    </AppShell>
  );
}

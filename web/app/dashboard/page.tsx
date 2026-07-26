'use client';

import { useEffect, useState } from 'react';
import AppShell from '../../components/AppShell';
import { api } from '../../lib/api';
import { getLang, localeFor, t, type Lang } from '../../lib/i18n';

type Dashboard = Record<string, unknown>;

type Notification = {
  id?: string;
  title?: string;
  message?: string;
};

const STATS: Array<{ key: string; icon: string; color: string }> = [
  { key: 'todaySales', icon: '💰', color: '' },
  { key: 'monthSales', icon: '📈', color: 'c2' },
  { key: 'todayInvoices', icon: '🧾', color: 'c3' },
  { key: 'monthExpenses', icon: '💸', color: 'c4' },
  { key: 'productsCount', icon: '📦', color: 'c2' },
  { key: 'customersCount', icon: '👥', color: '' },
  { key: 'lowStockCount', icon: '⚠️', color: 'c4' },
  { key: 'cashBalance', icon: '🏦', color: 'c3' },
];

export default function DashboardPage() {
  const [lang, setLang] = useState<Lang>('fa');
  const [data, setData] = useState<Dashboard | null>(null);
  const [notifications, setNotifications] = useState<Array<Notification>>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    setLang(getLang());

    api<Dashboard>('/reports/dashboard')
      .then(setData)
      .catch((err) =>
        setError(err instanceof Error ? err.message : 'خطا در دریافت اطلاعات'),
      );

    api<Array<Notification> | { notifications?: Array<Notification> }>(
      '/notifications',
    )
      .then((result) =>
        setNotifications(
          Array.isArray(result) ? result : (result.notifications ?? []),
        ),
      )
      .catch(() => undefined);
  }, []);

  function formatNumber(value: unknown): string {
    const num = Number(value ?? 0);

    return Number.isFinite(num) ? num.toLocaleString(localeFor(lang)) : '-';
  }

  return (
    <AppShell title={t('dashboardTitle', lang)} subtitle={t('overview', lang)}>
      {error ? <div className="error">{error}</div> : null}

      {!data && !error ? (
        <div className="stats-grid">
          {STATS.map((item) => (
            <div key={item.key} className="skeleton" />
          ))}
        </div>
      ) : null}

      {data ? (
        <div className="stats-grid">
          {STATS.map((item) => (
            <div key={item.key} className="stat-card">
              <div className={`stat-icon ${item.color}`.trim()}>{item.icon}</div>
              <div className="stat-label">{t(item.key, lang)}</div>
              <div className="stat-value">{formatNumber(data[item.key])}</div>
            </div>
          ))}
        </div>
      ) : null}

      <div className="card">
        <h3 style={{ marginBottom: 10 }}>🔔 {t('notifications', lang)}</h3>

        {notifications.length === 0 ? (
          <p className="muted">{t('noNotifications', lang)}</p>
        ) : (
          notifications.slice(0, 8).map((item, index) => (
            <div key={item.id ?? index} className="notif-item">
              <span className="notif-dot" />
              <div>
                {item.title ? (
                  <div style={{ fontWeight: 600 }}>{item.title}</div>
                ) : null}
                <div className="muted">{item.message ?? ''}</div>
              </div>
            </div>
          ))
        )}
      </div>
    </AppShell>
  );
}

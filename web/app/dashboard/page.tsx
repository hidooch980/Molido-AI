'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, clearToken, getToken } from '../../lib/api';
import {
  LANGS,
  dirFor,
  getLang,
  localeFor,
  setLangStorage,
  t,
  type Lang,
} from '../../lib/i18n';

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

const MENU: Array<{ key: string; icon: string; active?: boolean }> = [
  { key: 'menuDashboard', icon: '🏠', active: true },
  { key: 'menuSales', icon: '🛒' },
  { key: 'menuProducts', icon: '📦' },
  { key: 'menuCustomers', icon: '👥' },
  { key: 'menuPos', icon: '💳' },
  { key: 'menuMunicipality', icon: '🏛️' },
  { key: 'menuReports', icon: '📊' },
];

export default function DashboardPage() {
  const router = useRouter();
  const [lang, setLang] = useState<Lang>('fa');
  const [data, setData] = useState<Dashboard | null>(null);
  const [notifications, setNotifications] = useState<Array<Notification>>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    setLang(getLang());
  }, []);

  useEffect(() => {
    document.documentElement.dir = dirFor(lang);
    document.documentElement.lang = lang;
  }, [lang]);

  useEffect(() => {
    if (!getToken()) {
      router.replace('/');
      return;
    }

    api<Dashboard>('/reports/dashboard')
      .then(setData)
      .catch((err) =>
        setError(err instanceof Error ? err.message : t('fetchError', lang)),
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  function switchLang(next: Lang) {
    setLang(next);
    setLangStorage(next);
  }

  function logout() {
    clearToken();
    router.replace('/');
  }

  function formatNumber(value: unknown): string {
    const num = Number(value ?? 0);

    return Number.isFinite(num) ? num.toLocaleString(localeFor(lang)) : '-';
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand-row">
          <div className="mini-logo">M</div>
          <div>
            <div style={{ fontWeight: 800 }}>{t('appName', lang)}</div>
            <div className="muted" style={{ fontSize: 11.5 }}>
              v2.0
            </div>
          </div>
        </div>

        {MENU.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`nav-item${item.active ? ' active' : ''}`}
          >
            <span>{item.icon}</span>
            <span>{t(item.key, lang)}</span>
            {!item.active ? (
              <span className="soon">{t('comingSoon', lang)}</span>
            ) : null}
          </button>
        ))}
      </aside>

      <main className="main">
        <div className="topbar">
          <div>
            <h1>{t('dashboardTitle', lang)}</h1>
            <div className="sub">{t('overview', lang)}</div>
          </div>

          <div className="actions">
            <div className="lang-pills" style={{ marginBottom: 0 }}>
              {LANGS.map((item) => (
                <button
                  key={item.code}
                  type="button"
                  className={`lang-pill${lang === item.code ? ' active' : ''}`}
                  onClick={() => switchLang(item.code)}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <button type="button" className="danger" onClick={logout}>
              {t('logout', lang)}
            </button>
          </div>
        </div>

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
                <div className={`stat-icon ${item.color}`.trim()}>
                  {item.icon}
                </div>
                <div className="stat-label">{t(item.key, lang)}</div>
                <div className="stat-value">
                  {formatNumber(data[item.key])}
                </div>
              </div>
            ))}
          </div>
        ) : null}

        <div className="card">
          <h3 style={{ marginBottom: 10 }}>
            🔔 {t('notifications', lang)}
          </h3>

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
      </main>
    </div>
  );
}

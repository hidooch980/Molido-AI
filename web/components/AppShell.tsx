'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { clearToken, getToken } from '../lib/api';
import { LANGS, type Lang } from '../lib/i18n';
import { useI18n } from '../lib/i18n-context';
import { hasFeature, type FeatureKey } from '../lib/product';

export type NavItem = {
  href: string;
  label: string;
  icon: string;
  /** در نوار پایین موبایل نمایش داده شود */
  primary?: boolean;
  /** اگر تعیین شود، فقط در محصولی دیده می‌شود که این قابلیت را دارد */
  feature?: FeatureKey;
};

export const NAV: NavItem[] = [
  // label کلید ترجمه است؛ متن در زمان رندر ساخته می‌شود.
  { href: '/dashboard', label: 'menuDashboard', icon: '🏠', primary: true },
  { href: '/pos', label: 'menuCashier', icon: '💳', primary: true, feature: 'retail' as FeatureKey },
  { href: '/restaurant', label: 'menuRestaurant', icon: '☕', primary: true, feature: 'restaurant' as FeatureKey },
  { href: '/products', label: 'menuProducts', icon: '📦', primary: true },
  { href: '/inventory', label: 'menuInventory', icon: '🏬', primary: true },
  { href: '/stock-count', label: 'menuStockCount', icon: '📋' },
  { href: '/customers', label: 'menuCustomers', icon: '👥' },
  { href: '/sales', label: 'menuSales', icon: '🧾' },
  { href: '/sales-chain', label: 'menuChain', icon: '🔗' },
  { href: '/sales-agents', label: 'menuAgents', icon: '🧑‍💼' },
  { href: '/returns', label: 'menuReturns', icon: '↩️' },
  { href: '/accounting', label: 'menuAccounting', icon: '📒', feature: 'finance' as FeatureKey },
  { href: '/assets', label: 'menuAssets', icon: '🏢', feature: 'finance' as FeatureKey },
  { href: '/fiscal-year', label: 'menuFiscalYear', icon: '📅', feature: 'finance' as FeatureKey },
  { href: '/purchases', label: 'menuPurchases', icon: '📥' },
  { href: '/treasury', label: 'menuTreasury', icon: '🏦', feature: 'finance' as FeatureKey },
  { href: '/reports', label: 'menuReports2', icon: '📊' },
  { href: '/labels', label: 'menuLabels', icon: '🏷️' },
  { href: '/users', label: 'menuUsers', icon: '👤' },
];

/**
 * پوسته اپ — ریسپانسیو
 *
 * دسکتاپ: سایدبار ثابت کنار صفحه
 * موبایل: هدر بالا + نوار ناوبری پایین + منوی کشویی برای بقیه صفحات
 */
export default function AppShell({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const { lang, setLang, t } = useI18n();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    if (!getToken()) {
      router.replace('/');
      return;
    }

    setOnline(navigator.onLine);

    const up = () => setOnline(true);
    const down = () => setOnline(false);

    window.addEventListener('online', up);
    window.addEventListener('offline', down);

    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, [router]);

  // با تغییر صفحه، منوی کشویی بسته شود
  useEffect(() => setDrawerOpen(false), [pathname]);

  function switchLang(next: Lang) {
    setLang(next);
  }

  function logout() {
    clearToken();
    router.replace('/');
  }

  // صفحه‌ای که ماژولش در این محصول بالا نیامده نباید در منو دیده شود؛
  // وگرنه کاربر روی آن کلیک می‌کند و به ۴۰۴ می‌رسد.
  const visible = NAV.filter(
    (item) => !('feature' in item) || hasFeature(item.feature as FeatureKey),
  );

  const primary = visible.filter((item) => item.primary);

  return (
    <div className="shell">
      {/* ───── سایدبار دسکتاپ ───── */}
      <aside className="sidebar">
        <div className="brand-row">
          <div className="mini-logo">M</div>
          <div>
            <div style={{ fontWeight: 800 }}>Molido AI</div>
            <div className="muted" style={{ fontSize: 11.5 }}>
              v2.1
            </div>
          </div>
        </div>

        <nav>
          {visible.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-item${pathname === item.href ? ' active' : ''}`}
            >
              <span>{item.icon}</span>
              <span>{t(item.label)}</span>
            </Link>
          ))}
        </nav>

        <button type="button" className="danger sidebar-logout" onClick={logout}>
          {t('logout')}
        </button>
      </aside>

      {/* ───── منوی کشویی موبایل ───── */}
      {drawerOpen ? (
        <>
          <div
            className="drawer-backdrop"
            onClick={() => setDrawerOpen(false)}
            role="presentation"
          />
          <aside className="drawer">
            <div className="brand-row">
              <div className="mini-logo">M</div>
              <div style={{ fontWeight: 800 }}>Molido AI</div>
            </div>

            <nav>
              {visible.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`nav-item${pathname === item.href ? ' active' : ''}`}
                >
                  <span>{item.icon}</span>
                  <span>{t(item.label)}</span>
                </Link>
              ))}
            </nav>

            <div className="lang-pills" style={{ marginTop: 16 }}>
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
              {t('logout')}
            </button>
          </aside>
        </>
      ) : null}

      {/* ───── محتوای اصلی ───── */}
      <main className="main">
        {!online ? (
          <div className="offline-bar">{t('offlineBar')}</div>
        ) : null}

        <header className="topbar">
          <button
            type="button"
            className="icon-btn menu-btn"
            onClick={() => setDrawerOpen(true)}
            aria-label={t('menu')}
          >
            ☰
          </button>

          <div className="topbar-title">
            <h1>{title}</h1>
            {subtitle ? <div className="sub">{subtitle}</div> : null}
          </div>

          <div className="actions">
            {actions}

            <div className="lang-pills desktop-only" style={{ marginBottom: 0 }}>
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
          </div>
        </header>

        <div className="page">{children}</div>
      </main>

      {/* ───── نوار پایین موبایل ───── */}
      <nav className="bottom-nav">
        {primary.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`bottom-item${pathname === item.href ? ' active' : ''}`}
          >
            <span className="bi-icon">{item.icon}</span>
            <span className="bi-label">{t(item.label)}</span>
          </Link>
        ))}

        <button
          type="button"
          className="bottom-item"
          onClick={() => setDrawerOpen(true)}
        >
          <span className="bi-icon">☰</span>
          <span className="bi-label">{t('more')}</span>
        </button>
      </nav>
    </div>
  );
}

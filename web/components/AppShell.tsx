'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { clearToken, getToken } from '../lib/api';
import { LANGS, type Lang } from '../lib/i18n';
import { useI18n } from '../lib/i18n-context';
import { companyName, loadCompany } from '../lib/company';
import { hasFeature, type FeatureKey } from '../lib/product';
import {
  autoTheme,
  currentChoice,
  isDark,
  loadTheme,
  setChoice,
  watchSystemTheme,
  type ThemeKey,
} from '../lib/theme';
import CommandPalette from './CommandPalette';
import { Icon, type IconName } from './icons';

export type NavItem = {
  href: string;
  label: string;
  icon: IconName;
  /** در نوار پایین موبایل نمایش داده شود */
  primary?: boolean;
  /** اگر تعیین شود، فقط در محصولی دیده می‌شود که این قابلیت را دارد */
  feature?: FeatureKey;
};

export const NAV: NavItem[] = [
  // label کلید ترجمه است؛ متن در زمان رندر ساخته می‌شود.
  { href: '/dashboard', label: 'menuDashboard', icon: 'home', primary: true },
  { href: '/pos', label: 'menuCashier', icon: 'pos', primary: true, feature: 'retail' as FeatureKey },
  { href: '/quick-keys', label: 'menuQuickKeys', icon: 'tag', feature: 'retail' as FeatureKey },
  { href: '/restaurant', label: 'menuRestaurant', icon: 'restaurant', primary: true, feature: 'restaurant' as FeatureKey },
  { href: '/restaurant/kitchen', label: 'menuKitchen', icon: 'restaurant', feature: 'restaurant' as FeatureKey },
  { href: '/restaurant/menu', label: 'menuMenuAdmin', icon: 'clipboard', feature: 'restaurant' as FeatureKey },
  { href: '/restaurant/reservations', label: 'menuReservations', icon: 'calendar', feature: 'restaurant' as FeatureKey },
  { href: '/restaurant/shift', label: 'menuShift', icon: 'chart', feature: 'restaurant' as FeatureKey },
  { href: '/restaurant/setup', label: 'menuFloorSetup', icon: 'building', feature: 'restaurant' as FeatureKey },
  { href: '/products', label: 'menuProducts', icon: 'package', primary: true },
  { href: '/inventory', label: 'menuInventory', icon: 'warehouse', primary: true },
  { href: '/stock-count', label: 'menuStockCount', icon: 'clipboard' },
  { href: '/catalogue', label: 'menuCatalogue', icon: 'package' },
  { href: '/pricing', label: 'menuPricing', icon: 'tag' },
  { href: '/loyalty', label: 'menuLoyalty', icon: 'target' },
  { href: '/sms', label: 'menuSms', icon: 'inbox' },
  { href: '/online-orders', label: 'menuOnlineOrders', icon: 'inbox' },
  { href: '/staff', label: 'menuStaff', icon: 'users', feature: 'hr' as FeatureKey },
  { href: '/contracts', label: 'menuContracts', icon: 'clipboard' },
  { href: '/pos-terminals', label: 'menuPosTerminals', icon: 'bank' },
  { href: '/roles', label: 'menuRoles', icon: 'settings' },
  { href: '/records/customer-tickets', label: 'menuTickets', icon: 'inbox', feature: 'crm' as FeatureKey },
  { href: '/records/budget', label: 'menuBudget', icon: 'ledger', feature: 'finance' as FeatureKey },
  { href: '/records/loans', label: 'menuLoans', icon: 'bank', feature: 'finance' as FeatureKey },
  { href: '/records/investments', label: 'menuInvestments', icon: 'chart', feature: 'finance' as FeatureKey },
  { href: '/records/training', label: 'menuTraining', icon: 'users', feature: 'hr' as FeatureKey },
  { href: '/records/performance', label: 'menuPerformance', icon: 'target', feature: 'hr' as FeatureKey },
  { href: '/records/tenders', label: 'menuTenders', icon: 'clipboard' },
  { href: '/records/surveys', label: 'menuSurveys', icon: 'clipboard', feature: 'crm' as FeatureKey },
  { href: '/records/news', label: 'menuNews', icon: 'inbox' },
  { href: '/records/email-campaigns', label: 'menuEmailCampaigns', icon: 'link', feature: 'crm' as FeatureKey },
  { href: '/customers', label: 'menuCustomers', icon: 'users' },
  { href: '/sales', label: 'menuSales', icon: 'receipt' },
  { href: '/sales-chain', label: 'menuChain', icon: 'link' },
  { href: '/sales-agents', label: 'menuAgents', icon: 'agent' },
  { href: '/crm', label: 'menuCrm', icon: 'target', feature: 'crm' as FeatureKey },
  { href: '/returns', label: 'menuReturns', icon: 'return' },
  { href: '/accounting', label: 'menuAccounting', icon: 'ledger', feature: 'finance' as FeatureKey },
  { href: '/assets', label: 'menuAssets', icon: 'building', feature: 'finance' as FeatureKey },
  { href: '/fiscal-year', label: 'menuFiscalYear', icon: 'calendar', feature: 'finance' as FeatureKey },
  { href: '/purchases', label: 'menuPurchases', icon: 'inbox' },
  { href: '/purchasing', label: 'menuPurchasing', icon: 'agent' },
  { href: '/voice', label: 'menuVoice', icon: 'user' },
  { href: '/treasury', label: 'menuTreasury', icon: 'bank', feature: 'finance' as FeatureKey },
  { href: '/reports', label: 'menuReports2', icon: 'chart' },
  { href: '/labels', label: 'menuLabels', icon: 'tag' },
  { href: '/tax', label: 'menuTax', icon: 'building', feature: 'finance' as FeatureKey },
  { href: '/import', label: 'menuImport', icon: 'inbox' },
  { href: '/definitions', label: 'menuDefinitions', icon: 'settings' },
  { href: '/operations', label: 'menuOperations', icon: 'alert' },
  { href: '/settings', label: 'menuSettings', icon: 'settings' },
  { href: '/users', label: 'menuUsers', icon: 'user' },
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

  // ---------- منوی کشویی ----------
  //
  // صفحهٔ فروش و انبار جدول‌های پهن دارند؛ ۲۵۰ پیکسل منو روی نمایشگر
  // ۱۳ اینچی یعنی دو ستون کمتر.  انتخاب ذخیره می‌شود چون کسی که منو
  // را بسته، هر بار باز کردن صفحه نمی‌خواهد دوباره ببندد.
  //
  // مقدار اولیه `false` است و پس از سوارشدن از حافظه خوانده می‌شود:
  // خواندن localStorage در رندر، خروجی سرور و کلاینت را متفاوت می‌کند.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    setSidebarCollapsed(window.localStorage.getItem('molido_sidebar') === 'collapsed');
  }, []);

  function toggleSidebar() {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      window.localStorage.setItem('molido_sidebar', next ? 'collapsed' : 'open');
      return next;
    });
  }
  // نام فروشگاه یا شرکت.  تا رسیدن پاسخ، نام محصول نشان داده می‌شود —
  // جای خالی در سربرگ، صفحه را نیم‌ساخته نشان می‌دهد.
  const [brand, setBrand] = useState(t('appName'));
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
  useEffect(() => {
    void loadCompany().then(() => setBrand(companyName(t('appName'))));
  }, [t]);

  // پوسته پس از سوارشدن اعمال می‌شود، نه هنگام رندر: خواندن
  // localStorage در رندر، خروجی سرور و کلاینت را متفاوت می‌کند.
  const [theme, setThemeState] = useState<ThemeKey>('minimal');

  useEffect(() => {
    setThemeState(loadTheme());
    // اگر کاربر «خودکار» را انتخاب کرده، تغییر تنظیم سیستم باید همان
    // لحظه اثر کند — نه بعد از تازه‌سازی صفحه.
    return watchSystemTheme(setThemeState);
  }, []);

  /**
   * کلید سریع تاریک/روشن.
   *
   * سه حالت نمی‌سازد؛ فقط بین روشن و تاریک جابه‌جا می‌کند و انتخاب را
   * صریح ثبت می‌کند.  کاربری که دستی زده، دیگر نمی‌خواهد سیستم
   * تصمیم بگیرد — وگرنه انتخابش با تغییر ساعت روز از بین می‌رود.
   * «خودکار» در تنظیمات در دسترس است.
   */
  function toggleDark() {
    const next = isDark(theme) ? 'minimal' : 'night';
    setChoice(next);
    setThemeState(next);
  }

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
    <div className="shell" data-sidebar={sidebarCollapsed ? 'collapsed' : 'open'}>
      {/* Ctrl+K و کلیدهای F — سراسری، پس در پوسته می‌نشیند نه در صفحه‌ها. */}
      <CommandPalette />

      {/* ───── سایدبار دسکتاپ ───── */}
      <aside className="sidebar">
        <div className="brand-row">
          <div className="mini-logo">M</div>
          <div className="brand-text">
            <div style={{ fontWeight: 800 }}>{brand}</div>
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
              <Icon name={item.icon} />
              <span>{t(item.label)}</span>
            </Link>
          ))}
        </nav>

        <button
          type="button"
          className="sidebar-toggle"
          onClick={toggleSidebar}
          aria-label={sidebarCollapsed ? 'باز کردن منو' : 'جمع کردن منو'}
          title={sidebarCollapsed ? 'باز کردن منو' : 'جمع کردن منو'}
        >
          <Icon name="menu" size={17} />
          {!sidebarCollapsed && <span>{t('shellCollapse')}</span>}
        </button>

        <button type="button" className="danger sidebar-logout" onClick={logout}>
          <Icon name="logout" size={17} />
          <span>{t('logout')}</span>
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
              <div style={{ fontWeight: 800 }}>{brand}</div>
            </div>

            <nav>
              {visible.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`nav-item${pathname === item.href ? ' active' : ''}`}
                >
                  <Icon name={item.icon} />
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
            <Icon name="menu" size={22} />
          </button>

          <div className="topbar-title">
            <h1>{title}</h1>
            {subtitle ? <div className="sub">{subtitle}</div> : null}
          </div>

          <div className="actions">
            {actions}

            <button
              type="button"
              className="icon-btn"
              onClick={toggleDark}
              aria-label={isDark(theme) ? 'پوستهٔ روشن' : 'پوستهٔ تاریک'}
              title={isDark(theme) ? 'پوستهٔ روشن' : 'پوستهٔ تاریک'}
            >
              <Icon name={isDark(theme) ? 'sun' : 'moon'} size={19} />
            </button>

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
            <Icon name={item.icon} size={22} />
            <span className="bi-label">{t(item.label)}</span>
          </Link>
        ))}

        <button
          type="button"
          className="bottom-item"
          onClick={() => setDrawerOpen(true)}
        >
          <Icon name="more" size={22} />
          <span className="bi-label">{t('more')}</span>
        </button>
      </nav>
    </div>
  );
}

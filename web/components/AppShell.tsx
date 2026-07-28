'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { clearToken, getToken } from '../lib/api';
import { LANGS, type Lang } from '../lib/i18n';
import { useI18n } from '../lib/i18n-context';

export type BizMode = 'retail' | 'restaurant' | 'both';

export type NavItem = {
  href: string;
  label: string;
  icon: string;
  /** در نوار پایین موبایل نمایش داده شود */
  primary?: boolean;
  /** صنفی که این صفحه به آن مربوط است؛ نبودش یعنی مشترک بین همه. */
  only?: 'retail' | 'restaurant';
};

const BIZ_KEY = 'molido_biz';

export function getBiz(): BizMode {
  if (typeof window === 'undefined') return 'both';
  const v = window.localStorage.getItem(BIZ_KEY);
  return v === 'retail' || v === 'restaurant' ? v : 'both';
}

export const NAV: NavItem[] = [
  { href: '/dashboard', label: 'nav.dashboard', icon: '🏠', primary: true },
  { href: '/pos', label: 'nav.pos', icon: '💳', primary: true },
  { href: '/restaurant', label: 'nav.restaurant', icon: '☕', primary: true, only: 'restaurant' },
  { href: '/recipes', label: 'nav.recipes', icon: '📋', only: 'restaurant' },
  { href: '/products', label: 'nav.products', icon: '📦', primary: true },
  { href: '/customers', label: 'nav.customers', icon: '👥' },
  { href: '/sales', label: 'nav.sales', icon: '🧾' },
  { href: '/purchases', label: 'nav.purchases', icon: '📥' },
  { href: '/inventory', label: 'nav.inventory', icon: '🏬' },
  { href: '/returns', label: 'nav.returns', icon: '↩️' },
  { href: '/shift', label: 'nav.shift', icon: '🧮' },
  { href: '/labels', label: 'nav.labels', icon: '🏷️', only: 'retail' },
  { href: '/treasury', label: 'nav.treasury', icon: '🏦' },
  { href: '/cheques', label: 'nav.cheques', icon: '📃' },
  { href: '/expenses', label: 'nav.expenses', icon: '💸' },
  { href: '/reports', label: 'nav.reports', icon: '📊' },
  { href: '/crm', label: 'nav.crm', icon: '💎' },
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
  const [biz, setBiz] = useState<BizMode>('both');
  const [online, setOnline] = useState(true);

  useEffect(() => {
    if (!getToken()) {
      router.replace('/');
      return;
    }

    setOnline(navigator.onLine);
    setBiz(getBiz());

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

  // صفحات صنف دیگر پنهان می‌شوند تا منو برای هر کسب‌وکار تمیز بماند.
  const nav = NAV.filter((item) => !item.only || biz === 'both' || item.only === biz);
  const primary = nav.filter((item) => item.primary);

  function switchBiz(next: BizMode) {
    setBiz(next);
    window.localStorage.setItem(BIZ_KEY, next);
  }

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
          {nav.map((item) => (
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
          خروج
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
              {nav.map((item) => (
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
              {([
                { v: 'retail', icon: '🛒' },
                { v: 'restaurant', icon: '☕' },
                { v: 'both', icon: '⚯' },
              ] as const).map((b) => (
                <button
                  key={b.v}
                  type="button"
                  className={`lang-pill${biz === b.v ? ' active' : ''}`}
                  onClick={() => switchBiz(b.v)}
                  title={t('biz.' + b.v)}
                >
                  {b.icon} {t('biz.' + b.v)}
                </button>
              ))}
            </div>

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
              خروج
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

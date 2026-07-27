'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { clearToken, getToken } from '../lib/api';
import { LANGS, dirFor, getLang, setLangStorage, type Lang } from '../lib/i18n';

export type NavItem = {
  href: string;
  label: string;
  icon: string;
  /** در نوار پایین موبایل نمایش داده شود */
  primary?: boolean;
};

export const NAV: NavItem[] = [
  { href: '/dashboard', label: 'داشبورد', icon: '🏠', primary: true },
  { href: '/pos', label: 'صندوق', icon: '💳', primary: true },
  { href: '/restaurant', label: 'رستوران', icon: '☕', primary: true },
  { href: '/products', label: 'کالاها', icon: '📦', primary: true },
  { href: '/customers', label: 'مشتریان', icon: '👥' },
  { href: '/sales', label: 'فروش', icon: '🧾' },
  { href: '/purchases', label: 'ورود کالا', icon: '📥' },
  { href: '/inventory', label: 'انبار', icon: '🏬' },
  { href: '/returns', label: 'مرجوعی', icon: '↩️' },
  { href: '/shift', label: 'بستن صندوق', icon: '🧮' },
  { href: '/labels', label: 'چاپ برچسب', icon: '🏷️' },
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

  const [lang, setLang] = useState<Lang>('fa');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    if (!getToken()) {
      router.replace('/');
      return;
    }

    setLang(getLang());
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

  useEffect(() => {
    document.documentElement.dir = dirFor(lang);
    document.documentElement.lang = lang;
  }, [lang]);

  // با تغییر صفحه، منوی کشویی بسته شود
  useEffect(() => setDrawerOpen(false), [pathname]);

  function switchLang(next: Lang) {
    setLang(next);
    setLangStorage(next);
  }

  function logout() {
    clearToken();
    router.replace('/');
  }

  const primary = NAV.filter((item) => item.primary);

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
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-item${pathname === item.href ? ' active' : ''}`}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
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
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`nav-item${pathname === item.href ? ' active' : ''}`}
                >
                  <span>{item.icon}</span>
                  <span>{item.label}</span>
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
              خروج
            </button>
          </aside>
        </>
      ) : null}

      {/* ───── محتوای اصلی ───── */}
      <main className="main">
        {!online ? (
          <div className="offline-bar">آفلاین — آخرین اطلاعات ذخیره‌شده</div>
        ) : null}

        <header className="topbar">
          <button
            type="button"
            className="icon-btn menu-btn"
            onClick={() => setDrawerOpen(true)}
            aria-label="منو"
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
            <span className="bi-label">{item.label}</span>
          </Link>
        ))}

        <button
          type="button"
          className="bottom-item"
          onClick={() => setDrawerOpen(true)}
        >
          <span className="bi-icon">☰</span>
          <span className="bi-label">بیشتر</span>
        </button>
      </nav>
    </div>
  );
}

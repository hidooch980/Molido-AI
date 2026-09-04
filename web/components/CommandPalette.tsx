'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { NAV } from './AppShell';
import { Icon, type IconName } from './icons';
import { useI18n } from '../lib/i18n-context';
import { hasFeature } from '../lib/product';

/**
 * پالت فرمان — Ctrl+K
 *
 * در فروشگاه بزرگ، منوی کناری بیست‌وچند صفحه دارد.  پیدا کردن «برگشت از
 * فروش» با چشم، هر بار چند ثانیه است؛ ضرب در روزی صد بار، ضرب در ده
 * کاربر.  تایپ سه حرف سریع‌تر است.
 *
 * جستجو روی **کلید و برچسب هر سه زبان** انجام می‌شود: کاربری که رابط را
 * فارسی گذاشته ولی «sales» را تایپ می‌کند باید همان را پیدا کند.
 */

type Action = {
  id: string;
  label: string;
  hint?: string;
  icon: IconName;
  run: () => void;
};

export default function CommandPalette() {
  const router = useRouter();
  const { t, lang } = useI18n();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // میان‌برهای سراسری.
  //
  // در خانهٔ متن غیرفعال‌اند — جز Ctrl+K و Escape — وگرنه صندوق‌داری که
  // نام کالا تایپ می‌کند، با حرف «F» به صفحهٔ دیگری پرت می‌شود.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable === true;

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((value) => !value);
        return;
      }

      if (event.key === 'Escape') {
        setOpen(false);
        return;
      }

      if (typing) return;

      // کلیدهای F: همان چیزی که کاربرِ نرم‌افزارهای حسابداری ایرانی
      // انتظار دارد.  مرورگر F1، F5، F11 و F12 را برای خودش می‌خواهد،
      // پس دست‌نخورده می‌مانند.
      const shortcuts: Record<string, string> = {
        F2: '/pos',
        F3: '/products',
        F4: '/sales',
        F6: '/inventory',
        F7: '/purchases',
        F8: '/reports',
        F9: '/treasury',
      };

      const target2 = shortcuts[event.key];
      if (target2) {
        event.preventDefault();
        router.push(target2);
      }
    }

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [router]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setCursor(0);
      // فوکوس پس از رندر، وگرنه خانه هنوز در DOM نیست.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const actions = useMemo<Action[]>(() => {
    const pages = NAV.filter((item) => !item.feature || hasFeature(item.feature)).map(
      (item) => ({
        id: item.href,
        label: t(item.label),
        hint: item.href,
        icon: item.icon,
        run: () => router.push(item.href),
      }),
    );

    return pages;
  }, [t, router]);

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return actions.slice(0, 12);

    return actions
      .filter(
        (action) =>
          action.label.toLowerCase().includes(needle) ||
          action.hint?.toLowerCase().includes(needle),
      )
      .slice(0, 12);
  }, [actions, query]);

  useEffect(() => {
    setCursor(0);
  }, [query]);

  if (!open) return null;

  return (
    <div
      className="palette-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={t('commandPalette')}
      onClick={() => setOpen(false)}
    >
      <div className="palette" onClick={(event) => event.stopPropagation()}>
        <div className="palette-input">
          <Icon name="search" size={18} />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('commandHint')}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                setCursor((index) => Math.min(index + 1, results.length - 1));
              } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                setCursor((index) => Math.max(index - 1, 0));
              } else if (event.key === 'Enter' && results[cursor]) {
                event.preventDefault();
                results[cursor].run();
                setOpen(false);
              }
            }}
          />
          <kbd>Esc</kbd>
        </div>

        {results.length === 0 ? (
          <p className="muted palette-empty">{t('noData')}</p>
        ) : (
          <ul className="palette-list">
            {results.map((action, index) => (
              <li key={action.id}>
                <button
                  type="button"
                  className={index === cursor ? 'active' : ''}
                  onMouseEnter={() => setCursor(index)}
                  onClick={() => {
                    action.run();
                    setOpen(false);
                  }}
                >
                  <Icon name={action.icon} size={17} />
                  <span>{action.label}</span>
                  <code dir="ltr">{action.hint}</code>
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="palette-foot">
          <span>
            <kbd>F2</kbd> {t('menuCashier')}
          </span>
          <span>
            <kbd>F3</kbd> {t('menuProducts')}
          </span>
          <span>
            <kbd>F4</kbd> {t('menuSales')}
          </span>
          <span>
            <kbd>F6</kbd> {t('menuInventory')}
          </span>
          <span>
            <kbd>F7</kbd> {t('menuPurchases')}
          </span>
          <span>
            <kbd>F8</kbd> {t('menuReports2')}
          </span>
        </div>
      </div>
    </div>
  );
}

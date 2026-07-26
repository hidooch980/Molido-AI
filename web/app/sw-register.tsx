'use client';

import { useEffect, useState } from 'react';

type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

/**
 * ثبت Service Worker + دکمه «نصب اپ»
 *
 * • اندروید/دسکتاپ: رویداد beforeinstallprompt → دکمه نصب واقعی
 * • آیفون (Safari): این رویداد وجود ندارد، پس راهنمای دستی نمایش داده می‌شود
 */
export default function ServiceWorkerRegistrar() {
  const [deferred, setDeferred] = useState<InstallPrompt | null>(null);
  const [showIosHint, setShowIosHint] = useState(false);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    const isLocalhost =
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1';

    // در dev لوکال هم ثبت می‌شود تا قابل تست باشد؛ فقط پروتکل امن یا localhost لازم است
    if (
      'serviceWorker' in navigator &&
      (window.location.protocol === 'https:' || isLocalhost)
    ) {
      navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    }

    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone ===
        true;

    // اگر قبلاً نصب شده یا کاربر بسته باشد، چیزی نشان نده
    if (standalone || localStorage.getItem('molido_install_hidden') === '1') {
      return;
    }

    setDismissed(false);

    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const isSafari =
      /safari/i.test(navigator.userAgent) &&
      !/crios|fxios|edgios/i.test(navigator.userAgent);

    if (isIos && isSafari) {
      setShowIosHint(true);
    }

    function onPrompt(event: Event) {
      event.preventDefault();
      setDeferred(event as InstallPrompt);
    }

    window.addEventListener('beforeinstallprompt', onPrompt);

    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  function hide() {
    localStorage.setItem('molido_install_hidden', '1');
    setDismissed(true);
  }

  async function install() {
    if (!deferred) return;

    await deferred.prompt();
    await deferred.userChoice;

    setDeferred(null);
    hide();
  }

  if (dismissed || (!deferred && !showIosHint)) return null;

  return (
    <div className="install-banner">
      <div className="install-icon">📱</div>

      <div className="install-text">
        <strong>نصب Molido AI</strong>
        <span>
          {deferred
            ? 'روی دستگاه خود نصب کنید تا مثل اپ باز شود'
            : 'در سافاری: دکمه اشتراک‌گذاری ⬆️ ← «افزودن به صفحه اصلی»'}
        </span>
      </div>

      <div className="install-actions">
        {deferred ? (
          <button type="button" onClick={() => void install()}>
            نصب
          </button>
        ) : null}
        <button type="button" className="ghost" onClick={hide}>
          بستن
        </button>
      </div>
    </div>
  );
}

'use client';

import { useI18n } from '../../lib/i18n-context';

/**
 * متنِ صفحهٔ آفلاین.
 *
 * ⚠️ چرا کامپوننتِ جدا؟
 *
 *    `page.tsx` کامپوننتِ **سرور** است چون `metadata` صادر می‌کند —
 *    و کامپوننت سرور قلاب ندارد.  اولین تلاشم `useI18n()` را مستقیم
 *    داخلش گذاشت و `tsc` گرفت.
 *
 *    راهِ درست این است: صفحه سرور بماند (تا عنوانِ تب سرِ جایش
 *    باشد) و فقط متنِ دیدنی کلاینت شود.
 *
 * ⚠️ ترجمه اینجا از `localStorage` می‌آید، نه از شبکه.
 *
 *    که برای این صفحه **حیاتی** است: صفحه‌ای که فقط وقتی اینترنت
 *    قطع است دیده می‌شود، نمی‌تواند برای ترجمه‌اش درخواست بزند.
 */
export default function OfflineText() {
  const { t } = useI18n();

  return (
    <>
      <h1>{t('offTitle')}</h1>
      <p className="muted">{t('offBody')}</p>
      <a className="offline-btn" href="/dashboard">
        {t('offRetry')}
      </a>
    </>
  );
}

import OfflineText from './OfflineText';

export const metadata = { title: 'آفلاین — Molido AI' };

/**
 * صفحهٔ جایگزینِ سرویس‌ورکر وقتی شبکه نیست.
 *
 * ⚠️ کامپوننتِ **سرور** می‌ماند چون `metadata` صادر می‌کند.
 *
 *    متنِ دیدنی در `OfflineText` است که کلاینت است و ترجمه را از
 *    `localStorage` می‌خواند — نه از شبکه، که اینجا اصلاً نیست.
 */
export default function OfflinePage() {
  return (
    <div className="offline-page">
      <div className="offline-icon">📡</div>
      <OfflineText />
    </div>
  );
}

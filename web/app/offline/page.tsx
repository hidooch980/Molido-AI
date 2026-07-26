export const metadata = { title: 'آفلاین — Molido AI' };

export default function OfflinePage() {
  return (
    <div className="offline-page">
      <div className="offline-icon">📡</div>
      <h1>اتصال اینترنت برقرار نیست</h1>
      <p className="muted">
        صفحاتی که قبلاً باز کرده‌اید همچنان در دسترس هستند. برای دریافت اطلاعات
        جدید، اتصال خود را بررسی کنید.
      </p>
      <a className="offline-btn" href="/dashboard">
        تلاش دوباره
      </a>
    </div>
  );
}

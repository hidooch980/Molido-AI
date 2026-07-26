import type { Metadata, Viewport } from 'next';
import './globals.css';
import ServiceWorkerRegistrar from './sw-register';

export const metadata: Metadata = {
  title: 'Molido AI — مدیریت هوشمند کسب‌وکار',
  description:
    'سامانه مدیریت هوشمند فروشگاه، کافه‌رستوران، کسب‌وکار و شهرداری — چندزبانه و مجهز به هوش مصنوعی',
  applicationName: 'Molido AI',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/logo.svg', type: 'image/svg+xml' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180' }],
  },
  // آیفون: اجرای تمام‌صفحه پس از «افزودن به صفحه اصلی»
  appleWebApp: {
    capable: true,
    title: 'Molido AI',
    statusBarStyle: 'black-translucent',
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: '#0b1220',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  // viewport-fit=cover تا صفحه زیر ناچ آیفون هم کشیده شود
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fa" dir="rtl">
      <body>
        {children}
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}

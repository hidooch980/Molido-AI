import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Molido AI — داشبورد مدیریت',
  description:
    'سامانه مدیریت هوشمند فروشگاه، کسب‌وکار و شهرداری — چندزبانه و مجهز به هوش مصنوعی',
  icons: {
    icon: '/logo.svg',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fa" dir="rtl">
      <body>{children}</body>
    </html>
  );
}

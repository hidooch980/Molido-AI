import { fetchMenu } from '../../../lib/menu-server';
import MenuClient from './MenuClient';

/**
 * منوی دیجیتال — مشتری QR روی میز را اسکن می‌کند.
 *
 * ⚠️ این صفحه **ایندکس نمی‌شود**.
 *
 *    نشانی‌اش توکنِ میز را دارد.  ایندکس شدنش یعنی توکن — که کلِ
 *    محافظتِ این مسیر است — در نتایج جستجو منتشر شود، و آن‌وقت هرکسی
 *    از هر کجا می‌تواند برای آن میز سفارش بفرستد.
 */
export const metadata = {
  title: 'منو',
  robots: { index: false, follow: false },
};

// توکن در نشانی است، پس هیچ صفحه‌ای از پیش ساخته نمی‌شود.
export const dynamic = 'force-dynamic';

export default async function MenuPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const menu = await fetchMenu(token);

  if (!menu) {
    return (
      <main
        dir="rtl"
        style={{
          minHeight: '100dvh',
          display: 'grid',
          placeItems: 'center',
          padding: 24,
          fontFamily: 'inherit',
          textAlign: 'center',
        }}
      >
        <div>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🍽️</div>
          <h1 style={{ fontSize: 20, marginBottom: 8 }}>منو در دسترس نیست</h1>
          {/*
            ⚠️ پیام عمداً مبهم است.
                «میز پیدا نشد» و «منو خاموش است» را از هم جدا نمی‌کنیم:
                تفاوتشان به کسی که توکن را حدس می‌زند می‌گوید کدام
                حدس‌ها نزدیک‌ترند.
          */}
          <p style={{ opacity: 0.7, fontSize: 14 }}>
            لطفاً کد روی میز را دوباره اسکن کنید یا از کارکنان کمک بگیرید.
          </p>
        </div>
      </main>
    );
  }

  return <MenuClient menu={menu} token={token} />;
}

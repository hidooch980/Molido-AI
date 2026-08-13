import type { Metadata } from 'next';

import './shop.css';
import ShopHeader from './ShopHeader';

export const metadata: Metadata = {
  title: 'فروشگاه اینترنتی',
  description: 'خرید آنلاین با تحویل درب منزل',
};

/**
 * قالب فروشگاه — جدا از پنل مدیریت.
 *
 * پنل تم تیره دارد چون کارمند ساعت‌ها با آن کار می‌کند و چگالی داده بالاست.
 * فروشگاه روشن است چون مشتری چند دقیقه می‌ماند، عکس کالا روی زمینهٔ روشن
 * بهتر دیده می‌شود، و انتظار رایج از یک فروشگاه اینترنتی همین است.
 *
 * `AppShell` عمداً استفاده نمی‌شود: آن ناوبری کارکنان و بررسی توکن دارد و
 * مشتری هیچ‌کدام را نباید ببیند.
 */
export default function ShopLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="shop">
      <ShopHeader />
      <main className="shop-main">{children}</main>

      <footer className="shop-footer">
        <span>Molido — فروشگاه اینترنتی</span>
      </footer>
    </div>
  );
}

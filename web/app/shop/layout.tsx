import type { Metadata } from 'next';

import './shop.css';
import ShopHeader from './ShopHeader';
import { shopFetch } from '../../lib/shop-server';

/**
 * ⚠️ نام میدان‌ها باید با آنچه API می‌دهد یکی باشد.
 *
 *    اینجا `phone` و `address` نوشته شده بود و پابرگ رندرشان می‌کرد —
 *    ولی `ShopSetting` نه ستونِ `phone` دارد نه `address`.  ستونش
 *    `supportPhone` است.
 *
 *    نتیجه: پابرگِ فروشگاه **هرگز** شماره‌ای نشان نداده بود، و
 *    هیچ خطایی هم نمی‌داد — `undefined` است و شرط رد می‌شود.
 *
 *    TypeScript هم نمی‌گرفتش: `shopFetch<Settings>` هر شکلی را که
 *    بگویی می‌پذیرد؛ نوع فقط ادعاست، نه سنجش.
 */
type Settings = {
  shopName?: string | null;
  supportPhone?: string | null;
};

/**
 * عنوان و توضیح از تنظیمات فروشگاه می‌آید، نه رشتهٔ ثابت.
 *
 * این چیزی است که در نتیجهٔ جستجوی گوگل و هنگام اشتراک‌گذاری لینک دیده
 * می‌شود؛ «فروشگاه اینترنتی» برای هر فروشگاهی صدق می‌کند و برای هیچ‌کدام
 * مفید نیست.
 */
export async function generateMetadata(): Promise<Metadata> {
  const settings = await shopFetch<Settings>('/settings', {});
  const name = settings.shopName?.trim() || 'فروشگاه اینترنتی';

  return {
    title: { default: name, template: `%s — ${name}` },
    description: `خرید آنلاین از ${name} با تحویل درب منزل`,
    openGraph: { title: name, type: 'website' },
  };
}

/**
 * قالب فروشگاه — جدا از پنل مدیریت.
 *
 * پنل تم تیره دارد چون کارمند ساعت‌ها با آن کار می‌کند و چگالی داده بالاست.
 * فروشگاه از تم دستگاه پیروی می‌کند: مشتری چند دقیقه می‌ماند و شب با
 * موبایل، صفحهٔ سفید آزاردهنده است.
 *
 * `AppShell` عمداً استفاده نمی‌شود: آن ناوبری کارکنان و بررسی توکن دارد و
 * مشتری هیچ‌کدام را نباید ببیند.
 */
export default async function ShopLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const settings = await shopFetch<Settings>('/settings', {});
  const name = settings.shopName?.trim() || 'Molido';

  return (
    <div className="shop">
      <ShopHeader shopName={name} />
      <main className="shop-main">{children}</main>

      <footer className="shop-footer">
        <div style={{ fontWeight: 700, color: 'var(--s-text)' }}>{name}</div>
        {settings.supportPhone ? (
          // تماس تلفنی روی موبایل باید یک لمس باشد، نه کپی‌کردن دستی شماره.
          <div style={{ marginTop: 'var(--s-1)' }}>
            <a
              href={`tel:${settings.supportPhone}`}
              style={{ color: 'var(--s-primary)' }}
            >
              {settings.supportPhone}
            </a>
          </div>
        ) : null}
      </footer>
    </div>
  );
}

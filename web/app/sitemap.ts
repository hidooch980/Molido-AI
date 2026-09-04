import type { MetadataRoute } from 'next';

import { shopFetch } from '../lib/shop-server';

// ⚠️ ساعتی بازتولید می‌شود، نه هر درخواست: نقشه به API می‌زند و
//    خزنده‌ای که هر دقیقه بگیردش، بی‌دلیل بار می‌سازد.  ولی ثابت هم
//    نیست، وگرنه کالای تازه تا استقرارِ بعدی دیده نمی‌شود.
export const revalidate = 3600;

type Product = { id: string; updatedAt?: string | null };
type Category = { id: string };

/**
 * نقشهٔ سایت — فهرستِ چیزهایی که باید ایندکس شوند.
 *
 * ⚠️ چرا لازم بود؟
 *
 *    صفحهٔ کالا فقط از راهِ کلیک روی شبکهٔ فروشگاه پیدا می‌شود.  خزنده
 *    برای رسیدن به کالای صفحهٔ سوم باید صفحه‌بندی را دنبال کند — و
 *    اغلب نمی‌کند.  نتیجه‌اش این است که بیشترِ کاتالوگ هرگز ایندکس
 *    نمی‌شود، و همان صفحه‌ها بودند که دادهٔ ساخت‌یافته گرفتند.
 *
 * ⚠️ اگر API پاسخ ندهد، نقشه **خالی** برمی‌گردد نه خطا.
 *
 *    `shopFetch` مقدارِ پیش‌فرض دارد.  نقشهٔ ناقص بهتر از صفحهٔ ۵۰۰
 *    است: خزنده در حالت دوم کلِ سایت را مشکوک می‌بیند.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // ⚠️ `SITE_URL` اول خوانده می‌شود، بعد `NEXT_PUBLIC_SITE_URL`.
  //
  //    این فایل روی **سرور** اجرا می‌شود، پس متغیرِ معمولی را در زمانِ
  //    اجرا می‌خواند.  `NEXT_PUBLIC_*` برعکس، هنگامِ ساخت در باندل
  //    جاسازی می‌شود — یعنی برای عوض کردنِ دامنه باید ایمیج را دوباره
  //    ساخت.  برای چیزی که در استقرار تعیین می‌شود، آن رفتار غلط است.
  const base = (process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL)
    ?.replace(/\/+$/, '');

  // بدونِ نشانیِ مطلق، نقشهٔ سایت معنا ندارد — نشانیِ نسبی را خزنده
  // نمی‌پذیرد.  خالی برگرداندن صادقانه‌تر از نشانیِ ساختگی است.
  if (!base) return [];

  const [products, categories] = await Promise.all([
    shopFetch<Product[]>('/products?limit=1000', []),
    shopFetch<Category[]>('/categories', []),
  ]);

  const now = new Date();

  return [
    // ⚠️ ریشه تا امروز اینجا نبود — و درست بود، چون صفحهٔ ورودِ پنل
    //    ایندکس‌شدنی نیست.  حالا صفحهٔ معرفیِ شرکت است و باید نخستین
    //    و مهم‌ترین ورودیِ نقشه باشد.
    {
      url: base,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 1,
    },
    {
      url: `${base}/shop`,
      lastModified: now,
      changeFrequency: 'daily',
      // ⚠️ ۰٫۹ نه ۱: با دو صفحهٔ هم‌اولویت، خزنده خودش انتخاب می‌کند
      //    کدام «اصلی» است.  ریشه باید صریحاً بالاتر باشد.
      priority: 0.9,
    },
    // دسته‌ها از کالاها مهم‌ترند برای خزنده: چند صفحهٔ پرمحتوا که به
    // بقیه لینک می‌دهند.
    ...(Array.isArray(categories) ? categories : []).map((category) => ({
      url: `${base}/shop?categoryId=${encodeURIComponent(category.id)}`,
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    })),
    ...(Array.isArray(products) ? products : []).map((product) => ({
      url: `${base}/shop/product/${encodeURIComponent(product.id)}`,
      // ⚠️ تاریخِ واقعیِ کالا، نه «الان».
      //
      //    اگر همه‌شان «الان» باشند، خزنده هر بار کلِ کاتالوگ را
      //    دوباره می‌خزد و سهمیه را هدر می‌دهد — و به‌مرور به تاریخ‌ها
      //    بی‌اعتماد می‌شود.
      lastModified: product.updatedAt ? new Date(product.updatedAt) : now,
      changeFrequency: 'weekly' as const,
      priority: 0.6,
    })),
  ];
}

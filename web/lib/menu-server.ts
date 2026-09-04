/**
 * خواندنِ منوی دیجیتال در سمتِ **سرور**.
 *
 * ⚠️ همان استدلالِ `shop-server`: مشتری QR را کنارِ میز اسکن می‌کند،
 *    اغلب روی داده‌ی همراهِ کند.  اگر منو فقط در مرورگر پر شود، اولین
 *    چیزی که می‌بیند صفحهٔ خالی است.
 *
 * ⚠️ نشانیِ داخلی جداست، چون سرورِ Next داخلِ شبکهٔ داکر است و باید با
 *    نامِ سرویس صدا بزند — وگرنه درخواست از میزبان بیرون می‌رود و در
 *    استقرارِ بسته برنمی‌گردد.
 */

const INTERNAL_API =
  process.env.INTERNAL_API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  'http://localhost:3000';

export type MenuItem = {
  id: string;
  name: string;
  nameEn: string | null;
  nameAr: string | null;
  description: string | null;
  imageUrl: string | null;
  price: number;
  calories: number | null;
  prepMinutes: number | null;
  isSpicy: boolean | null;
  isVegan: boolean | null;
};

export type MenuCategory = {
  id: string | null;
  name: string;
  nameEn: string | null;
  nameAr: string | null;
  icon: string | null;
  items: MenuItem[];
};

export type MenuPayload = {
  table: { tableNo: string };
  welcomeText: string | null;
  canOrder: boolean;
  servicePercent: number;
  taxPercent: number;
  categories: MenuCategory[];
};

/**
 * ⚠️ منو **کش نمی‌شود**.
 *
 *    «موجود نیست» باید فوراً دیده شود.  مشتری‌ای که غذایی را سفارش
 *    می‌دهد که ده دقیقه پیش تمام شده، هم خودش ناراضی می‌شود هم
 *    آشپزخانه را معطل می‌کند.  این تفاوتِ منوی رستوران با کاتالوگِ
 *    فروشگاه است.
 */
export async function fetchMenu(token: string): Promise<MenuPayload | null> {
  try {
    const response = await fetch(
      `${INTERNAL_API}/menu/${encodeURIComponent(token)}`,
      { cache: 'no-store', signal: AbortSignal.timeout(5000) },
    );
    if (!response.ok) return null;
    return (await response.json()) as MenuPayload;
  } catch {
    return null;
  }
}

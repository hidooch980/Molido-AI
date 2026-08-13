/**
 * خواندن دادهٔ فروشگاه در سمت **سرور**.
 *
 * چرا لازم است: صفحهٔ کاتالوگ اگر فقط در مرورگر پر شود، HTML اولیه خالی
 * است.  برای پنل مدیریت اهمیتی ندارد — کاربر لاگین می‌کند و منتظر می‌ماند —
 * ولی فروشگاه اینترنتی باید در نتایج جستجو دیده شود و روی اتصال کند هم
 * چیزی نشان دهد.
 *
 * چرا نشانی جدا: `NEXT_PUBLIC_API_URL` نشانیِ قابل دسترس از **مرورگر** است
 * (مثلاً `http://192.168.100.60:3000`).  سرور Next داخل شبکهٔ داکر اجرا
 * می‌شود و باید با نام سرویس صدا بزند، وگرنه درخواست از خودِ میزبان بیرون
 * می‌رود و در استقرارهای بسته اصلاً برنمی‌گردد.
 */

const INTERNAL_API =
  process.env.INTERNAL_API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  'http://localhost:3000';

export async function shopFetch<T>(
  path: string,
  fallback: T,
  revalidate = 60,
): Promise<T> {
  try {
    const response = await fetch(`${INTERNAL_API}/shop${path}`, {
      headers: { 'x-lang': 'fa' },
      // کاتالوگ هر دقیقه تازه می‌شود: قیمت و موجودی آن‌قدر سریع عوض
      // نمی‌شوند که ارزش رندر دوبارهٔ هر درخواست را داشته باشند.
      next: { revalidate },
    });

    if (!response.ok) return fallback;
    return (await response.json()) as T;
  } catch {
    // بک‌اند در دسترس نباشد، فروشگاه باید قاب خودش را نشان دهد نه صفحهٔ
    // خطای Next.
    return fallback;
  }
}

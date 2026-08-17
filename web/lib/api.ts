/**
 * کلاینت API — اتصال به بک‌اند Molido AI
 * زبان انتخابی کاربر با هدر x-lang برای ترجمه پیام‌های خطا ارسال می‌شود.
 */

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export function getToken(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  return window.localStorage.getItem('molido_token');
}

export function setToken(token: string) {
  window.localStorage.setItem('molido_token', token);
}

export function clearToken() {
  window.localStorage.removeItem('molido_token');
}

/**
 * پیامِ قطعیِ شبکه، به هر سه زبان.
 *
 * ⚠️ عمداً در `i18n.ts` نیست.
 *
 *    `api.ts` نباید به واژه‌نامه وابسته باشد: هر دو در بارگذاریِ
 *    اولیه لازم‌اند و وابستگیِ حلقه‌ای می‌سازد.  سه رشته است، و
 *    ارزشِ استقلالش بیشتر از ارزشِ یک‌جا بودنش است.
 */
const NETWORK_ERROR: Record<string, string> = {
  fa: 'ارتباط با سرور برقرار نشد — اتصال اینترنت را بررسی کنید',
  en: 'Could not reach the server — check your internet connection',
  ar: 'تعذّر الوصول إلى الخادم — تحقق من اتصالك بالإنترنت',
};

function getStoredLang(): string {
  if (typeof window === 'undefined') {
    return 'fa';
  }

  const stored = window.localStorage.getItem('molido_lang');

  return stored === 'en' || stored === 'ar' ? stored : 'fa';
}

export async function api<T = unknown>(
  path: string,
  options?: {
    method?: string;
    body?: unknown;
  },
): Promise<T> {
  const token = getToken();

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method: options?.method ?? 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-lang': getStoredLang(),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(options?.body ? { body: JSON.stringify(options.body) } : {}),
    });
  } catch {
    // ⚠️ خطای **شبکه** هیچ‌وقت از سرور ترجمه نمی‌آید.
    //
    //    پیام‌های خطای سرور با هدر `x-lang` ترجمه‌شده برمی‌گردند.  ولی
    //    وقتی درخواست اصلاً به سرور نمی‌رسد، `fetch` خودش خطا می‌دهد و
    //    متنش را مرورگر می‌سازد — همیشه انگلیسی: «Failed to fetch».
    //
    //    نتیجه‌اش این بود که کاربر عرب‌زبان وسط رابطِ کاملاً عربی، یک
    //    جملهٔ انگلیسی می‌دید — و آن هم دقیقاً در بدترین لحظه، وقتی
    //    اینترنتش قطع شده و کمترین حوصله را دارد.
    //
    //    اینجا ترجمه می‌شود چون تنها جایی است که هم زبان را می‌داند و
    //    هم همهٔ درخواست‌ها از آن رد می‌شوند.
    throw new Error(NETWORK_ERROR[getStoredLang()] ?? NETWORK_ERROR.fa);
  }

  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(
      (error as { message?: string } | null)?.message ??
        `HTTP ${response.status}`,
    );
  }

  return response.json() as Promise<T>;
}

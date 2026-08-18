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

/**
 * خروج — توکن **و** دادهٔ کش‌شدهٔ روی دستگاه.
 *
 * ⚠️ پاک کردنِ توکن به‌تنهایی کافی نیست.
 *
 *    سرویس‌ورکر پاسخ‌های API را در `molido-data-*` نگه می‌دارد تا
 *    برنامه آفلاین کار کند — یعنی فهرست مشتری‌ها، فروش‌ها، قیمت‌ها و
 *    کارکنان روی دیسک می‌مانند.
 *
 *    تا امروز خروج فقط توکن را برمی‌داشت و آن کش دست‌نخورده می‌ماند.
 *    روی صندوقی که چند نفر نوبتی کار می‌کنند، دادهٔ نفرِ قبلی روی
 *    دستگاه باقی بود.
 *
 *    برنامه خودش آن را نشان نمی‌داد (با توکنِ تازه دوباره می‌گیرد)،
 *    ولی «نمایش ندادن» با «نبودن» یکی نیست: هر کسی با devtools یا
 *    دسترسی به فایل‌ها می‌خواندش.
 *
 * ⚠️ `async` است ولی صداکننده می‌تواند منتظر نماند.
 *
 *    خروج نباید پشتِ پاک شدنِ کش گیر کند؛ اگر کاربر صفحه را ببندد،
 *    مرورگر کار را تمام می‌کند.  ولی توکن **همگام** پاک می‌شود تا
 *    حتی در بدترین حالت، دسترسی بلافاصله قطع شود.
 */
export function clearToken() {
  window.localStorage.removeItem('molido_token');

  if (typeof caches === 'undefined') return;

  void caches
    .keys()
    .then((names) =>
      Promise.all(
        names
          // پوستهٔ برنامه (`molido-shell-*`) عمداً می‌ماند: دادهٔ کسی
          // در آن نیست و پاک کردنش فقط ورودِ بعدی را کند می‌کند.
          .filter((name) => name.startsWith('molido-data'))
          .map((name) => caches.delete(name)),
      ),
    )
    .catch(() => undefined);
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
    // ⚠️ پرچمِ `isNetwork` روی خطا می‌نشیند، نه فقط متن.
    //
    //    صداکننده باید بتواند «شبکه نبود» را از «سرور رد کرد» جدا کند
    //    — اولی در صفِ آفلاین می‌نشیند، دومی نه.
    //
    //    مقایسهٔ **متن** جواب نمی‌دهد: متن با زبانِ کاربر عوض می‌شود،
    //    و کدی که به رشتهٔ فارسی تکیه کند، برای کاربر انگلیسی خاموش
    //    می‌شکند.
    const netErr = new Error(
      NETWORK_ERROR[getStoredLang()] ?? NETWORK_ERROR.fa,
    ) as Error & { isNetwork?: boolean };
    netErr.isNetwork = true;
    throw netErr;
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

/**
 * کلاینت فروشگاه اینترنتی — جدا از کلاینت پنل مدیریت.
 *
 * چرا جدا: پنل با توکن کارمند کار می‌کند و فروشگاه با توکن مشتری.  اگر
 * یکی می‌بودند، باز بودن پنل در یک تب باعث می‌شد درخواست‌های فروشگاه هم
 * توکن کارمند ببرند — و برعکس.
 *
 * مشتری با **توکن امضاشده** شناسایی می‌شود.  توکن `kind: 'customer'` دارد
 * تا سرور هرگز آن را با توکن کارمند اشتباه نگیرد.
 */

import { API_URL } from './api';

const CUSTOMER_KEY = 'molido_shop_customer';
const GUEST_KEY = 'molido_shop_guest';

export type ShopCustomer = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  /** توکن امضاشده؛ در هر درخواست فرستاده می‌شود. */
  token: string;
};

export function getCustomer(): ShopCustomer | null {
  if (typeof window === 'undefined') return null;

  const raw = window.localStorage.getItem(CUSTOMER_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as ShopCustomer;
  } catch {
    // مقدار خراب نباید کل فروشگاه را بشکند؛ پاکش می‌کنیم و مهمان می‌شویم.
    window.localStorage.removeItem(CUSTOMER_KEY);
    return null;
  }
}

export function setCustomer(customer: ShopCustomer) {
  window.localStorage.setItem(CUSTOMER_KEY, JSON.stringify(customer));
}

export function clearCustomer() {
  window.localStorage.removeItem(CUSTOMER_KEY);
}

/**
 * شناسهٔ مهمان تا سبد خریدِ کاربرِ ثبت‌نام‌نکرده گم نشود.
 *
 * `crypto.randomUUID` در همهٔ مرورگرهای امروزی هست ولی فقط در زمینهٔ امن
 * (https یا localhost)؛ در شبکهٔ محلی روی http موجود نیست، پس جایگزین
 * ساده لازم است.
 */
export function guestToken(): string {
  if (typeof window === 'undefined') return '';

  let token = window.localStorage.getItem(GUEST_KEY);
  if (token) return token;

  token =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `g-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

  window.localStorage.setItem(GUEST_KEY, token);
  return token;
}

export async function shopApi<T = unknown>(
  path: string,
  options?: { method?: string; body?: unknown },
): Promise<T> {
  const customer = getCustomer();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-lang': 'fa',
  };

  // مشتری وارد‌شده توکن می‌فرستد؛ مهمان با کلید مرورگر شناسایی می‌شود.
  // کلید مهمان همیشه فرستاده می‌شود تا اگر توکن منقضی شد، سبدش گم نشود.
  if (customer?.token) headers.Authorization = `Bearer ${customer.token}`;
  else headers['x-guest-token'] = guestToken();

  // هنگام ورود، کلید مهمان همیشه فرستاده می‌شود تا سرور بتواند سبدِ پیش
  // از ورود را به حساب کاربر منتقل کند.
  if (path === '/login' || path === '/register') {
    headers['x-guest-token'] = guestToken();
  }

  const response = await fetch(`${API_URL}/shop${path}`, {
    method: options?.method ?? 'GET',
    headers,
    body: options?.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    // توکن منقضی یا نامعتبر: حساب پاک می‌شود تا کاربر دوباره وارد شود،
    // وگرنه هر درخواست بعدی هم با همان توکن مرده شکست می‌خورد.
    if (response.status === 401 && customer) {
      clearCustomer();
    }

    const message = Array.isArray(data?.message)
      ? data.message.join('، ')
      : (data?.message ?? 'خطا در ارتباط با فروشگاه');
    throw new Error(message);
  }

  return data as T;
}

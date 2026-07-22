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

  const response = await fetch(`${API_URL}${path}`, {
    method: options?.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      'x-lang': getStoredLang(),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(options?.body ? { body: JSON.stringify(options.body) } : {}),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(
      (error as { message?: string } | null)?.message ??
        `HTTP ${response.status}`,
    );
  }

  return response.json() as Promise<T>;
}

/**
 * نقشِ کاربرِ جاری، از روی توکن.
 *
 * ⚠️ این فقط برای **نمایش** است، نه برای دسترسی.
 *
 *    توکن در `localStorage` است و کاربر می‌تواند دستکاری‌اش کند؛ پس
 *    «نقش SUPER_ADMIN است» در مرورگر هیچ چیزی را تضمین نمی‌کند.  هر
 *    مسیرِ فروشنده در بک‌اند `@Roles('SUPER_ADMIN')` دارد و سرور
 *    تصمیم می‌گیرد.
 *
 *    کاری که این‌جا می‌کند فقط یکی است: گزینهٔ منویی را که برای
 *    ۹۹٪ کاربران همیشه ۴۰۳ می‌دهد، نشان ندهد.  منویی که به «دسترسی
 *    ندارید» می‌رسد، بدتر از منوی نبوده است.
 *
 * ⚠️ امضا **بررسی نمی‌شود** و نباید بشود: کلیدِ امضا روی سرور است و
 *    آوردنش به مرورگر یعنی هر کسی می‌تواند توکن بسازد.  این تابع فقط
 *    بارِ میانی را می‌خواند.
 */
import { getToken } from './api';

export type Session = {
  userId: string | null;
  companyId: string | null;
  role: string | null;
};

const EMPTY: Session = { userId: null, companyId: null, role: null };

/**
 * بارِ میانیِ JWT را می‌خواند.
 *
 * ⚠️ `atob` تنها base64ِ استاندارد را می‌فهمد و JWT از گونهٔ
 *    **base64url** استفاده می‌کند: `-` به‌جای `+` و `_` به‌جای `/`.
 *    بدونِ این تبدیل، توکن‌هایی که تصادفاً این دو نویسه را دارند
 *    استثنا می‌دهند — یعنی گاهی کار می‌کند و گاهی نه، که بدترین
 *    گونهٔ اشکال است.
 */
export function currentSession(): Session {
  const token = getToken();
  if (!token) return EMPTY;

  const parts = token.split('.');
  if (parts.length !== 3) return EMPTY;

  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(b64)) as Record<string, unknown>;

    return {
      userId: typeof payload.sub === 'string' ? payload.sub : null,
      companyId:
        typeof payload.companyId === 'string' ? payload.companyId : null,
      role: typeof payload.role === 'string' ? payload.role : null,
    };
  } catch {
    // توکنِ خراب یعنی «نقشی نمی‌دانم»، نه یعنی صفحه بشکند.
    return EMPTY;
  }
}

export function isVendor(): boolean {
  return currentSession().role === 'SUPER_ADMIN';
}

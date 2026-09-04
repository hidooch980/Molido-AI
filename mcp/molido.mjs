/**
 * کلاینت API مولیدو برای سرور MCP.
 *
 * از همان ورودِ عادی استفاده می‌کند، نه یک سازوکار احراز هویت تازه.
 *
 * چرا: جدول `ApiKey` در سامانه هست ولی نه تولید کلید دارد نه نگهبان —
 * یعنی هنوز کار نمی‌کند.  ساختنِ یک لایهٔ احراز هویتِ آزمون‌نشده برای
 * دسترسی دستیار هوشمند، بدترین جای ممکن برای شروع است.
 *
 * نتیجه‌اش هم درست‌تر است: سرور MCP دقیقاً همان دسترسی‌ای را دارد که
 * کاربرِ واردشده دارد — مدلی که از قبل فهمیده و آزموده شده.
 */

const DEFAULT_API = 'http://localhost:3000';

export class MolidoClient {
  constructor(options = {}) {
    this.baseUrl = (options.baseUrl ?? process.env.MOLIDO_API ?? DEFAULT_API).replace(
      /\/+$/,
      '',
    );
    this.email = options.email ?? process.env.MOLIDO_EMAIL ?? '';
    this.password = options.password ?? process.env.MOLIDO_PASSWORD ?? '';
    this.token = null;
    /** ورودِ هم‌زمانِ چند ابزار نباید چند بار لاگین کند. */
    this.pending = null;
  }

  async login() {
    if (!this.email || !this.password) {
      throw new Error(
        'MOLIDO_EMAIL و MOLIDO_PASSWORD تنظیم نشده‌اند — سرور MCP نمی‌تواند وارد شود',
      );
    }

    const response = await fetch(`${this.baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: this.email, password: this.password }),
    });

    if (!response.ok) {
      // پیام صریح: «۴۰۱» به کسی نمی‌گوید رمز عوض شده یا سرور عوض شده.
      throw new Error(
        `ورود به مولیدو ناموفق بود (${response.status}) — ایمیل و رمز را در تنظیمات MCP بررسی کنید`,
      );
    }

    const data = await response.json();
    this.token = data.accessToken ?? null;
    if (!this.token) throw new Error('پاسخ ورود، توکن نداشت');
    return this.token;
  }

  async ensureToken() {
    if (this.token) return this.token;
    // چند ابزار هم‌زمان → یک ورود.  ورودِ موازی به سقف نرخ می‌خورد و
    // همه‌شان با هم شکست می‌خورند.
    if (!this.pending) {
      this.pending = this.login().finally(() => {
        this.pending = null;
      });
    }
    return this.pending;
  }

  /**
   * فرستادن درخواست.
   *
   * یک بار تلاش دوباره پس از ۴۰۱: توکن شش‌ساعته است و سرور MCP
   * می‌تواند روزها باز بماند.  بدون این، اولین ابزارِ بعد از انقضا
   * شکست می‌خورد و کاربر نمی‌فهمد چرا.
   */
  async request({ method = 'GET', path, query = {} }, retry = true) {
    await this.ensureToken();

    const url = new URL(this.baseUrl + path);
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }

    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        'x-lang': 'fa',
      },
    });

    if (response.status === 401 && retry) {
      this.token = null;
      return this.request({ method, path, query }, false);
    }

    const text = await response.text();

    if (!response.ok) {
      let message = `HTTP ${response.status}`;
      try {
        const parsed = JSON.parse(text);
        message = parsed.message ?? message;
      } catch {
        // پاسخِ غیر-JSON: همان متن خام گویاتر از «HTTP 500» است.
        if (text.trim()) message = text.slice(0, 200);
      }
      throw new Error(message);
    }

    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
}

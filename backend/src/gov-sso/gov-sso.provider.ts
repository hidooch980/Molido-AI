import { createHash, randomBytes } from 'node:crypto';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  GovIdentity,
  GovSsoProvider,
  GovTokenExchange,
} from './gov-sso.types';

/**
 * ارائه‌دهندهٔ OIDC — پیاده‌سازیِ استاندارد، بدونِ فرضِ نشانی.
 *
 * ⚠️ همهٔ نشانی‌ها از متغیرهای محیطی می‌آیند.
 *
 *    مستنداتِ رسمیِ `sso.my.gov.ir` فقط به سازمانِ ثبت‌شده داده می‌شود.
 *    نوشتنِ نشانیِ محتمل در کد یعنی چیزی که در آزمون سبز است و در
 *    تولید می‌شکند.  اینجا نبودِ پیکربندی خطای صریح می‌دهد، نه رفتارِ
 *    نیمه‌کاره.
 *
 * ⚠️ PKCE اجباری است، نه اختیاری.
 *
 *    بدونِ آن، کدی که در نوارِ نشانی یا لاگِ پروکسی دیده شود، برای
 *    گرفتنِ توکن کافی است.  با آن، کد بدونِ `code_verifier` بی‌ارزش
 *    است — و verifier هرگز از مرورگر عبور نمی‌کند.
 *
 * ⚠️ تبادلِ کد از کانالِ پشتی انجام می‌شود.
 *
 *    یعنی `client_secret` هرگز به مرورگر نمی‌رسد.  جریانِ implicit یا
 *    تبادل در سمتِ کلاینت، همان راز را پخش می‌کرد.
 */
@Injectable()
export class OidcGovSsoProvider implements GovSsoProvider {
  constructor(private readonly config: ConfigService) {}

  private get<T extends string>(key: string): string {
    return (this.config.get<T>(key) ?? '').toString().trim();
  }

  /** نامِ متغیرهایی که بدونشان هیچ‌چیز کار نمی‌کند. */
  private static readonly REQUIRED = [
    'GOV_SSO_CLIENT_ID',
    'GOV_SSO_CLIENT_SECRET',
    'GOV_SSO_AUTHORIZE_URL',
    'GOV_SSO_TOKEN_URL',
    'GOV_SSO_USERINFO_URL',
    'GOV_SSO_REDIRECT_URI',
  ];

  isConfigured(): boolean {
    return OidcGovSsoProvider.REQUIRED.every((key) => this.get(key) !== '');
  }

  /** پیامی که دقیقاً می‌گوید کدام متغیر کم است. */
  private assertConfigured(): void {
    const missing = OidcGovSsoProvider.REQUIRED.filter((key) => this.get(key) === '');
    if (missing.length) {
      throw new ServiceUnavailableException(
        `ورود با درگاه دولت پیکربندی نشده است — ${missing.join('، ')} تنظیم نشده`,
      );
    }
  }

  /** `S256` — تنها روشِ PKCE که ارزش دارد؛ `plain` یعنی بی‌محافظ. */
  static challengeFor(verifier: string): string {
    return createHash('sha256').update(verifier).digest('base64url');
  }

  static newVerifier(): string {
    // ۳۲ بایت ⇒ ۴۳ نویسه، بالای کفِ ۴۳ نویسه‌ایِ RFC 7636.
    return randomBytes(32).toString('base64url');
  }

  authorizeUrl(input: { state: string; nonce: string; codeChallenge: string }): string {
    this.assertConfigured();

    const url = new URL(this.get('GOV_SSO_AUTHORIZE_URL'));
    const params: Record<string, string> = {
      response_type: 'code',
      client_id: this.get('GOV_SSO_CLIENT_ID'),
      redirect_uri: this.get('GOV_SSO_REDIRECT_URI'),
      // scopeها از پیکربندی می‌آیند: نامشان نزدِ هر ارائه‌دهنده فرق
      // می‌کند و حدس زدنشان یعنی خطای زمانِ اجرا.
      scope: this.get('GOV_SSO_SCOPE') || 'openid profile',
      state: input.state,
      nonce: input.nonce,
      code_challenge: input.codeChallenge,
      code_challenge_method: 'S256',
    };
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
    return url.toString();
  }

  async exchangeCode(input: {
    code: string;
    codeVerifier: string;
  }): Promise<GovTokenExchange> {
    this.assertConfigured();

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code: input.code,
      redirect_uri: this.get('GOV_SSO_REDIRECT_URI'),
      client_id: this.get('GOV_SSO_CLIENT_ID'),
      client_secret: this.get('GOV_SSO_CLIENT_SECRET'),
      code_verifier: input.codeVerifier,
    });

    const response = await this.fetchJson(this.get('GOV_SSO_TOKEN_URL'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: body.toString(),
    });

    const accessToken = String(
      (response as { access_token?: unknown }).access_token ?? '',
    );
    if (!accessToken) {
      throw new ServiceUnavailableException('درگاه دولت توکن دسترسی نداد');
    }

    return {
      accessToken,
      idTokenClaims: decodeIdToken(
        (response as { id_token?: unknown }).id_token,
      ),
    };
  }

  async fetchIdentity(accessToken: string): Promise<GovIdentity> {
    this.assertConfigured();

    const claims = await this.fetchJson(this.get('GOV_SSO_USERINFO_URL'), {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    });

    return mapIdentity(claims);
  }

  /**
   * ⚠️ مهلت اجباری است.
   *
   *    `fetch` پیش‌فرض بی‌مهلت است.  درگاهی که پاسخ ندهد، درخواستِ
   *    کاربر را تا ابد باز نگه می‌دارد و استخرِ اتصال را می‌بندد.
   */
  private async fetchJson(
    url: string,
    init: RequestInit,
  ): Promise<Record<string, unknown>> {
    const timeoutMs = Number(this.get('GOV_SSO_TIMEOUT_MS') || '15000');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      const text = await res.text();

      if (!res.ok) {
        // ⚠️ متنِ خامِ درگاه به کاربر نشان داده نمی‌شود: ممکن است
        //    شناسهٔ پذیرنده یا جزئیاتِ داخلی داشته باشد.
        throw new ServiceUnavailableException(
          `درگاه دولت پاسخ ${res.status} داد`,
        );
      }

      try {
        return JSON.parse(text) as Record<string, unknown>;
      } catch {
        throw new ServiceUnavailableException('پاسخ درگاه دولت JSON نبود');
      }
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      if ((error as { name?: string }).name === 'AbortError') {
        throw new ServiceUnavailableException('درگاه دولت پاسخ نداد (مهلت تمام شد)');
      }
      throw new ServiceUnavailableException('اتصال به درگاه دولت ممکن نشد');
    } finally {
      clearTimeout(timer);
    }
  }
}

/**
 * خواندنِ ادعاهای `id_token` **بدونِ** بررسیِ امضا.
 *
 * ⚠️ چرا این‌جا بی‌خطر است و جای دیگر نه؟
 *
 *    این توکن مستقیم از نقطهٔ token و روی TLS گرفته شده، نه از
 *    مرورگر.  OIDC Core §3.1.3.7 دقیقاً همین حالت را استثنا می‌کند.
 *
 *    اگر روزی توکن از مسیرِ دیگری بیاید (مثلاً جریانِ implicit)، این
 *    تابع دیگر کافی نیست و باید JWKS بررسی شود.
 *
 * ⚠️ فقط برای بررسیِ `nonce` به کار می‌رود.  هویت از `userinfo`
 *    خوانده می‌شود، که خودش با توکنِ دسترسی محافظت شده.
 */
function decodeIdToken(raw: unknown): Record<string, unknown> | null {
  if (typeof raw !== 'string') return null;
  const parts = raw.split('.');
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as Record<
      string,
      unknown
    >;
  } catch {
    return null;
  }
}

/**
 * نگاشتِ ادعاها به هویت.
 *
 * ⚠️ نامِ ادعای کد ملی نزدِ ارائه‌دهنده‌ها یکسان نیست.  چند نامِ رایج
 *    بررسی می‌شود و اگر هیچ‌کدام نبود، تهی می‌ماند — نه اینکه از
 *    میدانِ دیگری حدس زده شود.
 */
function mapIdentity(claims: Record<string, unknown>): GovIdentity {
  const pick = (...keys: string[]): string | null => {
    for (const key of keys) {
      const value = claims[key];
      if (typeof value === 'string' && value.trim()) return value.trim();
      if (typeof value === 'number') return String(value);
    }
    return null;
  };

  const subject = pick('sub', 'subject', 'user_id');
  if (!subject) {
    throw new ServiceUnavailableException('درگاه دولت شناسهٔ کاربر نداد');
  }

  return {
    subject,
    nationalCode: pick('national_code', 'nationalCode', 'nid', 'national_id'),
    firstName: pick('given_name', 'first_name', 'firstName'),
    lastName: pick('family_name', 'last_name', 'lastName'),
    mobile: pick('phone_number', 'mobile', 'phoneNumber'),
  };
}

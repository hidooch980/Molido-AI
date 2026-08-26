'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, setToken } from '../lib/api';
import {
  LANGS,
  dirFor,
  getLang,
  setLangStorage,
  t,
  type Lang,
} from '../lib/i18n';

/**
 * پاسخِ ورود **دو شکل** دارد.
 *
 * ⚠️ پیش‌تر فقط شکلِ اول فرض می‌شد و مستقیم `accessToken` خوانده
 *    می‌شد.  برای حسابِ MFA‌دار آن کلید اصلاً وجود ندارد، پس
 *    `setToken(undefined)` اجرا می‌شد و کاربر بی‌هیچ پیامی بیرون
 *    می‌ماند — یعنی روشن کردن MFA ورود از وب را کاملاً می‌شکست.
 */
type LoginResponse =
  | { accessToken: string; user: { firstName: string; lastName: string } }
  | { mfaRequired: true; challenge: string };

/** عمرِ توکنِ چالش در سرور پنج دقیقه است. */
const MFA_CHALLENGE_MS = 5 * 60 * 1000;

export default function LoginPage() {
  const router = useRouter();
  const [lang, setLang] = useState<Lang>('fa');
  const [email, setEmail] = useState('admin@molido.ai');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // ⚠️ چالش فقط در state می‌ماند، نه در localStorage.
  //
  //    نوشتنش روی دیسک یعنی نیمهٔ گذشتهٔ ورود روی دستگاه باقی می‌ماند
  //    و هر اسکریپتی می‌تواند بخواندش — درست همان چیزی که مرحلهٔ دوم
  //    برای جلوگیری از آن هست.
  const [challenge, setChallenge] = useState('');
  const [code, setCode] = useState('');

  /** آیا این نصب ورودِ دولتی دارد؟ از سرور پرسیده می‌شود، نه حدس. */
  const [ssoAvailable, setSsoAvailable] = useState(false);

  useEffect(() => {
    setLang(getLang());
  }, []);

  useEffect(() => {
    // ⚠️ شکستِ این درخواست خطا نمی‌دهد: نبودِ دکمه بهتر از پیامِ خطا
    //    روی صفحهٔ ورود است.
    api<{ configured: boolean }>('/gov-sso/status')
      .then((r) => setSsoAvailable(Boolean(r?.configured)))
      .catch(() => setSsoAvailable(false));
  }, []);

  /**
   * بازگشت از درگاه.
   *
   * ⚠️ نتیجه در **قطعهٔ نشانی** (`#`) می‌آید، نه در query.
   *
   *    قطعه هرگز به سرور فرستاده نمی‌شود، پس توکن در لاگِ وب‌سرور و
   *    پروکسی نمی‌نشیند.  با `?token=...` همان توکن در هر لاگِ میانی
   *    ثبت می‌شد.
   *
   * ⚠️ بلافاصله از نوارِ نشانی پاک می‌شود.
   *
   *    وگرنه با کپی کردنِ نشانی، توکن هم کپی می‌شد — و در تاریخچهٔ
   *    مرورگر هم می‌ماند.
   */
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;

    const params = new URLSearchParams(hash);
    if (params.get('sso') !== 'ok') return;

    const access = params.get('accessToken');
    const mfaChallenge = params.get('challenge');

    window.history.replaceState(null, '', window.location.pathname);

    if (access) {
      setToken(access);
      router.replace('/dashboard');
      return;
    }
    // ورودِ دولتی گذشت ولی عاملِ دوم مانده — همان صفحهٔ کدِ همیشگی.
    if (mfaChallenge) setChallenge(mfaChallenge);
  }, [router]);

  /**
   * خطا یا انصراف از درگاه.
   *
   * ⚠️ این‌ها در query می‌آیند نه در قطعه — چون رازی در کار نیست و
   *    باید در لاگِ سرور هم دیده شوند.
   */
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const q = new URLSearchParams(window.location.search);
    const sso = q.get('sso');
    if (sso !== 'error' && sso !== 'cancelled') return;

    setError(
      sso === 'cancelled'
        ? t('govSsoCancelled', getLang())
        : q.get('reason') || t('govSsoFailed', getLang()),
    );
    window.history.replaceState(null, '', window.location.pathname);
  }, []);

  /**
   * شروعِ جریان.
   *
   * ⚠️ `window.location.assign` و نه `router.push`: مقصد بیرونِ
   *    برنامه است و ناوبریِ Next آن را نمی‌شناسد.
   */
  const startGovSso = async () => {
    setError('');
    try {
      const { url } = await api<{ url: string }>('/gov-sso/start?audience=staff');
      window.location.assign(url);
    } catch (caught) {
      setError((caught as Error).message);
    }
  };

  useEffect(() => {
    document.documentElement.dir = dirFor(lang);
    document.documentElement.lang = lang;
  }, [lang]);

  function switchLang(next: Lang) {
    setLang(next);
    setLangStorage(next);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await api<LoginResponse>('/auth/login', {
        method: 'POST',
        body: { email, password },
      });

      // رمزِ درست کافی نبود: حساب MFA دارد و باید کد بدهد.
      if ('mfaRequired' in result) {
        setChallenge(result.challenge);
        setCode('');
        return;
      }

      setToken(result.accessToken);
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('loginError', lang));
    } finally {
      setLoading(false);
    }
  }

  /** بازگشت به گامِ اول — چالش دور ریخته می‌شود. */
  function resetToPassword(message = '') {
    setChallenge('');
    setCode('');
    setPassword('');
    setError(message);
  }

  /**
   * مهلتِ چالش را همین‌جا می‌شماریم.
   *
   * ⚠️ عمداً به متنِ خطای سرور تکیه نمی‌کنیم.
   *
   *    پیام‌های سرور با هدر `x-lang` ترجمه می‌شوند، پس مقایسهٔ رشته‌ای
   *    برای کاربرِ انگلیسی یا عربی خاموش می‌شکست.  «کد غلط» و «چالشِ
   *    منقضی» هر دو ۴۰۱‌اند و از روی وضعیت هم جدا نمی‌شوند.
   */
  useEffect(() => {
    if (!challenge) return;
    const timer = setTimeout(
      () => resetToPassword(t('mfaExpired', lang)),
      MFA_CHALLENGE_MS,
    );
    return () => clearTimeout(timer);
  }, [challenge, lang]);

  async function handleMfaSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await api<{ accessToken: string }>('/auth/mfa/verify', {
        method: 'POST',
        body: { challenge, code: code.trim() },
      });

      setToken(result.accessToken);
      router.push('/dashboard');
    } catch (err) {
      // پیامِ سرور از قبل ترجمه‌شده می‌آید؛ همان نشان داده می‌شود.
      setError(err instanceof Error ? err.message : t('loginError', lang));
      setCode('');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="lang-pills">
          {LANGS.map((item) => (
            <button
              key={item.code}
              type="button"
              className={`lang-pill${lang === item.code ? ' active' : ''}`}
              onClick={() => switchLang(item.code)}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="card">
          <div className="brand-logo">M</div>
          <div className="brand-title">
            {challenge ? t('mfaTitle', lang) : t('appName', lang)}
          </div>
          <p className="brand-subtitle">
            {challenge ? t('mfaSubtitle', lang) : t('loginSubtitle', lang)}
          </p>

          {error ? <div className="error">{error}</div> : null}

          {challenge ? (
            <form onSubmit={handleMfaSubmit} style={{ textAlign: 'start' }}>
              <label htmlFor="mfa-code">{t('mfaCode', lang)}</label>
              <input
                id="mfa-code"
                // ⚠️ `maxLength` هشت است، نه شش: کدِ بازیابی هم از همین
                //    خانه وارد می‌شود و کوتاه‌تر بودنِ سقف، عملاً راهِ
                //    بازیابی را می‌بست.
                maxLength={8}
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                dir="ltr"
                placeholder="••••••"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                required
              />

              <p className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>
                {t('mfaRecoveryHint', lang)}
              </p>

              <button type="submit" disabled={loading} style={{ width: '100%' }}>
                {loading ? t('mfaVerifying', lang) : t('mfaVerify', lang)}
              </button>

              <button
                type="button"
                className="ghost"
                onClick={() => resetToPassword()}
                style={{ width: '100%', marginTop: 10 }}
              >
                {t('mfaBack', lang)}
              </button>
            </form>
          ) : (
          <form onSubmit={handleSubmit} style={{ textAlign: 'start' }}>
            <label htmlFor="email">{t('email', lang)}</label>
            <input
              id="email"
              type="email"
              placeholder="admin@molido.ai"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />

            <label htmlFor="password">{t('password', lang)}</label>
            <input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />

            <button type="submit" disabled={loading} style={{ width: '100%' }}>
              {loading ? t('signingIn', lang) : t('signIn', lang)}
            </button>
          </form>
          )}

          {/*
            ⚠️ دکمهٔ ورودِ دولتی فقط وقتی دیده می‌شود که سرور بگوید
               پیکربندی شده است.

               نمایشِ همیشگی‌اش یعنی کاربر روی چیزی کلیک می‌کند که به
               خطای ۵۰۳ می‌رسد — و چون بیشترِ نصب‌ها اعتبارنامهٔ دولتی
               ندارند، حالتِ رایج همان خطا می‌شد.

            ⚠️ در مرحلهٔ دومِ MFA نشان داده نمی‌شود: آنجا کاربر وسطِ
               ورود است و شروعِ دوبارهٔ جریان فقط گیجش می‌کند.
          */}
          {!challenge && ssoAvailable ? (
            <>
              <div
                aria-hidden
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  margin: '18px 0 14px',
                  color: 'var(--muted)',
                  fontSize: 12.5,
                }}
              >
                <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                {t('or', lang)}
                <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
              </div>

              <button
                type="button"
                className="ghost"
                style={{ width: '100%' }}
                onClick={() => void startGovSso()}
              >
                {t('govSsoSignIn', lang)}
              </button>
            </>
          ) : null}

          {/*
            رمز مدیر روی صفحهٔ ورود چاپ نمی‌شود.
            نصبی که در اینترنت باز است، با این خط هم نام کاربری مدیر را
            لو می‌داد هم رمزش را — و پس از عوض شدن رمز، همان خط فقط
            کاربر را گمراه می‌کرد.  فقط نصب نمایشی آن را روشن می‌کند.
          */}
          {!challenge && process.env.NEXT_PUBLIC_SHOW_DEMO_LOGIN === '1' ? (
            <p className="muted" style={{ marginTop: 18, fontSize: 12.5 }}>
              {t('demoHint', lang)}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

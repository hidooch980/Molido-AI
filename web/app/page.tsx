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

type LoginResponse = {
  accessToken: string;
  user: { firstName: string; lastName: string };
};

export default function LoginPage() {
  const router = useRouter();
  const [lang, setLang] = useState<Lang>('fa');
  const [email, setEmail] = useState('admin@molido.ai');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLang(getLang());
  }, []);

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

      setToken(result.accessToken);
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('loginError', lang));
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
          <div className="brand-title">{t('appName', lang)}</div>
          <p className="brand-subtitle">{t('loginSubtitle', lang)}</p>

          {error ? <div className="error">{error}</div> : null}

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

          <p className="muted" style={{ marginTop: 18, fontSize: 12.5 }}>
            {t('demoHint', lang)}
          </p>
        </div>
      </div>
    </div>
  );
}

'use client';

import { useCallback, useEffect, useState } from 'react';

import AppShell from '../../components/AppShell';
import { Icon } from '../../components/icons';
import { TOUCH } from '../../components/ui';
import { api } from '../../lib/api';
import { invalidateCompany, type Company } from '../../lib/company';
import { useI18n } from '../../lib/i18n-context';
import { LANGS, type Lang } from '../../lib/i18n';
import {
  THEMES,
  currentAccent,
  currentDensity,
  autoTheme,
  currentChoice,
  currentTheme,
  setAccent,
  setDensity,
  setChoice,
  setTheme,
  type Density,
  type ThemeKey,
} from '../../lib/theme';

/**
 * تنظیمات.
 *
 * دو دستهٔ متفاوت که عمداً از هم جدا نگه داشته شده‌اند:
 *
 *   **مشخصات شرکت** روی سرور می‌ماند و برای همه یکی است — روی فاکتور و
 *   رسید هر کاربری همان می‌نشیند.
 *
 *   **پوسته و زبان** در مرورگر هر کاربر می‌ماند.  صندوق‌دار شیفت شب و
 *   مدیرِ گزارش‌خوان روی یک نصب دو نیاز متفاوت دارند؛ ذخیره روی سرور
 *   یعنی هر بار که یکی عوض می‌کند، برای دیگری هم عوض شود.
 */
/** رنگ‌های آماده — پوشش‌دهندهٔ چیزی که بیشتر فروشگاه‌ها می‌خواهند. */
const PRESETS = ['#1f5eff', '#047857', '#c05621', '#7c3aed', '#c8102e', '#0f766e'];

export default function SettingsPage() {
  const { t, lang, setLang } = useI18n();

  const [theme, setThemeState] = useState<ThemeKey>('minimal');
  // انتخاب کاربر جدا از پوستهٔ اعمال‌شده نگه داشته می‌شود: با «خودکار»،
  // پوسته عوض می‌شود ولی انتخاب همان «خودکار» می‌ماند.
  const [choice, setChoiceState] = useState<string>('auto');
  const [accent, setAccentState] = useState<string>('');
  const [density, setDensityState] = useState<Density>('normal');
  const [company, setCompany] = useState<Partial<Company>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    setThemeState(currentTheme());
    setChoiceState(currentChoice());
    setAccentState(currentAccent() ?? '');
    setDensityState(currentDensity());
  }, []);

  const load = useCallback(async () => {
    try {
      setCompany(await api<Company>('/company'));
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('fetchError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  function chooseTheme(next: ThemeKey) {
    setChoice(next);
    setThemeState(next);
    setChoiceState(next);
  }

  /** رشتهٔ خالی یعنی بازگشت به رنگ خودِ پوسته. */
  function chooseAccent(color: string) {
    setAccent(color || null);
    setAccentState(color);
  }

  function chooseDensity(next: Density) {
    setDensity(next);
    setDensityState(next);
  }

  async function saveCompany() {
    setBusy(true);
    setError('');
    setMessage('');

    try {
      const saved = await api<Company>('/company', {
        method: 'PATCH',
        body: {
          name: company.name,
          legalName: company.legalName || null,
          phone: company.phone || null,
          email: company.email || null,
          address: company.address || null,
          city: company.city || null,
          taxNumber: company.taxNumber || null,
          website: company.website || null,
        },
      });

      // حافظهٔ نام شرکت باید تازه شود، وگرنه سربرگ و فاکتور نام قدیمی را
      // تا بارگذاری بعدی نگه می‌دارند.
      invalidateCompany(saved);
      setCompany(saved);
      setMessage(t('saved'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('saveError'));
    } finally {
      setBusy(false);
    }
  }

  const field = (key: keyof Company, label: string, dir?: 'ltr') => (
    <label style={{ display: 'block' }}>
      {t(label)}
      <input
        style={TOUCH}
        dir={dir}
        value={(company[key] as string) ?? ''}
        onChange={(event) => setCompany({ ...company, [key]: event.target.value })}
      />
    </label>
  );

  return (
    <AppShell title={t('settingsTitle')} subtitle={t('settingsSubtitle')}>
      {error ? <div className="error">{error}</div> : null}
      {message ? (
        <div className="card" style={{ borderInlineStart: '4px solid var(--success)' }}>
          {message}
        </div>
      ) : null}

      {/* ---------- پوسته ---------- */}
      <div className="card">
        <h3>{t('appearance')}</h3>
        <p className="muted">{t('appearanceHint')}</p>

        <div className="theme-pills" style={{ marginTop: 12 }}>
          {/* «خودکار» اول می‌آید چون پیش‌فرض است.  کاربری که چیزی
              انتخاب نکرده، همین را دارد. */}
          <button
            type="button"
            className={`theme-pill${choice === 'auto' ? ' active' : ''}`}
            onClick={() => {
              setChoice('auto');
              const applied = autoTheme();
              setThemeState(applied);
              setChoiceState('auto');
            }}
            title="پیروی از تنظیم سیستم‌عامل"
          >
            <span
              className="theme-dot"
              style={{ background: 'linear-gradient(135deg, #1f5eff 50%, #12a67f 50%)' }}
            />
            خودکار (تنظیم سیستم)
            {choice === 'auto' ? <Icon name="check" size={14} /> : null}
          </button>

          {THEMES.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`theme-pill${choice === item.key ? ' active' : ''}`}
              onClick={() => chooseTheme(item.key)}
              title={t(item.hint)}
            >
              <span className="theme-dot" style={{ background: item.swatch }} />
              {t(item.label)}
              {choice === item.key ? <Icon name="check" size={14} /> : null}
            </button>
          ))}
        </div>

        <p className="muted" style={{ marginTop: 10 }}>
          {t(THEMES.find((item) => item.key === theme)?.hint ?? 'appearanceHint')}
        </p>
      </div>

      {/* ---------- شخصی‌سازی ---------- */}
      <div className="card">
        <h3>{t('customization')}</h3>
        <p className="muted">{t('customizationHint')}</p>

        <div style={{ marginTop: 14 }}>
          <label style={{ marginBottom: 8 }}>{t('accentColor')}</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {/* رنگ‌های آماده کنار انتخابگر آزاد: بیشتر کاربران یکی از
                این‌ها را می‌خواهند و باز کردن انتخابگر رنگ برایشان کند است. */}
            {PRESETS.map((color) => (
              <button
                key={color}
                type="button"
                className="swatch-btn"
                style={{ background: color }}
                aria-label={color}
                onClick={() => chooseAccent(color)}
              >
                {accent === color ? <Icon name="check" size={14} /> : null}
              </button>
            ))}

            <input
              type="color"
              className="swatch-input"
              value={accent || '#1f5eff'}
              onChange={(event) => chooseAccent(event.target.value)}
              aria-label={t('accentColor')}
            />

            {accent ? (
              <button type="button" className="btn-sm ghost" onClick={() => chooseAccent('')}>
                {t('resetAccent')}
              </button>
            ) : null}
          </div>
        </div>

        <div style={{ marginTop: 18 }}>
          <label style={{ marginBottom: 8 }}>{t('density')}</label>
          <div className="seg" role="group">
            {(['compact', 'normal', 'relaxed'] as const).map((item) => (
              <button
                key={item}
                type="button"
                className={density === item ? 'active' : ''}
                onClick={() => chooseDensity(item)}
              >
                {t(`density_${item}`)}
              </button>
            ))}
          </div>
          <p className="muted" style={{ marginTop: 8 }}>
            {t('densityHint')}
          </p>
        </div>
      </div>

      {/* ---------- زبان ---------- */}
      <div className="card">
        <h3>{t('language')}</h3>
        <div className="lang-pills" style={{ marginTop: 10 }}>
          {LANGS.map((item) => (
            <button
              key={item.code}
              type="button"
              className={`lang-pill${lang === item.code ? ' active' : ''}`}
              onClick={() => setLang(item.code as Lang)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* ---------- شرکت ---------- */}
      <div className="card">
        <h3>{t('companyInfo')}</h3>
        <p className="muted">{t('companyInfoHint')}</p>

        {loading ? (
          <p className="muted">{t('loading')}</p>
        ) : (
          <>
            <div className="form-row" style={{ marginTop: 12 }}>
              {field('name', 'companyName')}
              {field('legalName', 'legalName')}
              {field('taxNumber', 'taxNumber', 'ltr')}
            </div>

            <div className="form-row">
              {field('phone', 'phone', 'ltr')}
              {field('email', 'email', 'ltr')}
              {field('city', 'city')}
            </div>

            <label style={{ display: 'block' }}>
              {t('address')}
              <input
                style={TOUCH}
                value={company.address ?? ''}
                onChange={(event) =>
                  setCompany({ ...company, address: event.target.value })
                }
              />
            </label>

            <button
              type="button"
              className="btn"
              disabled={busy || !company.name?.trim()}
              onClick={() => void saveCompany()}
            >
              {t('save')}
            </button>
          </>
        )}
      </div>
    </AppShell>
  );
}

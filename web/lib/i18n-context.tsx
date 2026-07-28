'use client';

/**
 * زبان جاری برنامه.
 *
 * پیش‌تر هر کامپوننت باید `lang` را خودش می‌خواند و به `t()` پاس می‌داد؛
 * به همین دلیل بیشتر صفحه‌ها رشته فارسی ثابت داشتند. با این Provider،
 * ترجمه و قالب‌بندی عدد/تاریخ از یک جا می‌آید.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  dirFor,
  getLang,
  localeFor,
  setLangStorage,
  t as translate,
  type Lang,
} from './i18n';

type Ctx = {
  lang: Lang;
  dir: 'rtl' | 'ltr';
  locale: string;
  setLang: (next: Lang) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
  /** قالب‌بندی عدد بر اساس زبان جاری. */
  n: (value: unknown, maxFractionDigits?: number) => string;
  /** قالب‌بندی تاریخ بر اساس زبان جاری. */
  d: (value: string | Date) => string;
};

const I18nContext = createContext<Ctx | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  // سرور همیشه فارسی رندر می‌کند؛ زبان ذخیره‌شده پس از mount اعمال
  // می‌شود تا خروجی سرور و کلاینت در اولین رندر یکی باشد.
  const [lang, setLangState] = useState<Lang>('fa');

  useEffect(() => {
    setLangState(getLang());
  }, []);

  useEffect(() => {
    document.documentElement.dir = dirFor(lang);
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    setLangStorage(next);
  }, []);

  const value = useMemo<Ctx>(() => {
    const locale = localeFor(lang);

    return {
      lang,
      locale,
      dir: dirFor(lang),
      setLang,
      t: (key, vars) => translate(key, lang, vars),
      n: (v, maxFractionDigits) =>
        Number(v ?? 0).toLocaleString(locale, {
          maximumFractionDigits: maxFractionDigits ?? 0,
        }),
      d: (v) => new Date(v).toLocaleDateString(locale),
    };
  }, [lang, setLang]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): Ctx {
  const ctx = useContext(I18nContext);

  if (!ctx) {
    throw new Error('useI18n باید داخل I18nProvider استفاده شود');
  }

  return ctx;
}

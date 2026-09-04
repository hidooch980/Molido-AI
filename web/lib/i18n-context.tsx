'use client';

/**
 * زبان فعال برنامه — یک منبع واحد برای همهٔ صفحه‌ها.
 *
 * پیش از این هر کامپوننت باید `lang` را خودش از localStorage می‌خواند و به
 * `t(key, lang)` می‌داد.  نتیجه این بود که فقط سه صفحه ترجمه شدند و بقیه با
 * متن فارسیِ ثابت ماندند.  با Context، هر صفحه فقط `useI18n()` صدا می‌زند و
 * تعویض زبان بلافاصله در کل برنامه دیده می‌شود.
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

type I18nValue = {
  lang: Lang;
  setLang: (next: Lang) => void;
  /** ترجمهٔ کلید به زبان فعال */
  t: (key: string) => string;
  dir: 'rtl' | 'ltr';
  /** برای Intl — قالب‌بندی عدد، پول و تاریخ */
  locale: string;
  /** تا زمانی که زبانِ ذخیره‌شده خوانده نشده، true است */
  loading: boolean;
};

const I18nContext = createContext<I18nValue | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  // سرور همیشه 'fa' را رندر می‌کند؛ زبانِ ذخیره‌شده فقط پس از mount خوانده
  // می‌شود.  اگر مقدار اولیه را از localStorage بگیریم، رندر سرور و کلاینت
  // فرق می‌کنند و React خطای hydration می‌دهد.
  const [lang, setLangState] = useState<Lang>('fa');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLangState(getLang());
    setLoading(false);
  }, []);

  // جهت و زبانِ سند باید با زبان فعال جلو بروند، وگرنه در انگلیسی متن
  // راست‌چین می‌ماند و در عربی قالب‌بندی عدد اشتباه می‌شود.
  useEffect(() => {
    document.documentElement.dir = dirFor(lang);
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    setLangStorage(next);
  }, []);

  const value = useMemo<I18nValue>(
    () => ({
      lang,
      setLang,
      t: (key: string) => translate(key, lang),
      dir: dirFor(lang),
      locale: localeFor(lang),
      loading,
    }),
    [lang, setLang, loading],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);

  if (!value) {
    throw new Error('useI18n باید داخل <LanguageProvider> استفاده شود.');
  }

  return value;
}

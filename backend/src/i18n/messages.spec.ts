import {
  MESSAGES,
  SUPPORTED_LANGS,
  isSupportedLang,
  translateMessage,
} from './messages';

describe('i18n messages', () => {
  it('supports exactly fa, en, ar', () => {
    expect(SUPPORTED_LANGS).toEqual(['fa', 'en', 'ar']);
  });

  it('isSupportedLang validates correctly', () => {
    expect(isSupportedLang('fa')).toBe(true);
    expect(isSupportedLang('en')).toBe(true);
    expect(isSupportedLang('ar')).toBe(true);
    expect(isSupportedLang('de')).toBe(false);
    expect(isSupportedLang('')).toBe(false);
    expect(isSupportedLang(undefined)).toBe(false);
  });

  it('returns the original message for fa', () => {
    const [firstKey] = Object.keys(MESSAGES);

    expect(translateMessage(firstKey, 'fa')).toBe(firstKey);
  });

  it('translates known messages to en and ar', () => {
    const entries = Object.entries(MESSAGES).slice(0, 5);

    for (const [persian, translation] of entries) {
      expect(translateMessage(persian, 'en')).toBe(translation.en);
      expect(translateMessage(persian, 'ar')).toBe(translation.ar);
    }
  });

  it('returns the original text when no translation exists', () => {
    expect(translateMessage('یک پیام ناشناخته تصادفی', 'en')).toBe(
      'یک پیام ناشناخته تصادفی',
    );
  });
});

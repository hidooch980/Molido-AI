import { Injectable } from '@nestjs/common';

import {
  SUPPORTED_LANGS,
  SupportedLang,
  resolveLang,
  translateMessage,
} from './messages';

/**
 * سرویس چندزبانه — برای استفاده در سایر ماژول‌ها
 */
@Injectable()
export class I18nService {
  supportedLanguages(): ReadonlyArray<SupportedLang> {
    return SUPPORTED_LANGS;
  }

  resolve(request: {
    query?: Record<string, unknown>;
    headers?: Record<string, unknown>;
  }): SupportedLang {
    return resolveLang(request);
  }

  t(message: string, lang: string): string {
    return translateMessage(message, lang);
  }
}

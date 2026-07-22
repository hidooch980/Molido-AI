import { createParamDecorator, ExecutionContext } from '@nestjs/common';

import { resolveLang, SupportedLang } from '../../i18n/messages';

/**
 * دریافت زبان درخواست جاری در کنترلرها:
 *
 *   someRoute(@Lang() lang: SupportedLang) { ... }
 */
export const Lang = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): SupportedLang => {
    const request = ctx.switchToHttp().getRequest<{
      query?: Record<string, unknown>;
      headers?: Record<string, unknown>;
    }>();

    return resolveLang(request ?? {});
  },
);

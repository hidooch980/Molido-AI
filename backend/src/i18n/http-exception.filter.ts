import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
} from '@nestjs/common';

import { resolveLang, translateMessage } from './messages';

/**
 * فیلتر سراسری خطاها: پیام خطاها را بر اساس زبان درخواست
 * (?lang= یا هدر x-lang یا Accept-Language) ترجمه می‌کند.
 */
@Catch(HttpException)
export class I18nHttpExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<{
      query?: Record<string, unknown>;
      headers?: Record<string, unknown>;
    }>();
    const response = ctx.getResponse<{
      status: (code: number) => { json: (body: unknown) => void };
    }>();

    const status = exception.getStatus();
    const lang = resolveLang(request ?? {});
    const body = exception.getResponse();

    let payload: Record<string, unknown>;

    if (typeof body === 'string') {
      payload = {
        statusCode: status,
        message: translateMessage(body, lang),
      };
    } else {
      payload = { ...(body as Record<string, unknown>) };

      const message = payload['message'];

      if (typeof message === 'string') {
        payload['message'] = translateMessage(message, lang);
      } else if (Array.isArray(message)) {
        payload['message'] = message.map((item) =>
          typeof item === 'string' ? translateMessage(item, lang) : item,
        );
      }
    }

    payload['lang'] = lang;

    response.status(status).json(payload);
  }
}

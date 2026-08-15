import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Inject,
  Logger,
  Optional,
} from '@nestjs/common';

import { runInTenant } from '../database/tenant-context';
import { OperationsService } from './operations.service';
import { resolveLang, translateMessage } from '../i18n/messages';

/**
 * فیلتر سراسری خطا: ترجمه + ثبت.
 *
 * جایگزین `I18nHttpExceptionFilter` است که فقط `HttpException` را
 * می‌گرفت — یعنی خطاهای ۵۰۰، که مهم‌ترین‌اند، اصلاً از آن رد نمی‌شدند و
 * پاسخ خام Nest به کاربر می‌رسید.
 *
 * دو کار می‌کند و هر دو باید بی‌خطر باشند:
 *
 *   **ترجمه** — همان کاری که قبلاً بود.
 *   **ثبت** — گروه‌بندی‌شده، برای اینکه بشود دید چه چیزی تکرار می‌شود.
 *
 * ثبت هرگز نباید پاسخ را به تعویق بیندازد یا بشکند: `void` صدا زده
 * می‌شود، نه `await`.  کاربر پاسخش را می‌گیرد، ثبت در پس‌زمینه انجام
 * می‌شود.
 */
@Catch()
export class ErrorRecorderFilter implements ExceptionFilter {
  private readonly logger = new Logger('Error');

  constructor(
    @Optional() @Inject(OperationsService)
    private readonly operations: OperationsService | null,
  ) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();

    const request = ctx.getRequest<{
      query?: Record<string, unknown>;
      headers?: Record<string, unknown>;
      url?: string;
      method?: string;
      user?: { companyId?: string; userId?: string };
    }>();

    const response = ctx.getResponse<{
      status: (code: number) => { json: (body: unknown) => void };
    }>();

    const isHttp = exception instanceof HttpException;
    const status = isHttp
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    const lang = resolveLang(request ?? {});

    let payload: Record<string, unknown>;
    let rawMessage: string;

    if (isHttp) {
      const body = exception.getResponse();

      if (typeof body === 'string') {
        rawMessage = body;
        payload = { statusCode: status, message: translateMessage(body, lang) };
      } else {
        payload = { ...(body as Record<string, unknown>) };
        const message = payload['message'];

        if (typeof message === 'string') {
          rawMessage = message;
          payload['message'] = translateMessage(message, lang);
        } else if (Array.isArray(message)) {
          rawMessage = message.filter((item) => typeof item === 'string').join('; ');
          payload['message'] = message.map((item) =>
            typeof item === 'string' ? translateMessage(item, lang) : item,
          );
        } else {
          rawMessage = exception.message;
        }
      }
    } else {
      // خطای پیش‌بینی‌نشده.  جزئیاتش به کاربر داده نمی‌شود — پیام
      // دیتابیس و مسیر فایل، هم بی‌فایده‌اند هم اطلاعات داخلی لو می‌دهند.
      rawMessage = exception instanceof Error ? exception.message : String(exception);
      payload = {
        statusCode: status,
        message: translateMessage('خطای داخلی سرور', lang),
      };
    }

    payload['lang'] = lang;

    // پاسخ اول، ثبت بعد.  ترتیبش مهم است: کاربر نباید منتظر نوشتن در
    // دیتابیس بماند.
    response.status(status).json(payload);

    // خطای سرور همچنان در لاگ کانتینر چاپ می‌شود.
    //
    // بدون این، جایگزینی فیلتر قبلی یک پس‌رفت بود: ثبت در دیتابیس عمداً
    // خطایش را می‌بلعد، پس اگر خودِ ثبت هم بشکند هیچ ردی نمی‌ماند و
    // عیب‌یابی کور می‌شود.
    if (status >= 500) {
      this.logger.error(
        `${request?.method ?? ''} ${request?.url ?? ''} — ${rawMessage}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    // ثبت **داخل زمینهٔ شرکت** انجام می‌شود.
    //
    // چون پس از ارسال پاسخ صدا زده می‌شود، از دامنهٔ `AsyncLocalStorage`
    // درخواست بیرون افتاده و `app.company_id` خالی است — یعنی سیاست RLS
    // درج را رد می‌کند و خطا (که خودش بلعیده می‌شود) بی‌سروصدا گم می‌شود.
    // نتیجه: جدول همیشه خالی، بی‌آنکه کسی بفهمد چرا.
    const companyId = request?.user?.companyId ?? null;

    const write = () =>
      void this.operations?.record({
        companyId,
        userId: request?.user?.userId ?? null,
        message: rawMessage,
        statusCode: status,
        path: request?.url,
        method: request?.method,
        stack: exception instanceof Error ? exception.stack : undefined,
      });

    if (companyId) runInTenant({ companyId, userId: null }, write);
    else write();
  }
}

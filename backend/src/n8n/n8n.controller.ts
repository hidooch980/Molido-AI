import { timingSafeEqual } from 'node:crypto';

import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Logger,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * مقایسهٔ رمز در زمانِ ثابت.
 *
 * `===` به‌محضِ اولین نویسهٔ نامساوی برمی‌گردد.  کسی که می‌تواند
 * هزاران درخواست بزند، از تفاوتِ زمان می‌تواند رمز را نویسه‌به‌نویسه
 * حدس بزند.  اختلافش میکروثانیه است ولی روی شبکهٔ محلی سنجیدنی.
 *
 * طولِ نامساوی زودتر رد می‌شود — `timingSafeEqual` روی بافرِ
 * نامساوی خطا می‌دهد.  خودِ طول راز نیست.
 */
function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  if (x.length !== y.length) return false;
  return timingSafeEqual(x, y);
}

/**
 * کنترلر دریافت ویب‌هوک از n8n به سمت سرور
 *
 * n8n می‌تواند با HTTP Request نود درخواست‌هایی به Molido بفرستد:
 *   - دریافت گزارش داشبورد
 *   - دریافت کالاهای موجودی کم
 *   - تریگر اعلان داخلی
 */
@Controller('n8n')
export class N8nController {
  private readonly logger = new Logger(N8nController.name);
  private readonly secret: string | null;

  constructor(private readonly config: ConfigService) {
    // ⚠️ اینجا قبلاً پیش‌فرضِ `'molido_n8n_secret'` بود.
    //
    //    یعنی هر استقراری که این متغیر را جا می‌انداخت، با رمزی کار
    //    می‌کرد که در مخزنِ عمومی نوشته شده بود — بی‌هیچ خطا، بی‌هیچ
    //    هشدار.  درِ باز که شبیه درِ قفل به نظر می‌رسد، از درِ باز
    //    بدتر است.
    //
    //    حالا نبودِ رمز یعنی **بسته**، نه باز.  سرویس بالا می‌آید
    //    (کسی که n8n ندارد نباید استقرارش بشکند) ولی این مسیر همه را
    //    رد می‌کند و علتش را یک بار در لاگ می‌گوید.
    const raw = this.config.get<string>('N8N_WEBHOOK_SECRET')?.trim();
    this.secret = raw ? raw : null;
    if (!this.secret) {
      this.logger.warn(
        'N8N_WEBHOOK_SECRET تنظیم نشده — مسیر /n8n/incoming بسته است',
      );
    }
  }

  private guard(headers: Record<string, string | undefined>) {
    if (!this.secret) {
      throw new UnauthorizedException('n8n webhook is not configured');
    }

    const incoming = headers['x-molido-secret'];
    if (typeof incoming !== 'string' || !safeEqual(incoming, this.secret)) {
      throw new UnauthorizedException('Invalid n8n webhook secret');
    }
  }

  /**
   * وضعیت سرویس — برای health-check از n8n
   * بدون احراز هویت قابل دسترس است
   */
  @Get('health')
  health() {
    // ⚠️ این مسیر بی‌احراز هویت است، پس فقط «زنده‌ام».
    //
    //    نسخه و نشانیِ مستندات از اینجا برداشته شد: به کسی که
    //    احراز هویت نشده نباید گفت چه نسخه‌ای اجرا می‌شود (نقشهٔ
    //    راهِ آسیب‌پذیری‌های شناخته‌شده است)، و آن `localhost` هم
    //    برای بیرون اصلاً معنایی نداشت.
    return {
      status: 'ok',
      service: 'Molido AI',
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * دریافت رویداد از n8n با تایید Secret
   * این اینترفیس خلاصه‌ای است، برای گسترش به endpointهای خاص می‌توانید
   * از سرویس‌های دیگر (Sales، Notifications، …) استفاده کنید
   */
  @Post('incoming')
  @HttpCode(200)
  incoming(
    @Headers() headers: Record<string, string | undefined>,
    @Body() body: Record<string, unknown>,
  ) {
    this.guard(headers);

    const { event, data } = body;

    return {
      received: true,
      event: event ?? 'unknown',
      timestamp: new Date().toISOString(),
      echo: data ?? null,
    };
  }
}

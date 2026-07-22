import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

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
  private readonly secret: string;

  constructor(private readonly config: ConfigService) {
    this.secret =
      this.config.get<string>('N8N_WEBHOOK_SECRET') ?? 'molido_n8n_secret';
  }

  private guard(headers: Record<string, string | undefined>) {
    const incoming = headers['x-molido-secret'];

    if (incoming !== this.secret) {
      throw new UnauthorizedException('Invalid n8n webhook secret');
    }
  }

  /**
   * وضعیت سرویس — برای health-check از n8n
   * بدون احراز هویت قابل دسترس است
   */
  @Get('health')
  health() {
    return {
      status: 'ok',
      service: 'Molido AI',
      version: '2.0.0',
      timestamp: new Date().toISOString(),
      docs: 'http://localhost:3000/api-docs',
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

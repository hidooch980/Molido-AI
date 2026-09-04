import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { DatabaseService } from '../database/database.service';

/**
 * بررسی سلامت بدون احراز هویت — برای healthcheck داکر و بالانسر.
 *
 * `/health` خودش پشت JWT است (گزارش سلامت کسب‌وکار)، بنابراین برای پایش
 * زیرساخت قابل استفاده نیست.  این مسیر عمداً چیزی جز «بالا هست یا نه»
 * فاش نمی‌کند.
 */
@ApiTags('وضعیت سیستم')
@Controller()
export class LivenessController {
  constructor(private readonly db: DatabaseService) {}

  /** فقط نشان می‌دهد فرایند بالا آمده است. */
  @Get('healthz')
  live() {
    return { status: 'ok' };
  }

  /** آماده به کار — یعنی اتصال دیتابیس هم برقرار است. */
  @Get('readyz')
  async ready() {
    try {
      await this.db.query('SELECT 1');
    } catch {
      throw new ServiceUnavailableException('دیتابیس در دسترس نیست');
    }
    return { status: 'ok', database: 'up' };
  }
}

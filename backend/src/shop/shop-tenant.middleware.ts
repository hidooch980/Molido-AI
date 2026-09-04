import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import process from 'node:process';

import { DatabaseService } from '../database/database.service';
import { runAsSystem } from '../database/tenant-context';

/**
 * زمینهٔ شرکت را برای مسیرهای عمومی فروشگاه تعیین می‌کند.
 *
 * مشتری فروشگاه اینترنتی توکن ندارد، پس `TenantInterceptor` چیزی برای
 * خواندن پیدا نمی‌کند و به‌خاطر رفتار fail-closed هیچ کالایی برنمی‌گردد.
 *
 * شناسهٔ شرکت **از پیکربندی سرور** می‌آید، نه از درخواست.  اگر از هدر یا
 * پارامتر خوانده می‌شد، هر کسی می‌توانست داده‌های هر شرکتی را ببیند — یعنی
 * دقیقاً همان حفره‌ای که RLS برای بستنش ساخته شد.
 *
 * `SHOP_COMPANY_ID` اگر تنظیم نشده باشد، تنها شرکت موجود انتخاب می‌شود؛
 * در نصب‌های تک‌شرکتی — که حالت رایج است — پیکربندی اضافه لازم نباشد.
 */
@Injectable()
export class ShopTenantMiddleware implements NestMiddleware {
  private cached: string | null = null;

  constructor(private readonly db: DatabaseService) {}

  async use(req: Request, _res: Response, next: NextFunction): Promise<void> {
    const configured = process.env.SHOP_COMPANY_ID?.trim();

    if (configured) {
      (req as { shopCompanyId?: string }).shopCompanyId = configured;
      return next();
    }

    if (!this.cached) {
      // خواندن فهرست شرکت‌ها خودش به زمینه نیاز دارد و هنوز زمینه‌ای
      // نداریم؛ پس این یک پرس‌وجوی سیستمی است.
      const rows = await runAsSystem(() =>
        this.db.query<{ id: string }>(
          'SELECT id FROM "Company" ORDER BY "createdAt" LIMIT 2',
        ),
      );

      // بیش از یک شرکت یعنی حدس زدن خطرناک است؛ در آن حالت باید
      // SHOP_COMPANY_ID صریح تنظیم شود.
      if (rows.length === 1) this.cached = rows[0].id;
    }

    if (this.cached) {
      (req as { shopCompanyId?: string }).shopCompanyId = this.cached;
    }

    next();
  }
}

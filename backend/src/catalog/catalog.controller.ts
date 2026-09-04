import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { BarcodeCatalogService } from './barcode-catalog.service';

/**
 * شناساییِ کالا از روی بارکد.
 *
 * ⚠️ عمومی **نیست**.
 *
 *    فهرست بین‌شرکتی است ولی مسیرش نه: مسیرِ باز یعنی هرکسی بتواند
 *    کلِ فهرست را با پیمایشِ بارکدها بیرون بکشد.  و چون تصویر دانلود
 *    می‌شود، مسیرِ باز راهِ ارزانی هم برای پر کردنِ دیسک می‌شد.
 */
@ApiTags('فهرست کالا')
@Controller('catalog')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CatalogController {
  constructor(private readonly catalog: BarcodeCatalogService) {}

  /**
   * اسکن شد → شناسایی کن.
   *
   * ⚠️ سقفِ نرخ دارد: هر جست‌وجوی ناموفق می‌تواند به تماسِ بیرونی و
   *    دانلودِ تصویر ختم شود.  بدونِ سقف، یک حلقهٔ اشتباه در اسکریپتِ
   *    کسی دیسک را پر می‌کند.
   */
  @Get(':barcode')
  @Throttle({ long: { ttl: 60000, limit: 60 } })
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'CASHIER', 'SALES', 'EMPLOYEE')
  lookup(@Param('barcode') barcode: string) {
    return this.catalog.lookup(barcode);
  }

  /**
   * ثبتِ دستی در فهرستِ مشترک.
   *
   * ⚠️ فقط میدان‌های عمومی پذیرفته می‌شوند و بقیه **دور ریخته**
   *    می‌شوند — نه اینکه اعتبارسنجی شوند.  فهرستِ سفید از فهرستِ
   *    سیاه امن‌تر است: میدانی که فردا اضافه شود خودبه‌خود بیرون
   *    می‌ماند، و قیمت و موجودی هرگز به فهرستِ مشترک نشت نمی‌کنند.
   */
  @Post()
  @Throttle({ long: { ttl: 60000, limit: 60 } })
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER')
  async remember(@Body() body: Record<string, unknown>) {
    await this.catalog.remember({
      barcode: body?.barcode,
      name: body?.name,
      brand: body?.brand,
      unit: body?.unit,
      category: body?.category,
      source: 'LOCAL',
    });
    return { ok: true };
  }
}

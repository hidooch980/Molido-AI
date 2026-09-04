import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';

import { PurchasingService } from './purchasing.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { CreateInquiryDto, DialSupplierDto, RecordCallDto } from './dto/purchasing.dto';
import { Permission } from '../common/decorators/permission.decorator';

/** خرید کار انباردار و مدیر است، نه صندوق‌دار. */
const BUYER_ROLES = ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'WAREHOUSE'] as const;

@Controller('purchasing')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PurchasingController {
  constructor(private readonly purchasing: PurchasingService) {}

  /** کالاهایی که باید خریده شوند — پیشنهاد اولیهٔ منشی. */
  @Get('suggestions')
  @Roles(...BUYER_ROLES)
  suggestions(@CurrentUser() user: AuthUser, @Query('warehouseId') warehouseId?: string) {
    return this.purchasing.suggestions(user.companyId as string, warehouseId);
  }

  @Get('inquiries')
  @Roles(...BUYER_ROLES)
  list(@CurrentUser() user: AuthUser, @Query('status') status?: string) {
    return this.purchasing.list(user.companyId as string, status);
  }

  @Post('inquiries')
  @Roles(...BUYER_ROLES)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateInquiryDto) {
    return this.purchasing.createInquiry(
      user.companyId as string,
      user.userId as string,
      dto,
    );
  }

  @Get('inquiries/:id')
  @Roles(...BUYER_ROLES)
  detail(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.purchasing.detail(user.companyId as string, id);
  }

  /** فهرست تماس: کدام بنکدار برای کدام قلم، مرتب بر اساس سابقه. */
  @Get('inquiries/:id/call-list')
  @Roles(...BUYER_ROLES)
  callList(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.purchasing.callList(user.companyId as string, id);
  }

  /**
   * ثبت تماس و قیمت‌ها.
   *
   * همین مسیر هم برای تماس دستی است هم برای ویپ — تفاوتشان فقط
   * `channel` است.
   */
  @Post('inquiries/:id/calls')
  @Roles(...BUYER_ROLES)
  recordCall(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: RecordCallDto,
  ) {
    return this.purchasing.recordCall(user.companyId as string, id, dto);
  }

  @Get('inquiries/:id/compare')
  @Roles(...BUYER_ROLES)
  compare(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.purchasing.compare(user.companyId as string, id);
  }

  /** تبدیل برندگان به فاکتور خرید — یکی به ازای هر تأمین‌کننده. */
  @Post('inquiries/:id/order')
  @Permission('purchasing:order')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER')
  order(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.purchasing.order(user.companyId as string, user.userId as string, id);
  }

  /** تاریخچهٔ قیمت یک کالا نزد تأمین‌کننده‌های مختلف. */
  /** کارنامهٔ بنکداران — مقایسه در طول زمان، نه در یک استعلام. */
  @Get('scorecard')
  scorecard(@CurrentUser() user: AuthUser, @Query('days') days?: string) {
    // بازهٔ پیش‌فرض شش ماه: کوتاه‌تر از آن، بنکداری که ماهی یک بار
    // سفارش می‌گیرد اصلاً در آمار نمی‌آید.
    const n = Number(days);
    return this.purchasing.supplierScorecard(
      user.companyId as string,
      Number.isFinite(n) && n > 0 ? Math.min(n, 1095) : 180,
    );
  }

  /**
   * زنگ زدن به بنکدار از راه مرکز تلفن.
   *
   * ⚠️ ورودی `supplierId` است نه شمارهٔ تلفن — عمدی و مهم.  اگر شماره
   *    را از بدنه می‌گرفت، این نقطهٔ پایانی یک شماره‌گیرِ انبوه می‌شد
   *    که از خطِ خودِ فروشگاه زنگ می‌زند.
   *
   * `extension` داخلیِ خودِ اپراتور است: مرکز اول به او زنگ می‌زند و
   * وقتی برداشت، شمارهٔ بنکدار را می‌گیرد.
   */
  @Post('inquiries/:id/dial')
  @Permission('purchasing:dial')
  @Roles(...BUYER_ROLES)
  dial(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: DialSupplierDto,
  ) {
    return this.purchasing.dialSupplier(
      user.companyId as string,
      id,
      body.supplierId,
      body.extension,
    );
  }

  @Get('price-history/:productId')
  @Roles(...BUYER_ROLES)
  priceHistory(@CurrentUser() user: AuthUser, @Param('productId') productId: string) {
    return this.purchasing.priceHistory(user.companyId as string, productId);
  }
}

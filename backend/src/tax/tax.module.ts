import {
  Body,
  Controller,
  Get,
  Module,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { TaxService } from './tax.service';
import { SeasonalService } from './seasonal.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';

@ApiTags('سامانهٔ مؤدیان')
@ApiBearerAuth()
@Controller('tax')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TaxController {
  constructor(private readonly tax: TaxService) {}

  @Get('settings')
  @Roles('SUPER_ADMIN', 'ADMIN')
  settings(@CurrentUser() user: AuthUser) {
    return this.tax.settings(user.companyId as string);
  }

  @Post('settings')
  @Roles('SUPER_ADMIN', 'ADMIN')
  saveSettings(@CurrentUser() user: AuthUser, @Body() dto: Record<string, unknown>) {
    return this.tax.saveSettings(user.companyId as string, dto);
  }

  @Get('stats')
  stats(@CurrentUser() user: AuthUser) {
    return this.tax.stats(user.companyId as string);
  }

  @Get('invoices')
  list(@CurrentUser() user: AuthUser, @Query('status') status?: string) {
    return this.tax.list(user.companyId as string, status);
  }

  /** افزودن یک فاکتور به صف. */
  @Post('invoices/:saleId')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER')
  enqueue(@CurrentUser() user: AuthUser, @Param('saleId') saleId: string) {
    return this.tax.enqueue(user.companyId as string, saleId);
  }

  /** افزودن گروهی همهٔ فاکتورهای ارسال‌نشده. */
  @Post('enqueue-pending')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER')
  enqueuePending(@CurrentUser() user: AuthUser, @Body() dto: { limit?: number }) {
    return this.tax.enqueuePending(user.companyId as string, dto?.limit);
  }

  /**
   * اجرای صف.
   *
   * دستی صدا زده می‌شود نه با زمان‌بند: تا وقتی نگاشت میدان‌ها با
   * اطلاعات واقعی تأیید نشده، ارسال خودکار یعنی خطای تکرارشونده بدون
   * اینکه کسی ببیند.
   */
  @Post('process')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER')
  process(@CurrentUser() user: AuthUser, @Body() dto: { limit?: number }) {
    return this.tax.processQueue(user.companyId as string, dto?.limit);
  }
}


/**
 * گزارش فصلی — ماده ۱۶۹ مکرر.
 *
 * ⚠️ مسیرِ جدا از `tax` نیست، چون هر دو مالیات‌اند و تنظیماتِ مؤدی را
 *    مشترک می‌خوانند.  ولی کنترلرِ جدا دارد چون دسترسی‌اش فرق می‌کند:
 *    صفِ مؤدیان را صندوق‌دار هم می‌بیند، گزارش فصلی را نه.
 */
@ApiTags('گزارش فصلی')
@ApiBearerAuth()
@Controller('tax/seasonal')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SeasonalController {
  constructor(private readonly seasonal: SeasonalService) {}

  /** فصلِ جاری و فصلِ پیشین — پیش‌فرضِ رابط. */
  @Get('period')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT')
  period() {
    return this.seasonal.currentPeriod();
  }

  @Get(':jy/:quarter')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT')
  report(
    @CurrentUser() user: AuthUser,
    @Param('jy') jy: string,
    @Param('quarter') quarter: string,
  ) {
    return this.seasonal.report(user.companyId as string, Number(jy), Number(quarter));
  }
}

@Module({
  controllers: [TaxController, SeasonalController],
  providers: [TaxService, SeasonalService],
  exports: [TaxService, SeasonalService],
})
export class TaxModule {}

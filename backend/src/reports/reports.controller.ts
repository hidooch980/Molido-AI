import { Controller, Get, Header, Query, UseGuards } from '@nestjs/common';

import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { Permission } from '../common/decorators/permission.decorator';

@Controller('reports')
// ⚠️ `RolesGuard` اینجا نبود — و `@Permission('sales:report')` روی
//    مسیرِ گزارش فروش کاملاً تزئینی بود.
//
//    در آزمون زنده، کاربرِ نقشِ EMPLOYEE گزارش فروش را گرفت.  دکوراتور
//    نوشته شده بود، در فهرست اختیارات دیده می‌شد، و مدیر باور می‌کرد
//    محدود است — ولی هیچ نگهبانی آن را نمی‌خواند.
//
//    دکوراتورِ بی‌نگهبان بدترین حالت است: هم امنیت نمی‌دهد، هم
//    خیالِ امنیت می‌دهد.
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('dashboard')
  dashboard(@CurrentUser() user: AuthUser) {
    return this.reportsService.dashboard(user.companyId as string);
  }

  @Get('sales')
  @Permission('sales:report')
  salesReport(
    @CurrentUser() user: AuthUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.reportsService.salesReport(
      user.companyId as string,
      from,
      to,
    );
  }

  /**
   * خروجی CSV گزارش فروش (قابل بازشدن در Excel)
   */
  @Get('sales/export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="sales-report.csv"')
  salesExport(
    @CurrentUser() user: AuthUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.reportsService.salesReportCsv(
      user.companyId as string,
      from,
      to,
    );
  }

  @Get('sales/breakdown')
  breakdown(
    @CurrentUser() user: AuthUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.reportsService.salesBreakdown(
      user.companyId as string,
      from,
      to,
    );
  }

  @Get('profit')
  profitReport(
    @CurrentUser() user: AuthUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.reportsService.profitReport(
      user.companyId as string,
      from,
      to,
    );
  }

  @Get('top-products')
  topProducts(
    @CurrentUser() user: AuthUser,
    @Query('limit') limit?: string,
  ) {
    return this.reportsService.topProducts(
      user.companyId as string,
      limit ? Number(limit) : 10,
    );
  }

  @Get('purchases')
  purchasesReport(@CurrentUser() user: AuthUser) {
    return this.reportsService.purchasesReport(user.companyId as string);
  }

  @Get('inventory')
  inventoryReport(@CurrentUser() user: AuthUser) {
    return this.reportsService.inventoryReport(user.companyId as string);
  }

  /**
   * خروجی CSV گزارش موجودی انبار
   */
  @Get('inventory/export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="inventory-report.csv"')
  inventoryExport(@CurrentUser() user: AuthUser) {
    return this.reportsService.inventoryReportCsv(user.companyId as string);
  }
}

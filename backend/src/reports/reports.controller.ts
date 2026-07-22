import { Controller, Get, Header, Query, UseGuards } from '@nestjs/common';

import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';

@Controller('reports')
@UseGuards(JwtAuthGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('dashboard')
  dashboard(@CurrentUser() user: AuthUser) {
    return this.reportsService.dashboard(user.companyId as string);
  }

  @Get('sales')
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

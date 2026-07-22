import { Controller, Get, UseGuards } from '@nestjs/common';

import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
  ) {}

  @Get()
  getAllAlerts(@CurrentUser() user: AuthUser) {
    return this.notificationsService.getAllAlerts(user.companyId as string);
  }

  @Get('low-stock')
  getLowStockAlerts(@CurrentUser() user: AuthUser) {
    return this.notificationsService.getLowStockAlerts(
      user.companyId as string,
    );
  }

  @Get('expiry')
  getExpiryAlerts(@CurrentUser() user: AuthUser) {
    return this.notificationsService.getExpiryAlerts(
      user.companyId as string,
    );
  }

  @Get('unpaid-sales')
  getUnpaidSales(@CurrentUser() user: AuthUser) {
    return this.notificationsService.getUnpaidSales(
      user.companyId as string,
    );
  }

  @Get('recent-sales')
  getRecentSalesAlerts(@CurrentUser() user: AuthUser) {
    return this.notificationsService.getRecentSalesAlerts(
      user.companyId as string,
    );
  }
}

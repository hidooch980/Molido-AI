import { Controller, Get, Query, UseGuards } from '@nestjs/common';

import { RevenueService } from './revenue.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';

/**
 * Receipts are written only through the subsystem that owns the record being
 * paid for, so this controller is read-only by design — there is no endpoint
 * that can credit a cash box without a corresponding bill, licence or invoice.
 */
@Controller('revenue')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RevenueController {
  constructor(private readonly revenueService: RevenueService) {}

  @Get('receipts')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT', 'CASHIER')
  findAll(
    @CurrentUser() user: AuthUser,
    @Query('entityType') entityType?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
  ) {
    return this.revenueService.findAll(user.companyId as string, {
      entityType,
      from,
      to,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('stats')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT')
  stats(
    @CurrentUser() user: AuthUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.revenueService.stats(user.companyId as string, from, to);
  }
}

import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { CashierShiftService } from './cashier-shift.service';
import { ScanService } from './scan.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';

const CASHIER_ROLES = ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'CASHIER', 'SALES'] as const;

@Controller('retail')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RetailController {
  constructor(
    private readonly shifts: CashierShiftService,
    private readonly scanner: ScanService,
  ) {}

  // ---------- اسکن ----------

  /** یک اسکن را به سطر فاکتور تبدیل می‌کند (بارکد کالا، برچسب ترازو یا SKU). */
  @Get('scan')
  @Roles(...CASHIER_ROLES)
  scan(
    @CurrentUser() user: AuthUser,
    @Query('code') code: string,
    @Query('warehouseId') warehouseId?: string,
  ) {
    return this.scanner.scan(user.companyId as string, code, { warehouseId });
  }

  @Get('search')
  @Roles(...CASHIER_ROLES)
  search(
    @CurrentUser() user: AuthUser,
    @Query('q') term: string,
    @Query('limit') limit?: string,
  ) {
    return this.scanner.search(
      user.companyId as string,
      term,
      limit ? Number(limit) : undefined,
    );
  }

  // ---------- شیفت صندوق ----------

  /** شیفت باز خود صندوق‌دار — صفحهٔ صندوق با این شروع می‌شود. */
  @Get('shifts/current')
  @Roles(...CASHIER_ROLES)
  current(@CurrentUser() user: AuthUser) {
    return this.shifts.current(user.companyId as string, user.userId);
  }

  @Get('shifts')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT')
  findAll(
    @CurrentUser() user: AuthUser,
    @Query('userId') userId?: string,
    @Query('cashBoxId') cashBoxId?: string,
    @Query('open') open?: string,
    @Query('limit') limit?: string,
  ) {
    return this.shifts.findAll(user.companyId as string, {
      userId,
      cashBoxId,
      open: open === undefined ? undefined : open === 'true',
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('shifts/:id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT', 'CASHIER')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.shifts.findOne(user.companyId as string, id);
  }

  @Post('shifts/open')
  @Roles(...CASHIER_ROLES)
  open(
    @Body()
    body: { cashBoxId: string; warehouseId?: string; openingCash?: number; note?: string },
    @CurrentUser() user: AuthUser,
  ) {
    return this.shifts.open(user.companyId as string, user.userId, body);
  }

  @Patch('shifts/:id/close')
  @Roles(...CASHIER_ROLES)
  close(
    @Param('id') id: string,
    @Body() body: { countedCash?: number; note?: string },
    @CurrentUser() user: AuthUser,
  ) {
    return this.shifts.close(user.companyId as string, id, user.userId, body);
  }
}

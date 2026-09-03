import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { PettyCashService } from './petty-cash.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';

/**
 * تنخواه گردان.
 *
 * ⚠️ خرج کردن دسترسیِ بازتری از ساختنِ صندوق دارد، عمداً.
 *
 *    تنخواه‌دار باید بتواند خرج ثبت کند وگرنه اصلاً کار نمی‌کند؛ ولی
 *    ساختنِ صندوقِ تازه و تعیینِ سقف تصمیمِ مدیریتی است.
 */
@ApiTags('تنخواه گردان')
@ApiBearerAuth()
@Controller('petty-cash')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PettyCashController {
  constructor(private readonly petty: PettyCashService) {}

  @Get()
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT')
  list(@CurrentUser() user: AuthUser) {
    return this.petty.list(user.companyId as string);
  }

  @Post()
  @Roles('SUPER_ADMIN', 'ADMIN')
  create(@CurrentUser() user: AuthUser, @Body() dto: Record<string, never>) {
    return this.petty.create(user.companyId as string, dto);
  }

  @Get(':id/statement')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT')
  statement(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.petty.statement(user.companyId as string, id, from, to);
  }

  /** شارژ از صندوق یا بانک. */
  @Post(':id/charge')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER')
  charge(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: Record<string, never>,
  ) {
    return this.petty.charge(user.companyId as string, id, dto, user.userId);
  }

  /** خرجِ تنخواه‌دار. */
  @Post(':id/spend')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT', 'CASHIER')
  spend(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: Record<string, never>,
  ) {
    return this.petty.spend(user.companyId as string, id, dto, user.userId);
  }

  /** برگرداندنِ ماندهٔ استفاده‌نشده. */
  @Post(':id/settle')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER')
  settle(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: Record<string, never>,
  ) {
    return this.petty.settle(user.companyId as string, id, dto, user.userId);
  }
}

import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';

import { CashBoxService } from './cashbox.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';

@Controller('cashbox')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CashBoxController {
  constructor(private readonly cashBoxService: CashBoxService) {}

  @Get()
  findAll(@CurrentUser() user: AuthUser) {
    return this.cashBoxService.findAll(user.companyId as string);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.cashBoxService.findOne(id, user.companyId as string);
  }

  @Post()
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT')
  create(
    @Body() body: { name: string; code: string; balance?: number },
    @CurrentUser() user: AuthUser,
  ) {
    return this.cashBoxService.create(user.companyId as string, body);
  }

  @Patch(':id/deposit')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT', 'CASHIER')
  deposit(
    @Param('id') id: string,
    @Body() body: { amount: number; reason?: string; note?: string },
    @CurrentUser() user: AuthUser,
  ) {
    return this.cashBoxService.deposit(
      id,
      user.companyId as string,
      body.amount,
      body.reason,
      body.note ?? null,
      user.userId ?? null,
    );
  }

  @Patch(':id/withdraw')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT')
  withdraw(
    @Param('id') id: string,
    @Body() body: { amount: number; reason?: string; note?: string },
    @CurrentUser() user: AuthUser,
  ) {
    return this.cashBoxService.withdraw(
      id,
      user.companyId as string,
      body.amount,
      body.reason,
      body.note ?? null,
      user.userId ?? null,
    );
  }

  /**
   * ردِ حسابرسیِ صندوق.
   *
   * ⚠️ تا امروز چنین چیزی وجود نداشت: واریز و برداشت فقط عدد را عوض
   *    می‌کردند و هیچ‌کس نمی‌توانست بپرسد چه کسی، کِی، بابتِ چه.
   */
  @Get(':id/transactions')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT')
  transactions(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.cashBoxService.transactions(id, user.companyId as string);
  }

  @Delete(':id')
  @Roles('SUPER_ADMIN', 'ADMIN')
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.cashBoxService.remove(id, user.companyId as string);
  }
}

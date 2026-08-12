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

import { BasketLine, RationService } from './ration.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';

/** نقش‌هایی که پشت صندوق می‌نشینند و باید کالابرگ را ببینند. */
const CASHIER_ROLES = ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'CASHIER', 'SALES'] as const;
const BACK_OFFICE_ROLES = ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT'] as const;

@Controller('ration')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RationController {
  constructor(private readonly ration: RationService) {}

  // ---------- صندوق ----------

  /** جستجوی حساب با کد ملی — مسیر اصلی صندوق. */
  @Get('accounts/by-national-code/:nationalCode')
  @Roles(...CASHIER_ROLES)
  byNationalCode(
    @Param('nationalCode') nationalCode: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.ration.findByNationalCode(user.companyId as string, nationalCode);
  }

  /** محاسبهٔ سهم قابل پرداخت سبد با کالابرگ، پیش از تسویه. */
  @Post('eligibility')
  @Roles(...CASHIER_ROLES)
  eligibility(@Body() body: { items: BasketLine[] }, @CurrentUser() user: AuthUser) {
    return this.ration.eligibility(user.companyId as string, body.items ?? []);
  }

  // ---------- مدیریت حساب‌ها ----------

  @Get('accounts')
  @Roles(...BACK_OFFICE_ROLES)
  findAll(
    @CurrentUser() user: AuthUser,
    @Query('search') search?: string,
    @Query('limit') limit?: string,
  ) {
    return this.ration.findAll(user.companyId as string, {
      search,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('accounts/:id')
  @Roles(...BACK_OFFICE_ROLES)
  findOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.ration.findOne(user.companyId as string, id);
  }

  @Post('accounts')
  @Roles(...BACK_OFFICE_ROLES)
  create(
    @Body()
    body: {
      nationalCode: string;
      holderName?: string;
      phone?: string;
      householdSize?: number;
      periodCode?: string;
      note?: string;
    },
    @CurrentUser() user: AuthUser,
  ) {
    return this.ration.create(user.companyId as string, body);
  }

  @Patch('accounts/:id')
  @Roles(...BACK_OFFICE_ROLES)
  update(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: AuthUser,
  ) {
    return this.ration.update(user.companyId as string, id, body);
  }

  /** شارژ اعتبار دوره‌ای. */
  @Post('accounts/:id/allocate')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER')
  allocate(
    @Param('id') id: string,
    @Body() body: { amount: number; periodCode: string; reference?: string },
    @CurrentUser() user: AuthUser,
  ) {
    return this.ration.allocate(user.companyId as string, id, {
      ...body,
      userId: user.userId,
    });
  }

  // ---------- تسویه ----------

  @Get('settlement')
  @Roles(...BACK_OFFICE_ROLES)
  settlement(
    @CurrentUser() user: AuthUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.ration.settlementReport(user.companyId as string, from, to);
  }
}

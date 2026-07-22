import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { AccountingService } from './accounting.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';

@Controller('accounting')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AccountingController {
  constructor(private readonly accountingService: AccountingService) {}

  @Get('summary')
  summary(
    @CurrentUser() user: AuthUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.accountingService.summary(
      user.companyId as string,
      from,
      to,
    );
  }

  @Get('accounts')
  findAllAccounts(@CurrentUser() user: AuthUser) {
    return this.accountingService.findAllAccounts(user.companyId as string);
  }

  @Get('accounts/:id')
  findAccount(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.accountingService.findAccount(id, user.companyId as string);
  }

  @Post('accounts')
  @Roles('SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT')
  createAccount(
    @Body()
    body: { name: string; code: string; type: string; balance?: number },
    @CurrentUser() user: AuthUser,
  ) {
    return this.accountingService.createAccount(
      user.companyId as string,
      body,
    );
  }

  @Patch('accounts/:id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT')
  updateAccount(
    @Param('id') id: string,
    @Body()
    body: { name?: string; code?: string; type?: string; isActive?: boolean },
    @CurrentUser() user: AuthUser,
  ) {
    return this.accountingService.updateAccount(
      id,
      user.companyId as string,
      body,
    );
  }

  @Delete('accounts/:id')
  @Roles('SUPER_ADMIN', 'ADMIN')
  removeAccount(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.accountingService.removeAccount(
      id,
      user.companyId as string,
    );
  }
}

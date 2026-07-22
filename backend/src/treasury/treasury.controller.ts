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

import { TreasuryService } from './treasury.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import {
  CurrentUser,
  AuthUser,
} from '../common/decorators/current-user.decorator';
import {
  CreateTreasuryAccountDto,
  CreateTreasuryTransactionDto,
  TransferDto,
  UpdateTreasuryAccountDto,
} from './dto/treasury.dto';

@Controller('treasury')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TreasuryController {
  constructor(private readonly treasuryService: TreasuryService) {}

  @Get('stats')
  stats(@CurrentUser() user: AuthUser) {
    return this.treasuryService.stats(user.companyId as string);
  }

  @Get('accounts')
  findAllAccounts(@CurrentUser() user: AuthUser) {
    return this.treasuryService.findAllAccounts(user.companyId as string);
  }

  @Post('accounts')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT')
  createAccount(
    @Body() body: CreateTreasuryAccountDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.treasuryService.createAccount(user.companyId as string, body);
  }

  @Get('accounts/:id')
  findOneAccount(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.treasuryService.findOneAccount(id, user.companyId as string);
  }

  @Patch('accounts/:id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT')
  updateAccount(
    @Param('id') id: string,
    @Body() body: UpdateTreasuryAccountDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.treasuryService.updateAccount(
      id,
      user.companyId as string,
      body,
    );
  }

  @Get('transactions')
  findTransactions(
    @CurrentUser() user: AuthUser,
    @Query('accountId') accountId?: string,
    @Query('type') type?: string,
  ) {
    return this.treasuryService.findTransactions(user.companyId as string, {
      accountId,
      type,
    });
  }

  @Post('transactions')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT', 'CASHIER')
  createTransaction(
    @Body() body: CreateTreasuryTransactionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.treasuryService.createTransaction(
      user.companyId as string,
      body,
    );
  }

  @Post('transfer')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT')
  transfer(@Body() body: TransferDto, @CurrentUser() user: AuthUser) {
    return this.treasuryService.transfer(user.companyId as string, body);
  }
}

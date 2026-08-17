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

import { LedgerService } from './ledger.service';
import { PostingLine, PostingService } from './posting.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { Permission } from '../common/decorators/permission.decorator';

const READ_ROLES = ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT'] as const;
const WRITE_ROLES = ['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT'] as const;

/**
 * دفتر کل
 *
 * سند دستی فقط با نقش حسابدار صادر می‌شود؛ اسناد خودکار (فروش، خرید، دریافت)
 * از داخل همان تراکنش عملیات صادر می‌شوند و از این مسیر نمی‌گذرند.
 */
@Controller('ledger')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LedgerController {
  constructor(
    private readonly ledger: LedgerService,
    private readonly posting: PostingService,
  ) {}

  // ---------- سال مالی ----------

  @Get('fiscal-years')
  @Roles(...READ_ROLES)
  fiscalYears(@CurrentUser() user: AuthUser) {
    return this.ledger.fiscalYears(user.companyId as string);
  }

  @Post('fiscal-years')
  @Roles(...WRITE_ROLES)
  createFiscalYear(
    @Body() body: { code: string; startsOn: string; endsOn: string; note?: string },
    @CurrentUser() user: AuthUser,
  ) {
    return this.ledger.createFiscalYear(user.companyId as string, body);
  }

  @Patch('fiscal-years/:id/close')
  @Roles('SUPER_ADMIN', 'ADMIN')
  closeFiscalYear(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.ledger.closeFiscalYear(user.companyId as string, id, user.userId);
  }

  // ---------- اسناد ----------

  @Get('entries')
  @Roles(...READ_ROLES)
  entries(
    @CurrentUser() user: AuthUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('sourceType') sourceType?: string,
    @Query('accountCode') accountCode?: string,
    @Query('limit') limit?: string,
  ) {
    return this.ledger.entries(user.companyId as string, {
      from,
      to,
      sourceType,
      accountCode,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('entries/:id')
  @Roles(...READ_ROLES)
  entry(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.ledger.entry(user.companyId as string, id);
  }

  /** سند دستی. */
  @Post('entries')
  @Permission('finance:journal')
  @Roles(...WRITE_ROLES)
  post(
    @Body() body: { description: string; lines: PostingLine[]; entryDate?: string },
    @CurrentUser() user: AuthUser,
  ) {
    return this.posting.post(user.companyId as string, {
      sourceType: 'MANUAL',
      description: body.description,
      lines: body.lines,
      entryDate: body.entryDate ? new Date(body.entryDate) : undefined,
      userId: user.userId,
    });
  }

  /**
   * خنثی کردن سند.  سند قطعی حذف یا ویرایش نمی‌شود؛ سند معکوس صادر می‌شود تا
   * رد حسابرسی دست‌نخورده بماند.
   */
  @Post('entries/:id/reverse')
  @Roles(...WRITE_ROLES)
  reverse(
    @Param('id') id: string,
    @Body() body: { reason?: string },
    @CurrentUser() user: AuthUser,
  ) {
    return this.posting.reverse(user.companyId as string, id, body?.reason);
  }

  // ---------- گزارش‌ها ----------

  @Get('trial-balance')
  @Roles(...READ_ROLES)
  trialBalance(
    @CurrentUser() user: AuthUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.ledger.trialBalance(user.companyId as string, from, to);
  }

  @Get('accounts/:code')
  @Roles(...READ_ROLES)
  accountLedger(
    @Param('code') code: string,
    @CurrentUser() user: AuthUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.ledger.accountLedger(user.companyId as string, code, { from, to });
  }

  @Get('income-statement')
  @Roles(...READ_ROLES)
  incomeStatement(
    @CurrentUser() user: AuthUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.ledger.incomeStatement(user.companyId as string, from, to);
  }

  @Get('balance-sheet')
  @Roles(...READ_ROLES)
  balanceSheet(@CurrentUser() user: AuthUser, @Query('asOf') asOf?: string) {
    return this.ledger.balanceSheet(user.companyId as string, asOf);
  }
}

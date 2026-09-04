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
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { ReconciliationService } from './reconciliation.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';

/**
 * مغایرت‌گیری بانکی.
 *
 * ⚠️ همه‌اش برای ADMIN و ACCOUNTANT است، حتی خواندنش.
 *
 *    صورتحسابِ بانک ریزِ همهٔ پول‌های شرکت را دارد.  «فقط خواندنی است»
 *    دلیلِ باز گذاشتنش نیست.
 */
@ApiTags('مغایرت‌گیری بانکی')
@ApiBearerAuth()
@Controller('bank-reconciliation')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT')
export class ReconciliationController {
  constructor(private readonly recon: ReconciliationService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query('accountId') accountId?: string) {
    return this.recon.list(user.companyId as string, accountId);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: Record<string, never>) {
    return this.recon.create(user.companyId as string, dto);
  }

  @Get(':id')
  summary(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.recon.summary(user.companyId as string, id);
  }

  /** افزودنِ سطرهای صورتحساب — همه در یک تراکنش. */
  @Post(':id/lines')
  addLines(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: { lines?: [] },
  ) {
    return this.recon.addLines(user.companyId as string, id, dto?.lines ?? []);
  }

  /** تطبیقِ خودکار — فقط جایی که یک کاندید هست. */
  @Post(':id/auto-match')
  autoMatch(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.recon.autoMatch(user.companyId as string, id);
  }

  @Patch('lines/:lineId/match')
  match(
    @CurrentUser() user: AuthUser,
    @Param('lineId') lineId: string,
    @Body() dto: { transactionId?: string },
  ) {
    return this.recon.match(user.companyId as string, lineId, dto?.transactionId as string);
  }

  /** ثبتِ سطرِ بانکیِ جامانده در دفتر و تطبیقِ فوری. */
  @Post('lines/:lineId/record')
  recordLine(
    @CurrentUser() user: AuthUser,
    @Param('lineId') lineId: string,
    @Body() dto: Record<string, never>,
  ) {
    return this.recon.recordLine(user.companyId as string, lineId, dto);
  }

  @Patch('lines/:lineId/unmatch')
  unmatch(@CurrentUser() user: AuthUser, @Param('lineId') lineId: string) {
    return this.recon.unmatch(user.companyId as string, lineId);
  }

  /** بستن — فقط وقتی اختلاف صفر است. */
  @Patch(':id/complete')
  complete(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.recon.complete(user.companyId as string, id, user.userId);
  }
}

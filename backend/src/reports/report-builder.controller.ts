import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { ReportBuilderService, ReportSpec } from './report-builder.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';

/**
 * گزارش‌ساز.
 *
 * ⚠️ دسترسی محدود است، حتی با وجودِ فهرستِ سفید.
 *
 *    فهرستِ سفید تزریقِ SQL را می‌بندد، ولی گزارش‌ساز همچنان یعنی
 *    «هر داده‌ای را ببین»: حاشیهٔ سود، خریدِ تأمین‌کنندگان، حقوق.
 *    صندوق‌دار به این نیاز ندارد.
 */
@ApiTags('گزارش‌ساز')
@ApiBearerAuth()
@Controller('report-builder')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT')
export class ReportBuilderController {
  constructor(private readonly builder: ReportBuilderService) {}

  /** مجموعه‌دادها و میدان‌هایشان — رابط از این‌جا فرم می‌سازد. */
  @Get('datasets')
  datasets() {
    return this.builder.datasets();
  }

  @Get('definitions')
  list(@CurrentUser() user: AuthUser) {
    return this.builder.list(user.companyId as string);
  }

  @Post('definitions')
  save(@CurrentUser() user: AuthUser, @Body() dto: Record<string, never>) {
    return this.builder.save(user.companyId as string, dto, user.userId);
  }

  @Post('definitions/:id/run')
  runSaved(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: { limit?: number },
  ) {
    return this.builder.runSaved(user.companyId as string, id, dto?.limit);
  }

  @Delete('definitions/:id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.builder.remove(user.companyId as string, id);
  }

  /** اجرای مشخصاتِ موقت، بدونِ ذخیره. */
  @Post('run')
  run(
    @CurrentUser() user: AuthUser,
    @Body() dto: { dataset?: string; spec?: ReportSpec },
  ) {
    return this.builder.run(
      user.companyId as string,
      String(dto?.dataset ?? ''),
      dto?.spec ?? {},
    );
  }
}

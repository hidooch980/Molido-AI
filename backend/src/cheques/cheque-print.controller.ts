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

import { ChequePrintService } from './cheque-print.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';

/**
 * چاپ چک.
 *
 * ⚠️ سرویس **تصویر نمی‌سازد**؛ داده و مختصات می‌دهد و رابط می‌چیند.
 *    ساختنِ PDF در بک‌اند یعنی هر تنظیمِ چند میلی‌متری یک استقرار
 *    می‌خواهد — و تنظیمِ چیدمانِ چک همیشه چند بار طول می‌کشد.
 */
@ApiTags('چاپ چک')
@ApiBearerAuth()
@Controller('cheque-print')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT')
export class ChequePrintController {
  constructor(private readonly print: ChequePrintService) {}

  @Get('templates')
  list(@CurrentUser() user: AuthUser) {
    return this.print.list(user.companyId as string);
  }

  @Post('templates')
  create(@CurrentUser() user: AuthUser, @Body() dto: Record<string, never>) {
    return this.print.create(user.companyId as string, dto);
  }

  @Patch('templates/:id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: Record<string, never>,
  ) {
    return this.print.update(user.companyId as string, id, dto);
  }

  /** دادهٔ چاپِ یک چک، با مختصاتِ هر میدان. */
  @Get(':chequeId')
  payload(
    @CurrentUser() user: AuthUser,
    @Param('chequeId') chequeId: string,
    @Query('templateId') templateId?: string,
  ) {
    return this.print.payload(user.companyId as string, chequeId, templateId);
  }
}

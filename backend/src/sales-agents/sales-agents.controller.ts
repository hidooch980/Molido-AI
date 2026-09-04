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

import { SalesAgentsService } from './sales-agents.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import {
  AuthUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator';

@ApiTags('ویزیتور و کمیسیون')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('sales-agents')
export class SalesAgentsController {
  constructor(private readonly service: SalesAgentsService) {}

  @Get('stats')
  stats(@CurrentUser() user: AuthUser) {
    return this.service.stats(user.companyId!);
  }

  @Get('commissions')
  commissions(@CurrentUser() user: AuthUser, @Query('period') period?: string) {
    return this.service.commissions(user.companyId!, period);
  }

  @Get()
  findAll(@CurrentUser() user: AuthUser) {
    return this.service.findAll(user.companyId!);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.findOne(user.companyId!, id);
  }

  @Post()
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER')
  create(@CurrentUser() user: AuthUser, @Body() dto: any) {
    return this.service.create(user.companyId!, dto);
  }

  @Patch(':id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: any,
  ) {
    return this.service.update(user.companyId!, id, dto);
  }

  /** محاسبهٔ کمیسیون یک دوره؛ تکرار برای همان دوره بی‌خطر است. */
  @Post('commissions/calculate')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT')
  calculate(@CurrentUser() user: AuthUser, @Body() dto: { period?: string }) {
    return this.service.calculate(user.companyId!, user.userId, dto?.period);
  }

  @Patch('commissions/:id/pay')
  @Roles('SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT')
  markPaid(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.markPaid(user.companyId!, id);
  }
}

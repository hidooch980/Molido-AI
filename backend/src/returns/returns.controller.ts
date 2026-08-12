import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import {
  AuthUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator';
import { ReturnsService } from './returns.service';

@ApiTags('مرجوعی')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('returns')
export class ReturnsController {
  constructor(private readonly service: ReturnsService) {}

  @Get('stats')
  stats(@CurrentUser() user: AuthUser) {
    return this.service.stats(user.companyId!);
  }

  @Get()
  findAll(@CurrentUser() user: AuthUser) {
    return this.service.findAll(user.companyId!);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.findOne(user.companyId!, id);
  }

  @Post('sale')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'CASHIER')
  saleReturn(@CurrentUser() user: AuthUser, @Body() dto: any) {
    return this.service.createSaleReturn(user.companyId!, user.userId, dto);
  }

  @Post('purchase')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER')
  purchaseReturn(@CurrentUser() user: AuthUser, @Body() dto: any) {
    return this.service.createPurchaseReturn(user.companyId!, user.userId, dto);
  }
}

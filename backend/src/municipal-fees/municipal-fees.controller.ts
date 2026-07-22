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

import { MunicipalFeesService } from './municipal-fees.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';

@Controller('municipal-fees')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MunicipalFeesController {
  constructor(private readonly municipalFeesService: MunicipalFeesService) {}

  @Get('stats')
  stats(@CurrentUser() user: AuthUser) {
    return this.municipalFeesService.stats(user.companyId as string);
  }

  @Get()
  findAll(
    @CurrentUser() user: AuthUser,
    @Query('status') status?: string,
    @Query('type') type?: string,
    @Query('search') search?: string,
  ) {
    return this.municipalFeesService.findAll(user.companyId as string, {
      status,
      type,
      search,
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.municipalFeesService.findOne(id, user.companyId as string);
  }

  @Post()
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT', 'EMPLOYEE')
  create(
    @Body()
    body: {
      type?: string;
      payerName: string;
      payerPhone?: string;
      address?: string;
      amount: number;
      description?: string;
      permitId?: string;
    },
    @CurrentUser() user: AuthUser,
  ) {
    return this.municipalFeesService.create(user.companyId as string, body);
  }

  @Post('from-violation/:violationId')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT')
  createFromViolation(
    @Param('violationId') violationId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.municipalFeesService.createFromViolation(
      violationId,
      user.companyId as string,
    );
  }

  @Patch(':id/pay')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT', 'CASHIER')
  pay(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.municipalFeesService.pay(id, user.companyId as string);
  }

  @Patch(':id/cancel')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER')
  cancel(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.municipalFeesService.cancel(id, user.companyId as string);
  }
}

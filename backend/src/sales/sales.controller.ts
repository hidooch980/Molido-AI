import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { SalesService } from './sales.service';
import { CreateSaleDto } from './dto/create-sale.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';

@Controller('sales')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Get()
  findAll(
    @CurrentUser() user: AuthUser,
    @Query('status') status?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.salesService.findAll(user.companyId as string, {
      status,
      from,
      to,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get(':id/print')
  @Header('Content-Type', 'text/html; charset=utf-8')
  print(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.salesService.printInvoice(id, user.companyId as string);
  }

  @Get(':id/installments')
  listInstallments(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.salesService.listInstallments(id, user.companyId as string);
  }

  @Post(':id/installments')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT')
  createInstallments(
    @Param('id') id: string,
    @Body()
    body: { count: number; intervalDays?: number; startDate?: string },
    @CurrentUser() user: AuthUser,
  ) {
    return this.salesService.createInstallments(
      id,
      user.companyId as string,
      body,
    );
  }

  @Patch('installments/:installmentId/pay')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT', 'CASHIER')
  payInstallment(
    @Param('installmentId') installmentId: string,
    @Body() body: { cashBoxId?: string },
    @CurrentUser() user: AuthUser,
  ) {
    return this.salesService.payInstallment(
      installmentId,
      user.companyId as string,
      body?.cashBoxId,
    );
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.salesService.findOne(id, user.companyId as string);
  }

  @Post()
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'SALES', 'CASHIER')
  create(@Body() dto: CreateSaleDto, @CurrentUser() user: AuthUser) {
    return this.salesService.create(
      dto,
      user.companyId as string,
      user.userId,
    );
  }

  @Patch(':id/cancel')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER')
  cancel(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.salesService.cancel(id, user.companyId as string);
  }
}

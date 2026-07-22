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

import { ContractsService } from './contracts.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import {
  CurrentUser,
  AuthUser,
} from '../common/decorators/current-user.decorator';
import {
  AddContractPaymentDto,
  CreateContractDto,
  UpdateContractDto,
  UpdateContractStatusDto,
} from './dto/contract.dto';

@Controller('contracts')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ContractsController {
  constructor(private readonly contractsService: ContractsService) {}

  @Get('stats')
  stats(@CurrentUser() user: AuthUser) {
    return this.contractsService.stats(user.companyId as string);
  }

  @Get()
  findAll(
    @CurrentUser() user: AuthUser,
    @Query('status') status?: string,
    @Query('type') type?: string,
    @Query('search') search?: string,
    @Query('expiringSoon') expiringSoon?: string,
  ) {
    return this.contractsService.findAll(user.companyId as string, {
      status,
      type,
      search,
      expiringSoon: expiringSoon === 'true',
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.contractsService.findOne(id, user.companyId as string);
  }

  @Post()
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT')
  create(@Body() body: CreateContractDto, @CurrentUser() user: AuthUser) {
    return this.contractsService.create(user.companyId as string, body);
  }

  @Patch(':id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT')
  update(
    @Param('id') id: string,
    @Body() body: UpdateContractDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.contractsService.update(id, user.companyId as string, body);
  }

  @Patch(':id/status')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER')
  updateStatus(
    @Param('id') id: string,
    @Body() body: UpdateContractStatusDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.contractsService.updateStatus(
      id,
      user.companyId as string,
      body.status,
    );
  }

  @Post(':id/payments')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT')
  addPayment(
    @Param('id') id: string,
    @Body() body: AddContractPaymentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.contractsService.addPayment(
      id,
      user.companyId as string,
      body,
    );
  }

  @Patch('payments/:paymentId/pay')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT', 'CASHIER')
  payPayment(
    @Param('paymentId') paymentId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.contractsService.payPayment(
      paymentId,
      user.companyId as string,
    );
  }
}

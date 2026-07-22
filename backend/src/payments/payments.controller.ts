import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { PaymentsService } from './payments.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';

@Controller('payments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get()
  findAll(@CurrentUser() user: AuthUser, @Query('saleId') saleId?: string) {
    return this.paymentsService.findAll(user.companyId as string, saleId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.paymentsService.findOne(id, user.companyId as string);
  }

  @Post()
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'CASHIER', 'ACCOUNTANT')
  create(
    @Body()
    body: {
      saleId: string;
      amount: number;
      method?: string;
      cashBoxId?: string;
      referenceNo?: string;
      note?: string;
    },
    @CurrentUser() user: AuthUser,
  ) {
    return this.paymentsService.create(user.companyId as string, body);
  }
}

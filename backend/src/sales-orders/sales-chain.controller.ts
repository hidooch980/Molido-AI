import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import {
  AuthUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator';
import { SalesChainService } from './sales-chain.service';

@ApiTags('زنجیرهٔ فروش')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('sales-chain')
export class SalesChainController {
  constructor(private readonly service: SalesChainService) {}

  @Get('stats')
  stats(@CurrentUser() user: AuthUser) {
    return this.service.stats(user.companyId!);
  }

  @Post('quotations')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'CASHIER')
  createQuotation(@CurrentUser() user: AuthUser, @Body() dto: any) {
    return this.service.createQuotation(user.companyId!, dto);
  }

  @Post('quotations/:id/convert')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER')
  convert(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: { warehouseId?: string },
  ) {
    return this.service.convertQuotationToOrder(
      user.companyId!,
      id,
      dto?.warehouseId,
    );
  }

  @Get('orders/:id')
  orderDetail(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.orderDetail(user.companyId!, id);
  }

  @Post('shipments')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'CASHIER')
  ship(@CurrentUser() user: AuthUser, @Body() dto: any) {
    return this.service.createShipment(user.companyId!, dto);
  }

  @Post('shipments/:id/deliver')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'CASHIER')
  deliver(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.markDelivered(user.companyId!, id);
  }

  @Post('orders/:id/invoice')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER')
  invoice(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.invoiceOrder(user.companyId!, user.userId, id);
  }
}

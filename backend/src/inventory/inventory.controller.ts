import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { InventoryService } from './inventory.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';

@Controller('inventory')
@UseGuards(JwtAuthGuard, RolesGuard)
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get()
  findAll(
    @CurrentUser() user: AuthUser,
    @Query('warehouseId') warehouseId?: string,
  ) {
    return this.inventoryService.findAll(
      user.companyId as string,
      warehouseId,
    );
  }

  @Get('low-stock')
  lowStock(@CurrentUser() user: AuthUser) {
    return this.inventoryService.lowStock(user.companyId as string);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.inventoryService.findOne(id, user.companyId as string);
  }

  @Post('adjust')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'INVENTORY')
  adjust(
    @Body()
    body: { productId: string; warehouseId: string; quantityChange: number },
    @CurrentUser() user: AuthUser,
  ) {
    return this.inventoryService.adjust(user.companyId as string, body);
  }

  @Post('transfer')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'INVENTORY')
  transfer(
    @Body()
    body: {
      productId: string;
      fromWarehouseId: string;
      toWarehouseId: string;
      quantity: number;
    },
    @CurrentUser() user: AuthUser,
  ) {
    return this.inventoryService.transfer(user.companyId as string, body);
  }
}

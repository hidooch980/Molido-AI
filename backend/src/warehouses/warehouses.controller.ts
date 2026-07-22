import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';

import { WarehousesService } from './warehouses.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';

@Controller('warehouses')
@UseGuards(JwtAuthGuard, RolesGuard)
export class WarehousesController {
  constructor(private readonly warehousesService: WarehousesService) {}

  @Get()
  findAll(@CurrentUser() user: AuthUser) {
    return this.warehousesService.findAll(user.companyId as string);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.warehousesService.findOne(id, user.companyId as string);
  }

  @Post()
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'INVENTORY')
  create(
    @Body() body: { name: string; code: string; description?: string },
    @CurrentUser() user: AuthUser,
  ) {
    return this.warehousesService.create(user.companyId as string, body);
  }

  @Patch(':id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'INVENTORY')
  update(
    @Param('id') id: string,
    @Body() body: { name?: string; code?: string; description?: string },
    @CurrentUser() user: AuthUser,
  ) {
    return this.warehousesService.update(id, user.companyId as string, body);
  }

  @Delete(':id')
  @Roles('SUPER_ADMIN', 'ADMIN')
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.warehousesService.remove(id, user.companyId as string);
  }
}

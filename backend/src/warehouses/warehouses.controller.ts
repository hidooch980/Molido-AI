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
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { WarehousesService } from './warehouses.service';
import { CreateWarehouseDto, UpdateWarehouseDto } from './dto/warehouse.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';

@ApiTags('انبار')
@ApiBearerAuth()
@Controller('warehouses')
@UseGuards(JwtAuthGuard, RolesGuard)
export class WarehousesController {
  constructor(private readonly warehousesService: WarehousesService) {}

  /** فهرست به همراه تعداد کالا و ارزش موجودی هر انبار. */
  @Get()
  findAll(@CurrentUser() user: AuthUser) {
    return this.warehousesService.listWithStock(user.companyId as string);
  }

  @Get(':id/contents')
  contents(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.warehousesService.contents(user.companyId as string, id);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.warehousesService.findOne(user.companyId as string, id);
  }

  @Post()
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'INVENTORY')
  create(
    @Body() body: CreateWarehouseDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.warehousesService.create(user.companyId as string, { ...body });
  }

  @Patch(':id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'INVENTORY')
  update(
    @Param('id') id: string,
    @Body() body: UpdateWarehouseDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.warehousesService.update(user.companyId as string, id, { ...body });
  }

  @Delete(':id')
  @Roles('SUPER_ADMIN', 'ADMIN')
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.warehousesService.remove(user.companyId as string, id);
  }
}

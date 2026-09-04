import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { SerialNumbersService } from './serial-numbers.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';

@ApiTags('شمارهٔ سریال')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('serial-numbers')
export class SerialNumbersController {
  constructor(private readonly service: SerialNumbersService) {}

  @Get('stats')
  stats(@CurrentUser() user: AuthUser) {
    return this.service.stats(user.companyId!);
  }

  /** جست‌وجوی گارانتی با خود شمارهٔ سریال، نه شناسهٔ داخلی. */
  @Get('lookup/:serial')
  lookup(@CurrentUser() user: AuthUser, @Param('serial') serial: string) {
    return this.service.lookup(user.companyId!, serial);
  }

  @Get()
  findAll(
    @CurrentUser() user: AuthUser,
    @Query() query: { productId?: string; status?: string; search?: string },
  ) {
    return this.service.findAll(user.companyId!, query);
  }

  /** ثبت دسته‌ای — انباردار ده‌ها سریال را پشت سر هم اسکن می‌کند. */
  @Post('batch')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'INVENTORY')
  addBatch(
    @CurrentUser() user: AuthUser,
    @Body()
    dto: { productId: string; serials: string[]; warrantyUntil?: string; note?: string },
  ) {
    return this.service.addBatch(user.companyId!, dto);
  }

  @Post()
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'INVENTORY')
  create(@CurrentUser() user: AuthUser, @Body() dto: Record<string, unknown>) {
    return this.service.create(user.companyId!, dto);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.findOne(user.companyId!, id);
  }

  @Patch(':id/status')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'INVENTORY')
  setStatus(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: { status: string; saleId?: string },
  ) {
    return this.service.setStatus(user.companyId!, id, dto.status, dto.saleId);
  }

  @Patch(':id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: Record<string, unknown>,
  ) {
    return this.service.update(user.companyId!, id, dto);
  }

  @Delete(':id')
  @Roles('SUPER_ADMIN', 'ADMIN')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.remove(user.companyId!, id);
  }
}

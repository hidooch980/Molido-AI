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
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import {
  AuthUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator';
import { StockCountService } from './stock-count.service';

@ApiTags('انبارگردانی و کاردکس')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('stock-count')
export class StockCountController {
  constructor(private readonly service: StockCountService) {}

  @Get('kardex/:productId')
  kardex(
    @CurrentUser() user: AuthUser,
    @Param('productId') productId: string,
    @Query('warehouseId') warehouseId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.kardex(
      user.companyId!,
      productId,
      warehouseId,
      Number(limit) || 100,
    );
  }

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.service.list(user.companyId!);
  }

  @Post()
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'INVENTORY')
  open(@CurrentUser() user: AuthUser, @Body() dto: any) {
    return this.service.open(user.companyId!, user.userId, dto);
  }

  @Get(':id')
  detail(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.detail(user.companyId!, id);
  }

  @Patch(':id/lines/:lineId')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'INVENTORY')
  setCounted(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('lineId') lineId: string,
    @Body() dto: { countedQty: number },
  ) {
    return this.service.setCounted(
      user.companyId!,
      id,
      lineId,
      Number(dto?.countedQty),
    );
  }

  @Post(':id/apply')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER')
  apply(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.apply(user.companyId!, user.userId, id);
  }

  @Post(':id/cancel')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER')
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.cancel(user.companyId!, id);
  }
}

import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { ConsignmentService } from './consignment.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';

@ApiTags('کالای امانی')
@ApiBearerAuth()
@Controller('consignments')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT')
export class ConsignmentController {
  constructor(private readonly consignment: ConsignmentService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query('direction') direction?: string,
    @Query('status') status?: string,
  ) {
    return this.consignment.list(user.companyId as string, direction, status);
  }

  /**
   * گزارشِ باز.
   *
   * ⚠️ پیش از `:id` تعریف شده — وگرنه Nest «report» را شناسه می‌گیرد.
   */
  @Get('report/open')
  openReport(@CurrentUser() user: AuthUser) {
    return this.consignment.openReport(user.companyId as string);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.consignment.findOne(user.companyId as string, id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: Record<string, never>) {
    return this.consignment.create(user.companyId as string, dto, user.userId);
  }

  /** تسویه — امانت‌گیر فروخته؛ اینجا درآمد محقق می‌شود. */
  @Post('items/:itemId/settle')
  settle(
    @CurrentUser() user: AuthUser,
    @Param('itemId') itemId: string,
    @Body() dto: { quantity?: number },
  ) {
    return this.consignment.settle(
      user.companyId as string,
      itemId,
      dto?.quantity,
      user.userId,
    );
  }

  /** برگشت — کالای نفروخته برمی‌گردد. */
  @Post('items/:itemId/return')
  returnItem(
    @CurrentUser() user: AuthUser,
    @Param('itemId') itemId: string,
    @Body() dto: { quantity?: number },
  ) {
    return this.consignment.returnItem(
      user.companyId as string,
      itemId,
      dto?.quantity,
      user.userId,
    );
  }
}

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

import { RemindersService } from './reminders.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';

/**
 * یادآوری‌ها.
 *
 * ⚠️ نقشِ خاصی لازم ندارد، عمداً.
 *
 *    یادآوری یادداشتِ کاری است، نه داده‌ی مالی.  صندوق‌داری که باید
 *    یادش باشد فردا شیر سفارش دهد، هم باید بتواند بنویسدش و هم
 *    ببنددش.  محدود کردنش به مدیر یعنی کسی استفاده‌اش نمی‌کند.
 */
@ApiTags('یادآوری‌ها')
@ApiBearerAuth()
@Controller('reminders')
@UseGuards(JwtAuthGuard)
export class RemindersController {
  constructor(private readonly reminders: RemindersService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query('status') status?: string,
    @Query('assignedTo') assignedTo?: string,
    @Query('due') due?: string,
  ) {
    return this.reminders.list(user.companyId as string, { status, assignedTo, due });
  }

  /** سررسیدشده‌ها — همان‌هایی که در فیدِ هشدار هم می‌آیند. */
  @Get('due')
  due(@CurrentUser() user: AuthUser) {
    return this.reminders.due(user.companyId as string);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: Record<string, never>) {
    return this.reminders.create(user.companyId as string, dto, user.userId);
  }

  @Patch(':id/complete')
  complete(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.reminders.complete(user.companyId as string, id);
  }

  @Patch(':id/cancel')
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.reminders.cancel(user.companyId as string, id);
  }

  /** به تعویق انداختن — سررسید جلو می‌رود، یادآوری گم نمی‌شود. */
  @Patch(':id/snooze')
  snooze(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: { dueAt?: string },
  ) {
    return this.reminders.snooze(user.companyId as string, id, dto?.dueAt);
  }
}

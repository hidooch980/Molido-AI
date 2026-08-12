import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { AssetsService } from './assets.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import {
  AuthUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator';

@ApiTags('دارایی ثابت')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('assets')
export class AssetsController {
  constructor(private readonly service: AssetsService) {}

  @Get('stats')
  stats(@CurrentUser() user: AuthUser) {
    return this.service.stats(user.companyId!);
  }

  @Get()
  findAll(@CurrentUser() user: AuthUser) {
    return this.service.findAll(user.companyId!);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.findOne(user.companyId!, id);
  }

  @Post()
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT')
  create(@CurrentUser() user: AuthUser, @Body() dto: any) {
    return this.service.create(user.companyId!, dto);
  }

  @Patch(':id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: any,
  ) {
    return this.service.update(user.companyId!, id, dto);
  }

  /**
   * اجرای استهلاک یک دوره.  تکرار برای همان ماه بی‌اثر است، پس عملیات
   * پایان ماه را می‌شود بی‌خطر دوباره اجرا کرد.
   */
  @Post('depreciation/run')
  @Roles('SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT')
  runDepreciation(
    @CurrentUser() user: AuthUser,
    @Body() dto: { period?: string },
  ) {
    return this.service.runDepreciation(
      user.companyId!,
      user.userId,
      dto?.period,
    );
  }

  @Post(':id/dispose')
  @Roles('SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT')
  dispose(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: { proceeds?: number; note?: string },
  ) {
    return this.service.dispose(user.companyId!, user.userId, id, dto ?? {});
  }
}

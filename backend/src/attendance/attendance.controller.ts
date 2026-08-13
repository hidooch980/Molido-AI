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

import { AttendanceService } from './attendance.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import {
  AuthUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator';

const HR = ['SUPER_ADMIN', 'ADMIN', 'MANAGER'] as const;

@ApiTags('حضور و غیاب')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('attendance')
export class AttendanceController {
  constructor(private readonly service: AttendanceService) {}

  @Get('stats')
  stats(@CurrentUser() user: AuthUser) {
    return this.service.stats(user.companyId!);
  }

  @Get()
  findAll(
    @CurrentUser() user: AuthUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.findAll(user.companyId!, from, to);
  }

  @Get('summary')
  summary(@CurrentUser() user: AuthUser, @Query('period') period?: string) {
    return this.service.monthlySummary(
      user.companyId!,
      period ?? new Date().toISOString().slice(0, 10),
    );
  }

  @Post()
  @Roles(...HR)
  record(@CurrentUser() user: AuthUser, @Body() dto: any) {
    return this.service.record(user.companyId!, dto);
  }

  // ---------- مرخصی ----------

  @Get('leaves')
  leaves(@CurrentUser() user: AuthUser, @Query('status') status?: string) {
    return this.service.leaves(user.companyId!, status);
  }

  @Post('leaves')
  requestLeave(@CurrentUser() user: AuthUser, @Body() dto: any) {
    return this.service.requestLeave(user.companyId!, dto);
  }

  @Patch('leaves/:id/decide')
  @Roles(...HR)
  decideLeave(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: { approve: boolean; note?: string },
  ) {
    return this.service.decideLeave(user.companyId!, user.userId, id, dto);
  }

  // ---------- مانده مرخصی ----------

  @Get('balances')
  balances(@CurrentUser() user: AuthUser, @Query('year') year?: string) {
    return this.service.balances(
      user.companyId!,
      year ? Number(year) : undefined,
    );
  }

  @Post('balances')
  @Roles(...HR)
  setEntitlement(@CurrentUser() user: AuthUser, @Body() dto: any) {
    return this.service.setEntitlement(user.companyId!, dto);
  }
}

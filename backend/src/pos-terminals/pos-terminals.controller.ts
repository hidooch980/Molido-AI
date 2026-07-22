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

import { PosTerminalsService } from './pos-terminals.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { CreatePosTerminalDto } from './dto/create-pos-terminal.dto';
import {
  UpdatePosStatusDto,
  UpdatePosTerminalDto,
} from './dto/update-pos-terminal.dto';

@Controller('pos-terminals')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PosTerminalsController {
  constructor(private readonly posTerminalsService: PosTerminalsService) {}

  /**
   * فهرست بانک‌ها و شرکت‌های پرداخت برای فرم ثبت
   */
  @Get('banks')
  banks() {
    return this.posTerminalsService.banks();
  }

  @Get('stats')
  stats(@CurrentUser() user: AuthUser) {
    return this.posTerminalsService.stats(user.companyId as string);
  }

  @Get()
  findAll(
    @CurrentUser() user: AuthUser,
    @Query('type') type?: string,
    @Query('status') status?: string,
    @Query('bankName') bankName?: string,
    @Query('search') search?: string,
  ) {
    return this.posTerminalsService.findAll(user.companyId as string, {
      type,
      status,
      bankName,
      search,
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.posTerminalsService.findOne(id, user.companyId as string);
  }

  @Post()
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT')
  create(
    @Body() body: CreatePosTerminalDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.posTerminalsService.create(user.companyId as string, body);
  }

  @Patch(':id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT')
  update(
    @Param('id') id: string,
    @Body() body: UpdatePosTerminalDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.posTerminalsService.update(
      id,
      user.companyId as string,
      body,
    );
  }

  @Patch(':id/status')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT')
  updateStatus(
    @Param('id') id: string,
    @Body() body: UpdatePosStatusDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.posTerminalsService.updateStatus(
      id,
      user.companyId as string,
      body.status,
    );
  }

  @Delete(':id')
  @Roles('SUPER_ADMIN', 'ADMIN')
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.posTerminalsService.remove(id, user.companyId as string);
  }
}

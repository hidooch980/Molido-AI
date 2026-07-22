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

import { ChequesService } from './cheques.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import {
  CreateChequeDto,
  UpdateChequeStatusDto,
} from './dto/create-cheque.dto';

@Controller('cheques')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ChequesController {
  constructor(private readonly chequesService: ChequesService) {}

  @Get('stats')
  stats(@CurrentUser() user: AuthUser) {
    return this.chequesService.stats(user.companyId as string);
  }

  @Get()
  findAll(
    @CurrentUser() user: AuthUser,
    @Query('status') status?: string,
    @Query('type') type?: string,
    @Query('dueSoon') dueSoon?: string,
  ) {
    return this.chequesService.findAll(user.companyId as string, {
      status,
      type,
      dueSoon: dueSoon === 'true',
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.chequesService.findOne(id, user.companyId as string);
  }

  @Post()
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT', 'CASHIER')
  create(
    @Body() body: CreateChequeDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.chequesService.create(user.companyId as string, body);
  }

  @Patch(':id/status')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT')
  updateStatus(
    @Param('id') id: string,
    @Body() body: UpdateChequeStatusDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.chequesService.updateStatus(
      id,
      user.companyId as string,
      body.status,
    );
  }

  @Delete(':id')
  @Roles('SUPER_ADMIN', 'ADMIN')
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.chequesService.remove(id, user.companyId as string);
  }
}

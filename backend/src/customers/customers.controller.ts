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

import { CustomersService } from './customers.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';

@Controller('customers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  findAll(
    @CurrentUser() user: AuthUser,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.customersService.findAll(user.companyId as string, { search, page, limit });
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.customersService.findOne(user.companyId as string, id);
  }

  /** مانده بدهی — پیش از فروش نسیه لازم است، نه بعدش. */
  @Get(':id/balance')
  balance(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.customersService.balance(user.companyId as string, id);
  }

  @Post()
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'SALES', 'CASHIER')
  create(
    @Body()
    body: {
      firstName: string;
      lastName?: string;
      phone?: string;
      email?: string;
      nationalCode?: string;
      address?: string;
      creditLimit?: number;
    },
    @CurrentUser() user: AuthUser,
  ) {
    return this.customersService.create(user.companyId as string, body);
  }

  @Patch(':id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'SALES')
  update(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: AuthUser,
  ) {
    return this.customersService.update(user.companyId as string, id, body);
  }

  @Delete(':id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER')
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.customersService.remove(user.companyId as string, id);
  }
}

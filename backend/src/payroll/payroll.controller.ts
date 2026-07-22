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

import { PayrollService } from './payroll.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import {
  CurrentUser,
  AuthUser,
} from '../common/decorators/current-user.decorator';
import {
  CreateEmployeeDto,
  CreatePayrollSlipDto,
  UpdateEmployeeDto,
} from './dto/payroll.dto';

@Controller('payroll')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PayrollController {
  constructor(private readonly payrollService: PayrollService) {}

  @Get('stats')
  stats(@CurrentUser() user: AuthUser) {
    return this.payrollService.stats(user.companyId as string);
  }

  // ---------- کارمندان ----------

  @Get('employees')
  findAllEmployees(
    @CurrentUser() user: AuthUser,
    @Query('search') search?: string,
    @Query('onlyActive') onlyActive?: string,
  ) {
    return this.payrollService.findAllEmployees(user.companyId as string, {
      search,
      onlyActive: onlyActive === 'true',
    });
  }

  @Post('employees')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT')
  createEmployee(
    @Body() body: CreateEmployeeDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.payrollService.createEmployee(user.companyId as string, body);
  }

  @Get('employees/:id')
  findOneEmployee(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.payrollService.findOneEmployee(id, user.companyId as string);
  }

  @Patch('employees/:id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT')
  updateEmployee(
    @Param('id') id: string,
    @Body() body: UpdateEmployeeDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.payrollService.updateEmployee(
      id,
      user.companyId as string,
      body,
    );
  }

  // ---------- فیش‌های حقوقی ----------

  @Get('slips')
  findSlips(
    @CurrentUser() user: AuthUser,
    @Query('period') period?: string,
    @Query('employeeId') employeeId?: string,
    @Query('status') status?: string,
  ) {
    return this.payrollService.findSlips(user.companyId as string, {
      period,
      employeeId,
      status,
    });
  }

  @Post('slips')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT')
  createSlip(
    @Body() body: CreatePayrollSlipDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.payrollService.createSlip(user.companyId as string, body);
  }

  @Patch('slips/:id/approve')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER')
  approveSlip(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.payrollService.approveSlip(id, user.companyId as string);
  }

  @Patch('slips/:id/pay')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT', 'CASHIER')
  paySlip(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.payrollService.paySlip(id, user.companyId as string);
  }
}

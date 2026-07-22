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

import { TechnicalOfficeService } from './technical-office.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';

@Controller('technical-office')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TechnicalOfficeController {
  constructor(
    private readonly technicalOfficeService: TechnicalOfficeService,
  ) {}

  // ----- آمار -----

  @Get('stats')
  stats(@CurrentUser() user: AuthUser) {
    return this.technicalOfficeService.stats(user.companyId as string);
  }

  // ----- پروانه‌های ساختمانی -----

  @Get('permits')
  findAllPermits(
    @CurrentUser() user: AuthUser,
    @Query('status') status?: string,
    @Query('type') type?: string,
    @Query('search') search?: string,
  ) {
    return this.technicalOfficeService.findAllPermits(
      user.companyId as string,
      { status, type, search },
    );
  }

  @Get('permits/:id')
  findPermit(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.technicalOfficeService.findPermit(
      id,
      user.companyId as string,
    );
  }

  @Post('permits')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'EMPLOYEE')
  createPermit(
    @Body()
    body: {
      type?: string;
      ownerName: string;
      ownerPhone?: string;
      nationalCode?: string;
      address: string;
      plateNumber?: string;
      area?: number;
      floors?: number;
      description?: string;
    },
    @CurrentUser() user: AuthUser,
  ) {
    return this.technicalOfficeService.createPermit(
      user.companyId as string,
      body,
    );
  }

  @Patch('permits/:id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER')
  updatePermit(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: AuthUser,
  ) {
    return this.technicalOfficeService.updatePermit(
      id,
      user.companyId as string,
      body,
    );
  }

  @Patch('permits/:id/approve')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER')
  approvePermit(
    @Param('id') id: string,
    @Body() body: { validYears?: number },
    @CurrentUser() user: AuthUser,
  ) {
    return this.technicalOfficeService.approvePermit(
      id,
      user.companyId as string,
      body?.validYears ?? 2,
    );
  }

  @Patch('permits/:id/reject')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER')
  rejectPermit(
    @Param('id') id: string,
    @Body() body: { reason: string },
    @CurrentUser() user: AuthUser,
  ) {
    return this.technicalOfficeService.rejectPermit(
      id,
      user.companyId as string,
      body.reason,
    );
  }

  @Post('permits/:id/inspections')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'EMPLOYEE')
  addInspection(
    @Param('id') id: string,
    @Body() body: { inspectorName: string; result: string; notes?: string },
    @CurrentUser() user: AuthUser,
  ) {
    return this.technicalOfficeService.addInspection(
      id,
      user.companyId as string,
      body,
    );
  }

  // ----- تخلفات ساختمانی -----

  @Get('violations')
  findAllViolations(
    @CurrentUser() user: AuthUser,
    @Query('status') status?: string,
  ) {
    return this.technicalOfficeService.findAllViolations(
      user.companyId as string,
      status,
    );
  }

  @Get('violations/:id')
  findViolation(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.technicalOfficeService.findViolation(
      id,
      user.companyId as string,
    );
  }

  @Post('violations')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'EMPLOYEE')
  createViolation(
    @Body()
    body: { ownerName: string; address: string; description: string },
    @CurrentUser() user: AuthUser,
  ) {
    return this.technicalOfficeService.createViolation(
      user.companyId as string,
      body,
    );
  }

  @Patch('violations/:id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER')
  updateViolation(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: AuthUser,
  ) {
    return this.technicalOfficeService.updateViolation(
      id,
      user.companyId as string,
      body,
    );
  }

  @Patch('violations/:id/fine')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER')
  fineViolation(
    @Param('id') id: string,
    @Body() body: { fineAmount: number },
    @CurrentUser() user: AuthUser,
  ) {
    return this.technicalOfficeService.fineViolation(
      id,
      user.companyId as string,
      body.fineAmount,
    );
  }
}

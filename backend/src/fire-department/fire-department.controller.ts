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

import { FireDepartmentService } from './fire-department.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';

@Controller('fire-department')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FireDepartmentController {
  constructor(
    private readonly fireDepartmentService: FireDepartmentService,
  ) {}

  // ----- آمار -----

  @Get('stats')
  stats(@CurrentUser() user: AuthUser) {
    return this.fireDepartmentService.stats(user.companyId as string);
  }

  // ----- ایستگاه‌ها -----

  @Get('stations')
  findAllStations(@CurrentUser() user: AuthUser) {
    return this.fireDepartmentService.findAllStations(
      user.companyId as string,
    );
  }

  @Get('stations/:id')
  findStation(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.fireDepartmentService.findStation(
      id,
      user.companyId as string,
    );
  }

  @Post('stations')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER')
  createStation(
    @Body()
    body: { name: string; code: string; address?: string; phone?: string },
    @CurrentUser() user: AuthUser,
  ) {
    return this.fireDepartmentService.createStation(
      user.companyId as string,
      body,
    );
  }

  @Patch('stations/:id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER')
  updateStation(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: AuthUser,
  ) {
    return this.fireDepartmentService.updateStation(
      id,
      user.companyId as string,
      body,
    );
  }

  @Delete('stations/:id')
  @Roles('SUPER_ADMIN', 'ADMIN')
  removeStation(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.fireDepartmentService.removeStation(
      id,
      user.companyId as string,
    );
  }

  // ----- پرسنل -----

  @Get('firefighters')
  findFirefighters(
    @CurrentUser() user: AuthUser,
    @Query('stationId') stationId?: string,
  ) {
    return this.fireDepartmentService.findFirefighters(
      user.companyId as string,
      stationId,
    );
  }

  @Post('firefighters')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER')
  createFirefighter(
    @Body()
    body: {
      stationId: string;
      firstName: string;
      lastName: string;
      rank?: string;
      phone?: string;
      nationalCode?: string;
    },
    @CurrentUser() user: AuthUser,
  ) {
    return this.fireDepartmentService.createFirefighter(
      user.companyId as string,
      body,
    );
  }

  @Patch('firefighters/:id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER')
  updateFirefighter(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: AuthUser,
  ) {
    return this.fireDepartmentService.updateFirefighter(
      id,
      user.companyId as string,
      body,
    );
  }

  // ----- خودروها -----

  @Get('vehicles')
  findVehicles(
    @CurrentUser() user: AuthUser,
    @Query('stationId') stationId?: string,
  ) {
    return this.fireDepartmentService.findVehicles(
      user.companyId as string,
      stationId,
    );
  }

  @Post('vehicles')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER')
  createVehicle(
    @Body()
    body: {
      stationId: string;
      name: string;
      plateNo: string;
      vehicleType: string;
    },
    @CurrentUser() user: AuthUser,
  ) {
    return this.fireDepartmentService.createVehicle(
      user.companyId as string,
      body,
    );
  }

  @Patch('vehicles/:id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER')
  updateVehicle(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: AuthUser,
  ) {
    return this.fireDepartmentService.updateVehicle(
      id,
      user.companyId as string,
      body,
    );
  }

  // ----- حوادث -----

  @Get('incidents')
  findIncidents(
    @CurrentUser() user: AuthUser,
    @Query('status') status?: string,
    @Query('type') type?: string,
    @Query('stationId') stationId?: string,
  ) {
    return this.fireDepartmentService.findIncidents(
      user.companyId as string,
      { status, type, stationId },
    );
  }

  @Get('incidents/:id')
  findIncident(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.fireDepartmentService.findIncident(
      id,
      user.companyId as string,
    );
  }

  @Post('incidents')
  reportIncident(
    @Body()
    body: {
      type?: string;
      address: string;
      reporterName?: string;
      reporterPhone?: string;
      description?: string;
    },
    @CurrentUser() user: AuthUser,
  ) {
    return this.fireDepartmentService.reportIncident(
      user.companyId as string,
      body,
    );
  }

  @Patch('incidents/:id/dispatch')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER')
  dispatchIncident(
    @Param('id') id: string,
    @Body() body: { stationId: string },
    @CurrentUser() user: AuthUser,
  ) {
    return this.fireDepartmentService.dispatchIncident(
      id,
      user.companyId as string,
      body.stationId,
    );
  }

  @Patch('incidents/:id/status')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'EMPLOYEE')
  updateIncidentStatus(
    @Param('id') id: string,
    @Body()
    body: { status: string; casualties?: number; injuries?: number },
    @CurrentUser() user: AuthUser,
  ) {
    return this.fireDepartmentService.updateIncidentStatus(
      id,
      user.companyId as string,
      body,
    );
  }

  // ----- بازدیدهای ایمنی -----

  @Get('safety-inspections')
  findSafetyInspections(
    @CurrentUser() user: AuthUser,
    @Query('result') result?: string,
  ) {
    return this.fireDepartmentService.findSafetyInspections(
      user.companyId as string,
      result,
    );
  }

  @Post('safety-inspections')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'EMPLOYEE')
  createSafetyInspection(
    @Body()
    body: {
      propertyName: string;
      address: string;
      ownerName: string;
      ownerPhone?: string;
      result: string;
      notes?: string;
    },
    @CurrentUser() user: AuthUser,
  ) {
    return this.fireDepartmentService.createSafetyInspection(
      user.companyId as string,
      body,
    );
  }
}

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

import { ComplaintsService } from './complaints.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import {
  CreateComplaintDto,
  ReferComplaintDto,
  UpdateComplaintStatusDto,
} from './dto/create-complaint.dto';

@Controller('complaints')
export class ComplaintsController {
  constructor(private readonly complaintsService: ComplaintsService) {}

  /**
   * پیگیری عمومی با کد رهگیری — بدون نیاز به ورود
   */
  @Get('track/:trackingNo')
  track(@Param('trackingNo') trackingNo: string) {
    return this.complaintsService.track(trackingNo);
  }

  @Get('stats')
  @UseGuards(JwtAuthGuard)
  stats(@CurrentUser() user: AuthUser) {
    return this.complaintsService.stats(user.companyId as string);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  findAll(
    @CurrentUser() user: AuthUser,
    @Query('status') status?: string,
    @Query('category') category?: string,
    @Query('search') search?: string,
  ) {
    return this.complaintsService.findAll(user.companyId as string, {
      status,
      category,
      search,
    });
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  findOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.complaintsService.findOne(id, user.companyId as string);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  create(
    @Body() body: CreateComplaintDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.complaintsService.create(user.companyId as string, body);
  }

  @Patch(':id/refer')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER')
  refer(
    @Param('id') id: string,
    @Body() body: ReferComplaintDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.complaintsService.refer(
      id,
      user.companyId as string,
      body.referredTo,
    );
  }

  @Patch(':id/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'EMPLOYEE')
  updateStatus(
    @Param('id') id: string,
    @Body() body: UpdateComplaintStatusDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.complaintsService.updateStatus(
      id,
      user.companyId as string,
      body,
    );
  }
}

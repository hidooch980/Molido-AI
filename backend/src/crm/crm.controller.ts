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

import { CrmService } from './crm.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import {
  AuthUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator';

const WRITE = ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'CASHIER'] as const;

@ApiTags('CRM')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('crm')
export class CrmController {
  constructor(private readonly service: CrmService) {}

  @Get('stats')
  stats(@CurrentUser() user: AuthUser) {
    return this.service.stats(user.companyId!);
  }

  @Get('funnel')
  funnel(@CurrentUser() user: AuthUser) {
    return this.service.funnel(user.companyId!);
  }

  // ---------- سرنخ ----------

  @Get('leads')
  leads(@CurrentUser() user: AuthUser, @Query('status') status?: string) {
    return this.service.leads(user.companyId!, status);
  }

  @Get('leads/:id')
  lead(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.lead(user.companyId!, id);
  }

  @Post('leads')
  @Roles(...WRITE)
  createLead(@CurrentUser() user: AuthUser, @Body() dto: any) {
    return this.service.createLead(user.companyId!, dto);
  }

  @Patch('leads/:id')
  @Roles(...WRITE)
  updateLead(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: any,
  ) {
    return this.service.updateLead(user.companyId!, id, dto);
  }

  @Post('leads/:id/convert')
  @Roles(...WRITE)
  convertLead(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.convertLead(user.companyId!, id);
  }

  // ---------- فرصت ----------

  @Get('opportunities')
  opportunities(@CurrentUser() user: AuthUser, @Query('stage') stage?: string) {
    return this.service.opportunities(user.companyId!, stage);
  }

  @Post('opportunities')
  @Roles(...WRITE)
  createOpportunity(@CurrentUser() user: AuthUser, @Body() dto: any) {
    return this.service.createOpportunity(user.companyId!, dto);
  }

  @Patch('opportunities/:id/stage')
  @Roles(...WRITE)
  moveStage(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: { stage: string; lostReason?: string; probability?: number },
  ) {
    return this.service.moveStage(user.companyId!, id, dto);
  }

  // ---------- تعامل ----------

  @Get('interactions')
  interactions(@CurrentUser() user: AuthUser, @Query('due') due?: string) {
    return this.service.interactions(user.companyId!, due === '1');
  }

  @Post('interactions')
  @Roles(...WRITE)
  createInteraction(@CurrentUser() user: AuthUser, @Body() dto: any) {
    return this.service.createInteraction(user.companyId!, user.userId, dto);
  }

  @Patch('interactions/:id/done')
  @Roles(...WRITE)
  completeFollowUp(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.completeFollowUp(user.companyId!, id);
  }
}

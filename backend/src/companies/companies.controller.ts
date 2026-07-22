import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Patch,
  UseGuards,
} from '@nestjs/common';

import { CompaniesService } from './companies.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';

@Controller('company')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @Get()
  findMine(@CurrentUser() user: AuthUser) {
    if (!user.companyId) {
      throw new BadRequestException('کاربر به شرکتی متصل نیست');
    }

    return this.companiesService.findOne(user.companyId);
  }

  @Patch()
  @Roles('SUPER_ADMIN', 'ADMIN')
  update(@CurrentUser() user: AuthUser, @Body() body: Record<string, string>) {
    if (!user.companyId) {
      throw new BadRequestException('کاربر به شرکتی متصل نیست');
    }

    return this.companiesService.update(user.companyId, body);
  }
}

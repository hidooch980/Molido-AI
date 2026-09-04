import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { DiscountRulesService } from './discount-rules.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { CreateDiscountRuleDto, UpdateDiscountRuleDto } from './dto/discount-rule.dto';

@ApiTags('قوانین تخفیف')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('discount-rules')
export class DiscountRulesController {
  constructor(private readonly service: DiscountRulesService) {}

  @Get('stats')
  stats(@CurrentUser() user: AuthUser) {
    return this.service.stats(user.companyId!);
  }

  @Get()
  findAll(@CurrentUser() user: AuthUser, @Query() q: any) {
    return this.service.findAll(user.companyId!, q);
  }

  @Post()
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateDiscountRuleDto) {
    return this.service.create(user.companyId!, dto as unknown as Record<string, unknown>);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.findOne(user.companyId!, id);
  }

  @Patch(':id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateDiscountRuleDto) {
    return this.service.update(user.companyId!, id, dto as unknown as Record<string, unknown>);
  }

  @Delete(':id')
  @Roles('SUPER_ADMIN', 'ADMIN')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.remove(user.companyId!, id);
  }
}

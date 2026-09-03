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

import { JournalTemplateService } from './journal-template.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';

/**
 * الگوی سندِ تکرارشونده.
 *
 * ⚠️ ساخت و صدور هر دو دستِ حسابدار است، نه صندوق‌دار.
 *    الگو سندِ حسابداری می‌سازد؛ کسی که نمی‌تواند سند بزند، نباید
 *    بتواند ماشینی بسازد که هر ماه سند بزند.
 */
@ApiTags('سند تکرارشونده')
@ApiBearerAuth()
@Controller('journal-templates')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT')
export class JournalTemplateController {
  constructor(private readonly templates: JournalTemplateService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query('all') all?: string) {
    return this.templates.list(user.companyId as string, all !== 'true');
  }

  /** سررسیدشده‌ها. */
  @Get('due')
  due(@CurrentUser() user: AuthUser) {
    return this.templates.due(user.companyId as string);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: Record<string, never>) {
    return this.templates.create(user.companyId as string, dto, user.userId);
  }

  /** صدورِ سند از الگو. */
  @Post(':id/generate')
  generate(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: { entryDate?: string },
  ) {
    return this.templates.generate(user.companyId as string, id, dto, user.userId);
  }

  @Patch(':id/activate')
  activate(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.templates.setActive(user.companyId as string, id, true);
  }

  @Patch(':id/deactivate')
  deactivate(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.templates.setActive(user.companyId as string, id, false);
  }
}

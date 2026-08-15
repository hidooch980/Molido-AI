import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CategoriesService } from './categories.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';

@ApiTags('دسته‌بندی')
@ApiBearerAuth()
@Controller('categories')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  /** درخت باید پیش از `:id` بیاید، وگرنه «tree» به‌عنوان شناسه خوانده می‌شود. */
  @Get('tree')
  tree(@CurrentUser() user: AuthUser) {
    return this.categoriesService.tree(user.companyId as string);
  }

  @Get()
  findAll(@CurrentUser() user: AuthUser) {
    return this.categoriesService.findAll(user.companyId as string);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.categoriesService.findOne(user.companyId as string, id);
  }

  @Post()
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'INVENTORY')
  create(
    @Body() body: { name: string; description?: string; parentId?: string },
    @CurrentUser() user: AuthUser,
  ) {
    return this.categoriesService.create(user.companyId as string, body);
  }

  @Patch(':id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'INVENTORY')
  update(
    @Param('id') id: string,
    @Body() body: { name?: string; description?: string; parentId?: string | null },
    @CurrentUser() user: AuthUser,
  ) {
    return this.categoriesService.update(user.companyId as string, id, body);
  }

  @Delete(':id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER')
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.categoriesService.remove(user.companyId as string, id);
  }
}

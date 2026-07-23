import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { RestaurantService } from './restaurant.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';

@ApiTags('کافه و رستوران')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('restaurant')
export class RestaurantController {
  constructor(private readonly service: RestaurantService) {}

  // ---------- آمار ----------

  @Get('stats')
  stats(@CurrentUser() user: AuthUser) {
    return this.service.stats(user.companyId!);
  }

  // ---------- میزها ----------

  @Get('tables')
  findTables(@CurrentUser() user: AuthUser, @Query() q: any) {
    return this.service.findTables(user.companyId!, q);
  }

  @Post('tables')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER')
  createTable(@CurrentUser() user: AuthUser, @Body() dto: any) {
    return this.service.createTable(user.companyId!, dto);
  }

  @Get('tables/:id')
  findTable(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.findTable(user.companyId!, id);
  }

  @Patch('tables/:id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER')
  updateTable(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: any) {
    return this.service.updateTable(user.companyId!, id, dto);
  }

  @Delete('tables/:id')
  @Roles('SUPER_ADMIN', 'ADMIN')
  removeTable(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.removeTable(user.companyId!, id);
  }

  // ---------- دسته‌بندی منو ----------

  @Get('menu-categories')
  findMenuCategories(@CurrentUser() user: AuthUser) {
    return this.service.findMenuCategories(user.companyId!);
  }

  @Post('menu-categories')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER')
  createMenuCategory(@CurrentUser() user: AuthUser, @Body() dto: any) {
    return this.service.createMenuCategory(user.companyId!, dto);
  }

  @Patch('menu-categories/:id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER')
  updateMenuCategory(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: any) {
    return this.service.updateMenuCategory(user.companyId!, id, dto);
  }

  @Delete('menu-categories/:id')
  @Roles('SUPER_ADMIN', 'ADMIN')
  removeMenuCategory(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.removeMenuCategory(user.companyId!, id);
  }

  // ---------- آیتم‌های منو ----------

  @Get('menu-items')
  findMenuItems(@CurrentUser() user: AuthUser, @Query() q: any) {
    return this.service.findMenuItems(user.companyId!, q);
  }

  @Post('menu-items')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER')
  createMenuItem(@CurrentUser() user: AuthUser, @Body() dto: any) {
    return this.service.createMenuItem(user.companyId!, dto);
  }

  @Get('menu-items/:id')
  findMenuItem(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.findMenuItem(user.companyId!, id);
  }

  @Patch('menu-items/:id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER')
  updateMenuItem(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: any) {
    return this.service.updateMenuItem(user.companyId!, id, dto);
  }

  @Delete('menu-items/:id')
  @Roles('SUPER_ADMIN', 'ADMIN')
  removeMenuItem(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.removeMenuItem(user.companyId!, id);
  }

  // ---------- سفارش‌ها ----------

  @Get('orders')
  findOrders(@CurrentUser() user: AuthUser, @Query() q: any) {
    return this.service.findOrders(user.companyId!, q);
  }

  @Post('orders')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'CASHIER', 'SALES')
  createOrder(@CurrentUser() user: AuthUser, @Body() dto: any) {
    return this.service.createOrder(user.companyId!, dto);
  }

  @Get('orders/:id')
  findOrder(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.findOrder(user.companyId!, id);
  }

  @Patch('orders/:id/status')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'CASHIER', 'SALES')
  updateOrderStatus(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: any) {
    return this.service.updateOrderStatus(user.companyId!, id, dto.status);
  }

  @Delete('orders/:id')
  @Roles('SUPER_ADMIN', 'ADMIN')
  removeOrder(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.removeOrder(user.companyId!, id);
  }

  // ---------- رزرو میز ----------

  @Get('reservations')
  findReservations(@CurrentUser() user: AuthUser, @Query() q: any) {
    return this.service.findReservations(user.companyId!, q);
  }

  @Post('reservations')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'CASHIER', 'SALES')
  createReservation(@CurrentUser() user: AuthUser, @Body() dto: any) {
    return this.service.createReservation(user.companyId!, dto);
  }

  @Patch('reservations/:id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'CASHIER', 'SALES')
  updateReservation(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: any) {
    return this.service.updateReservation(user.companyId!, id, dto);
  }

  @Delete('reservations/:id')
  @Roles('SUPER_ADMIN', 'ADMIN')
  removeReservation(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.removeReservation(user.companyId!, id);
  }
}

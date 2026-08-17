import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { RestaurantService } from './restaurant.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import {
  AuthUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator';
import {
  AddItemsDto,
  CreateOrderDto,
  MenuItemDto,
  SetRecipeDto,
  SettleOrderDto,
} from './dto/restaurant.dto';
import { Permission } from '../common/decorators/permission.decorator';

@ApiTags('کافه رستوران')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('restaurant')
export class RestaurantController {
  constructor(private readonly service: RestaurantService) {}

  // ───────── داشبورد ─────────

  @Get('stats')
  @ApiOperation({ summary: 'آمار امروز رستوران' })
  stats(@CurrentUser() user: AuthUser) {
    return this.service.stats(user.companyId!);
  }

  @Get('reports/top-items')
  @ApiOperation({ summary: 'پرفروش‌ترین آیتم‌ها' })
  topItems(@CurrentUser() user: AuthUser, @Query() q: any) {
    return this.service.topItems(user.companyId!, q);
  }

  // ───────── سالن ─────────

  @Get('areas')
  areas(@CurrentUser() user: AuthUser) {
    return this.service.areas(user.companyId!);
  }

  @Post('areas')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER')
  createArea(@CurrentUser() user: AuthUser, @Body() dto: any) {
    return this.service.createArea(user.companyId!, dto);
  }

  @Patch('areas/:id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER')
  updateArea(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: any,
  ) {
    return this.service.updateArea(user.companyId!, id, dto);
  }

  @Delete('areas/:id')
  @Roles('SUPER_ADMIN', 'ADMIN')
  removeArea(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.removeArea(user.companyId!, id);
  }

  // ───────── میز ─────────

  @Get('tables')
  @ApiOperation({ summary: 'وضعیت میزها (نقشه سالن)' })
  tables(@CurrentUser() user: AuthUser, @Query() q: any) {
    return this.service.tables(user.companyId!, q);
  }

  @Post('tables')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER')
  createTable(@CurrentUser() user: AuthUser, @Body() dto: any) {
    return this.service.createTable(user.companyId!, dto);
  }

  @Patch('tables/:id')
  updateTable(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: any,
  ) {
    return this.service.updateTable(user.companyId!, id, dto);
  }

  @Delete('tables/:id')
  @Roles('SUPER_ADMIN', 'ADMIN')
  removeTable(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.removeTable(user.companyId!, id);
  }

  // ───────── منو ─────────

  @Get('menu')
  @ApiOperation({ summary: 'منوی گروه‌بندی‌شده' })
  menu(@CurrentUser() user: AuthUser, @Query() q: any) {
    return this.service.menu(user.companyId!, q);
  }

  @Get('menu-categories')
  menuCategories(@CurrentUser() user: AuthUser) {
    return this.service.menuCategories(user.companyId!);
  }

  @Post('menu-categories')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER')
  createMenuCategory(@CurrentUser() user: AuthUser, @Body() dto: any) {
    return this.service.createMenuCategory(user.companyId!, dto);
  }

  @Patch('menu-categories/:id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER')
  updateMenuCategory(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: any,
  ) {
    return this.service.updateMenuCategory(user.companyId!, id, dto);
  }

  @Get('menu-items')
  menuItems(@CurrentUser() user: AuthUser, @Query() q: any) {
    return this.service.menuItems(user.companyId!, q);
  }

  @Post('menu-items')
  @Permission('restaurant:menu')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER')
  createMenuItem(@CurrentUser() user: AuthUser, @Body() dto: MenuItemDto) {
    return this.service.createMenuItem(user.companyId!, dto);
  }

  @Patch('menu-items/:id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER')
  updateMenuItem(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: any,
  ) {
    return this.service.updateMenuItem(user.companyId!, id, dto);
  }

  @Patch('menu-items/:id/toggle')
  @ApiOperation({ summary: 'موجود / تمام‌شده کردن آیتم' })
  toggle(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.toggleAvailability(user.companyId!, id);
  }

  @Delete('menu-items/:id')
  @Roles('SUPER_ADMIN', 'ADMIN')
  removeMenuItem(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.removeMenuItem(user.companyId!, id);
  }

  // ───────── رسپی ─────────

  @Get('menu-items/:id/recipe')
  @ApiOperation({ summary: 'مواد اولیه آیتم منو' })
  recipe(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.recipe(user.companyId!, id);
  }

  @Post('menu-items/:id/recipe')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER')
  @ApiOperation({ summary: 'ثبت/جایگزینی رسپی' })
  setRecipe(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: SetRecipeDto,
  ) {
    return this.service.setRecipe(user.companyId!, id, dto);
  }

  // ───────── سفارش ─────────

  @Get('orders')
  orders(@CurrentUser() user: AuthUser, @Query() q: any) {
    return this.service.orders(user.companyId!, q);
  }

  @Get('orders/:id')
  order(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.order(user.companyId!, id);
  }

  @Post('orders')
  @ApiOperation({ summary: 'ثبت سفارش جدید (سالن / بیرون‌بر / دلیوری)' })
  createOrder(@CurrentUser() user: AuthUser, @Body() dto: CreateOrderDto) {
    return this.service.createOrder(user.companyId!, user.userId, dto);
  }

  @Post('orders/:id/items')
  @ApiOperation({ summary: 'افزودن اقلام به سفارش باز' })
  addItems(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: AddItemsDto,
  ) {
    return this.service.addItems(user.companyId!, id, dto);
  }

  @Delete('orders/:id/items/:itemId')
  removeItem(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
  ) {
    return this.service.removeItem(user.companyId!, id, itemId);
  }

  @Post('orders/:id/send-to-kitchen')
  @ApiOperation({ summary: 'ارسال اقلام در انتظار به آشپزخانه' })
  sendToKitchen(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.sendToKitchen(user.companyId!, id);
  }

  @Post('orders/:id/settle')
  @Permission('restaurant:settle')
  @ApiOperation({ summary: 'تسویه سفارش و آزادسازی میز' })
  settle(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: SettleOrderDto,
  ) {
    return this.service.settle(user.companyId!, id, dto);
  }

  @Post('orders/:id/cancel')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER')
  cancelOrder(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: any,
  ) {
    return this.service.cancelOrder(user.companyId!, id, dto?.reason);
  }

  @Get('orders/:id/receipt')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @ApiOperation({ summary: 'رسید چاپی HTML' })
  receipt(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.printReceipt(user.companyId!, id);
  }

  // ───────── آشپزخانه (KDS) ─────────

  @Get('kitchen')
  @ApiOperation({ summary: 'صفحه آشپزخانه — اقلام در حال آماده‌سازی' })
  kitchen(@CurrentUser() user: AuthUser, @Query('station') station?: string) {
    return this.service.kitchenBoard(user.companyId!, station);
  }

  @Patch('kitchen/items/:itemId')
  @ApiOperation({ summary: 'تغییر وضعیت قلم (PREPARING/READY/SERVED)' })
  setItemStatus(
    @CurrentUser() user: AuthUser,
    @Param('itemId') itemId: string,
    @Body() dto: { status: string },
  ) {
    return this.service.setItemStatus(user.companyId!, itemId, dto.status);
  }

  // ───────── رزرو ─────────

  @Get('reservations')
  reservations(@CurrentUser() user: AuthUser, @Query() q: any) {
    return this.service.reservations(user.companyId!, q);
  }

  @Post('reservations')
  createReservation(@CurrentUser() user: AuthUser, @Body() dto: any) {
    return this.service.createReservation(user.companyId!, dto);
  }

  @Patch('reservations/:id')
  updateReservation(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: any,
  ) {
    return this.service.updateReservation(user.companyId!, id, dto);
  }

  // ───────── شیفت ─────────

  @Get('shifts')
  shifts(@CurrentUser() user: AuthUser) {
    return this.service.shifts(user.companyId!);
  }

  @Post('shifts/open')
  openShift(@CurrentUser() user: AuthUser, @Body() dto: any) {
    return this.service.openShift(user.companyId!, user.userId, dto);
  }

  @Post('shifts/:id/close')
  closeShift(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: any,
  ) {
    return this.service.closeShift(user.companyId!, id, dto);
  }
}

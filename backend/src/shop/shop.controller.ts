import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { ShopService } from './shop.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import {
  AuthUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator';

type ShopRequest = { shopCompanyId?: string };

/**
 * مسیرهای **عمومی** فروشگاه — بدون احراز هویت.
 *
 * شناسهٔ شرکت از `ShopTenantMiddleware` می‌آید که آن را از پیکربندی سرور
 * می‌خواند، نه از درخواست.
 *
 * مشتری با هدر `x-customer-id` شناسایی می‌شود که پس از ورود به او داده
 * می‌شود.  ⚠️ این یک شناسهٔ ساده است نه توکن امضاشده؛ برای انتشار روی
 * اینترنت باید به JWT مستقل مشتری ارتقا یابد.  در استقرار لوکال — که
 * وضعیت فعلی است — قابل قبول است.
 */
@ApiTags('فروشگاه اینترنتی')
@Controller('shop')
export class ShopPublicController {
  constructor(private readonly service: ShopService) {}

  private company(req: ShopRequest): string {
    return req.shopCompanyId ?? '';
  }

  @Get('settings')
  settings(@Req() req: ShopRequest) {
    return this.service.settings(this.company(req));
  }

  @Get('products')
  catalogue(
    @Req() req: ShopRequest,
    @Query('search') search?: string,
    @Query('categoryId') categoryId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.catalogue(this.company(req), {
      search,
      categoryId,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('categories')
  categories(@Req() req: ShopRequest) {
    return this.service.categories(this.company(req));
  }

  @Get('products/:id')
  product(@Req() req: ShopRequest, @Param('id') id: string) {
    return this.service.product(this.company(req), id);
  }

  // ---------- حساب مشتری ----------

  @Post('register')
  register(@Req() req: ShopRequest, @Body() dto: any) {
    return this.service.register(this.company(req), dto);
  }

  @Post('login')
  login(@Req() req: ShopRequest, @Body() dto: any) {
    return this.service.login(this.company(req), dto);
  }

  // ---------- سبد ----------

  @Get('cart')
  cart(
    @Req() req: ShopRequest,
    @Headers('x-customer-id') customerId?: string,
    @Headers('x-guest-token') guestToken?: string,
  ) {
    return this.service.cart(this.company(req), { customerId, guestToken });
  }

  @Post('cart/items')
  addToCart(
    @Req() req: ShopRequest,
    @Body() dto: any,
    @Headers('x-customer-id') customerId?: string,
    @Headers('x-guest-token') guestToken?: string,
  ) {
    return this.service.addToCart(
      this.company(req),
      { customerId, guestToken },
      dto,
    );
  }

  @Patch('cart/items/:id')
  setQty(
    @Req() req: ShopRequest,
    @Param('id') id: string,
    @Body() dto: { qty: number },
    @Headers('x-customer-id') customerId?: string,
    @Headers('x-guest-token') guestToken?: string,
  ) {
    return this.service.setCartQty(
      this.company(req),
      { customerId, guestToken },
      id,
      Number(dto?.qty ?? 0),
    );
  }

  // ---------- سفارش ----------

  @Post('checkout')
  checkout(
    @Req() req: ShopRequest,
    @Body() dto: any,
    @Headers('x-customer-id') customerId?: string,
  ) {
    if (!customerId) {
      // ثبت سفارش بدون حساب ممکن نیست: پیگیری سفارش و تاریخچهٔ خرید هر دو
      // به مشتری شناسایی‌شده نیاز دارند.
      return { statusCode: 401, message: 'برای ثبت سفارش باید وارد شوید' };
    }
    return this.service.checkout(this.company(req), customerId, dto);
  }

  @Get('my-orders')
  myOrders(
    @Req() req: ShopRequest,
    @Headers('x-customer-id') customerId?: string,
  ) {
    if (!customerId) return [];
    return this.service.myOrders(this.company(req), customerId);
  }

  @Get('my-orders/:id')
  myOrder(
    @Req() req: ShopRequest,
    @Param('id') id: string,
    @Headers('x-customer-id') customerId?: string,
  ) {
    return this.service.orderDetail(this.company(req), id, customerId);
  }
}

/** مدیریت فروشگاه — پشت احراز هویت کارکنان. */
@ApiTags('مدیریت فروشگاه')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('shop-admin')
export class ShopAdminController {
  constructor(private readonly service: ShopService) {}

  @Get('stats')
  stats(@CurrentUser() user: AuthUser) {
    return this.service.stats(user.companyId!);
  }

  @Get('settings')
  settings(@CurrentUser() user: AuthUser) {
    return this.service.settings(user.companyId!);
  }

  @Post('settings')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER')
  saveSettings(@CurrentUser() user: AuthUser, @Body() dto: any) {
    return this.service.saveSettings(user.companyId!, dto);
  }

  @Get('orders')
  orders(@CurrentUser() user: AuthUser, @Query('status') status?: string) {
    return this.service.orders(user.companyId!, status);
  }

  @Get('orders/:id')
  order(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.orderDetail(user.companyId!, id);
  }

  @Post('orders/:id/confirm')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'CASHIER')
  confirm(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.confirm(user.companyId!, id);
  }

  @Patch('orders/:id/status')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'CASHIER')
  setStatus(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: { status: string },
  ) {
    return this.service.setStatus(user.companyId!, id, dto.status);
  }
}

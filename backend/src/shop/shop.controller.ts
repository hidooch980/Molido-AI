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
import { Throttle } from '@nestjs/throttler';

import { ShopService } from './shop.service';
import { CheckinService } from '../loyalty/checkin.service';
import { LoyaltyService } from '../loyalty/loyalty.service';
import {
  CurrentCustomer,
  CustomerAuthGuard,
  OptionalCustomerGuard,
  type CustomerToken,
} from './customer-auth';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import {
  AuthUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator';
import {
  AddToCartDto,
  OrderStatusDto,
  SetCartQtyDto,
  ShopCheckoutDto,
  ShopLoginDto,
  ShopRegisterDto,
  ShopSettingsDto,
} from './dto/shop.dto';

type ShopRequest = {
  shopCompanyId?: string;
  customer?: CustomerToken;
};

/**
 * مسیرهای **عمومی** فروشگاه — بدون احراز هویت.
 *
 * شناسهٔ شرکت از `ShopTenantMiddleware` می‌آید که آن را از پیکربندی سرور
 * می‌خواند، نه از درخواست.
 *
 * مشتری با **توکن امضاشده** شناسایی می‌شود (`CustomerAuthGuard`).  محتوای
 * توکن `kind: 'customer'` دارد تا هرگز با توکن کارمند اشتباه نشود.
 *
 * مسیرهای سبد خرید عمداً بدون نگهبان‌اند: مهمانِ بدون حساب هم باید بتواند
 * کالا در سبد بگذارد، وگرنه نرخ تبدیل فروشگاه به‌شدت افت می‌کند.  سبد او
 * با کلید مرورگر شناسایی می‌شود و هیچ داده‌ای جز همان سبد در دسترسش نیست.
 */
@ApiTags('فروشگاه اینترنتی')
@Controller('shop')
export class ShopPublicController {
  constructor(
    private readonly service: ShopService,
    private readonly loyalty: LoyaltyService,
    private readonly checkin: CheckinService,
  ) {}

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
    @Query('minPrice') minPrice?: string,
    @Query('maxPrice') maxPrice?: string,
    @Query('sort') sort?: string,
  ) {
    // `Number('')` صفر است نه NaN — و صفر برای «حداکثر قیمت» یعنی
    // هیچ کالایی.  پس رشتهٔ خالی باید undefined بماند.
    const num = (raw?: string) => {
      if (!raw) return undefined;
      const n = Number(raw);
      return Number.isFinite(n) && n >= 0 ? n : undefined;
    };
    return this.service.catalogue(this.company(req), {
      search,
      categoryId,
      limit: num(limit),
      minPrice: num(minPrice),
      maxPrice: num(maxPrice),
      sort,
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

  /**
   * ⚠️ سقف سخت، مثل ورودِ کارمند.
   *
   *    ورودِ پنل سقفِ ۱۰ در دقیقه داشت با این توضیح: «سقف عمومی برای
   *    کار روزمرهٔ صندوق بالا برده شده، ولی همان سقف روی ورود یعنی
   *    هزار حدس رمز در دقیقه».
   *
   *    همان استدلال برای مشتری هم درست است و اعمال نشده بود: این دو
   *    مسیر فقط سقفِ سراسریِ ۱۲۰۰ در دقیقه را داشتند.  یعنی حسابِ
   *    کارمند محافظت می‌شد و حسابِ مشتری نه — در حالی که نشانی و
   *    سابقهٔ خرید و شمارهٔ تلفنِ مشتری هم آنجاست.
   *
   *    ثبت‌نام هم سقف می‌گیرد: بی‌سقف، می‌شود فهمید کدام شمارهٔ تلفن
   *    از قبل حساب دارد — که خودش افشای اطلاعات است.
   */
  @Post('register')
  @Throttle({ long: { ttl: 60000, limit: 10 } })
  register(@Req() req: ShopRequest, @Body() dto: ShopRegisterDto) {
    return this.service.register(this.company(req), dto);
  }

  /**
   * کد تأیید برای تصاحبِ رکوردِ مشتریِ حضوری.
   *
   * ⚠️ سقفش از ثبت‌نام سخت‌تر است.
   *
   *    هر درخواست یک پیامک می‌فرستد — یعنی هم هزینه دارد، هم اگر
   *    بی‌سقف بماند می‌شود ابزارِ آزارِ یک شماره با ده‌ها پیامک.
   *
   *    پاسخ همیشه یکسان است، چه شماره سابقه داشته باشد چه نه.
   */
  @Post('register/request-code')
  @Throttle({ long: { ttl: 60000, limit: 3 } })
  requestCode(@Req() req: ShopRequest, @Body() dto: { phone: string }) {
    return this.service.requestPhoneCode(this.company(req), dto?.phone);
  }

  @Post('login')
  @Throttle({ long: { ttl: 60000, limit: 10 } })
  login(
    @Req() req: ShopRequest,
    @Body() dto: ShopLoginDto,
    @Headers('x-guest-token') guestToken?: string,
  ) {
    // کلید مهمان فرستاده می‌شود تا سبدی که پیش از ورود ساخته، از دست نرود.
    return this.service.login(this.company(req), dto, guestToken);
  }

  // ---------- سبد ----------

  /**
   * شناسهٔ مشتری از توکن، اگر توکن معتبری فرستاده شده باشد.
   *
   * اینجا نگهبان استفاده نمی‌شود چون سبد برای مهمان هم باز است؛ ولی توکن
   * جعلی هم نباید پذیرفته شود، پس اگر بود، حتماً تأیید می‌شود.
   */
  private customerFrom(req: ShopRequest): string | undefined {
    return req.customer?.sub;
  }

  @Get('cart')
  @UseGuards(OptionalCustomerGuard)
  cart(
    @Req() req: ShopRequest,
    @Headers('x-guest-token') guestToken?: string,
  ) {
    return this.service.cart(this.company(req), {
      customerId: this.customerFrom(req),
      guestToken,
    });
  }

  @Post('cart/items')
  @UseGuards(OptionalCustomerGuard)
  addToCart(
    @Req() req: ShopRequest,
    @Body() dto: AddToCartDto,
    @Headers('x-guest-token') guestToken?: string,
  ) {
    return this.service.addToCart(
      this.company(req),
      { customerId: this.customerFrom(req), guestToken },
      dto,
    );
  }

  @Patch('cart/items/:id')
  @UseGuards(OptionalCustomerGuard)
  setQty(
    @Req() req: ShopRequest,
    @Param('id') id: string,
    @Body() dto: SetCartQtyDto,
    @Headers('x-guest-token') guestToken?: string,
  ) {
    return this.service.setCartQty(
      this.company(req),
      { customerId: this.customerFrom(req), guestToken },
      id,
      Number(dto?.qty ?? 0),
    );
  }

  // ---------- سفارش ----------

  // از اینجا به بعد ورود اجباری است: سفارش به مشتری شناسایی‌شده نیاز
  // دارد، هم برای پیگیری هم برای اینکه کسی به نام دیگری سفارش ندهد.

  @Post('checkout')
  @UseGuards(CustomerAuthGuard)
  checkout(
    @Req() req: ShopRequest,
    @Body() dto: ShopCheckoutDto,
    @CurrentCustomer() customer: CustomerToken,
  ) {
    return this.service.checkout(this.company(req), customer.sub, dto);
  }

  @Get('my-orders')
  @UseGuards(CustomerAuthGuard)
  myOrders(
    @Req() req: ShopRequest,
    @CurrentCustomer() customer: CustomerToken,
  ) {
    return this.service.myOrders(this.company(req), customer.sub);
  }

  @Get('my-orders/:id')
  @UseGuards(CustomerAuthGuard)
  myOrder(
    @Req() req: ShopRequest,
    @Param('id') id: string,
    @CurrentCustomer() customer: CustomerToken,
  ) {
    // شناسهٔ مشتری از توکن می‌آید، نه از درخواست: تنها راهی که کسی نتواند
    // سفارش دیگری را ببیند.
    return this.service.orderDetail(this.company(req), id, customer.sub);
  }

  /** کدهای تخفیف فعال مشتری. */
  @Get('my-codes')
  @UseGuards(CustomerAuthGuard)
  myCodes(@Req() req: ShopRequest, @CurrentCustomer() customer: CustomerToken) {
    return this.loyalty.customerCodes(this.company(req), customer.sub);
  }

  /**
   * QR شناسایی برای خرید حضوری.
   *
   * مشتری این را در فروشگاه نشان می‌دهد و صندوق‌دار اسکنش می‌کند؛ فاکتور
   * به حساب او می‌خورد و تخفیف شخصی‌اش اعمال می‌شود.
   *
   * POST است نه GET: هر بار توکن **تازه** می‌سازد و قبلی را باطل می‌کند،
   * یعنی عملیات است نه خواندن.
   */
  @Post('checkin-token')
  @UseGuards(CustomerAuthGuard)
  checkinToken(
    @Req() req: ShopRequest,
    @CurrentCustomer() customer: CustomerToken,
  ) {
    return this.checkin.issue(this.company(req), customer.sub);
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
  saveSettings(@CurrentUser() user: AuthUser, @Body() dto: ShopSettingsDto) {
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
    @Body() dto: OrderStatusDto,
  ) {
    return this.service.setStatus(user.companyId!, id, dto.status);
  }
}

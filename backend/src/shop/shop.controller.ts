import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
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
import { PaymentService } from '../payment/payment.service';
import { ReviewService } from './review.service';
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
    private readonly payment: PaymentService,
    private readonly reviews_: ReviewService,
  ) {}

  private company(req: ShopRequest): string {
    return req.shopCompanyId ?? '';
  }

  @Get('settings')
  settings(@Req() req: ShopRequest) {
    return this.service.settings(this.company(req));
  }

  @Get('products')
  async catalogue(
    @Req() req: ShopRequest,
    @Query('search') search?: string,
    @Query('categoryId') categoryId?: string,
    @Query('limit') limit?: string,
    @Query('page') page?: string,
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
    const result = await this.service.catalogue(this.company(req), {
      page: num(page),
      search,
      categoryId,
      limit: num(limit),
      minPrice: num(minPrice),
      maxPrice: num(maxPrice),
      sort,
    });

    // ⚠️ شکلِ پاسخ به `page` بستگی دارد — عمدی، برای سازگاری.
    //
    //    این نقطه از قبل مصرف‌کننده داشت: نقشهٔ سایت، صفحهٔ فروشگاه و
    //    چهار مجموعهٔ آزمون همه آرایه انتظار دارند.  برگرداندنِ پاکت
    //    به همه، همه‌شان را هم‌زمان می‌شکست.
    //
    //    پس هرکه `page` نمی‌فرستد همان آرایهٔ قبلی را می‌گیرد، و
    //    رابطِ صفحه‌بندی‌شده که `page` می‌فرستد پاکت را با `total` و
    //    `pages`.  وقتی همهٔ مصرف‌کننده‌ها منتقل شدند، این شرط برداشته
    //    می‌شود.
    return page === undefined ? result.items : result;
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

  /**
   * آغازِ پرداختِ آنلاین — نشانیِ درگاه را برمی‌گرداند.
   *
   * ⚠️ شناسهٔ مشتری از **توکن** می‌آید، نه از بدنه.
   *
   *    همان قاعده‌ای که `my-orders/:id` رعایت می‌کند: تنها راهی که کسی
   *    نتواند سفارشِ دیگری را پرداخت کند یا وضعیتش را ببیند.
   */
  @Post('orders/:id/pay')
  @UseGuards(CustomerAuthGuard)
  @HttpCode(HttpStatus.OK)
  payOrder(
    @Req() req: ShopRequest,
    @Param('id') id: string,
    @CurrentCustomer() customer: CustomerToken,
  ) {
    return this.payment.start(this.company(req), id, customer.sub);
  }

  /**
   * تأیید پس از بازگشت از درگاه.
   *
   * ⚠️ تأیید را **سرور** انجام می‌دهد، نه کلاینت.
   *
   *    اگر صفحهٔ بازگشت فقط می‌گفت «موفق بود» و ما باور می‌کردیم، هر
   *    کسی می‌توانست با ساختنِ همان درخواست سفارشش را پرداخت‌شده کند.
   *    اینجا دوباره از خودِ درگاه پرسیده می‌شود و مبلغ هم تطبیق داده
   *    می‌شود.
   */
  @Post('orders/:id/verify-payment')
  @UseGuards(CustomerAuthGuard)
  @HttpCode(HttpStatus.OK)
  verifyPayment(
    @Req() req: ShopRequest,
    @Param('id') id: string,
    @CurrentCustomer() customer: CustomerToken,
  ) {
    return this.payment.verify(this.company(req), id, customer.sub);
  }

  /** خلاصهٔ امتیاز و نظرهای تأییدشده — عمومی، بدون ورود. */
  @Get('products/:id/reviews')
  reviews(@Req() req: ShopRequest, @Param('id') id: string) {
    return this.reviews_.list(this.company(req), id);
  }

  @Get('products/:id/rating')
  rating(@Req() req: ShopRequest, @Param('id') id: string) {
    return this.reviews_.summary(this.company(req), id);
  }

  /**
   * ثبت یا ویرایشِ نظر.
   *
   * ⚠️ شناسهٔ مشتری از توکن می‌آید.  اگر از بدنه می‌آمد، هر کسی
   *    می‌توانست به نامِ دیگری نظر بگذارد.
   */
  @Post('products/:id/reviews')
  @UseGuards(CustomerAuthGuard)
  @HttpCode(HttpStatus.OK)
  writeReview(
    @Req() req: ShopRequest,
    @Param('id') id: string,
    @Body() body: { rating: number; comment?: string },
    @CurrentCustomer() customer: CustomerToken,
  ) {
    return this.reviews_.upsert(this.company(req), id, customer.sub, body);
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
  constructor(
    private readonly service: ShopService,
    private readonly reviews: ReviewService,
  ) {}

  /**
   * صفِ بررسیِ نظرها.
   *
   * ⚠️ نظرِ تأییدنشده در فروشگاه دیده نمی‌شود؛ این تنها جایی است که
   *    صاحبِ فروشگاه پیش از انتشار می‌بیندشان.
   */
  @Get('reviews/pending')
  pendingReviews(@CurrentUser() user: AuthUser) {
    return this.reviews.pending(user.companyId!);
  }

  @Post('reviews/:id/approve')
  @HttpCode(HttpStatus.OK)
  approveReview(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.reviews.moderate(user.companyId!, id, true);
  }

  /** رد یعنی حذف — نگه داشتنِ نظرِ ردشده فایده‌ای ندارد. */
  @Delete('reviews/:id')
  @HttpCode(HttpStatus.OK)
  rejectReview(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.reviews.moderate(user.companyId!, id, false);
  }

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

import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/**
 * اعتبارسنجی نقطه‌های فروشگاه اینترنتی.
 *
 * تا امروز این مسیرها `@Body() dto: any` بودند، که یعنی `ValidationPipe`
 * سراسری هیچ کاری روی‌شان نمی‌کرد.  فرقش با بقیهٔ API این است که اینجا
 * **مهمان هم می‌تواند درخواست بفرستد** — نیازی به توکن نیست.  پس هر
 * چیزی که این‌جا نیفتد، مستقیم به سرویس و از آنجا به دیتابیس می‌رود.
 */

/** شمارهٔ موبایل ایران: دقیقاً ۱۱ رقم و شروع با ۰۹. */
const IRAN_MOBILE = /^09\d{9}$/;

/**
 * وضعیت‌ها و روش‌های پرداخت — دقیقاً همان‌هایی که CHECK جدول
 * `OnlineOrder` می‌پذیرد.  اگر روزی آنجا عوض شد، اینجا هم باید عوض شود؛
 * آزمون `online-orders.sh` این را می‌گیرد.
 */
export const ONLINE_ORDER_STATUSES = [
  'PLACED',
  'CONFIRMED',
  'PREPARING',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED',
] as const;

export const PAYMENT_METHODS = ['COD', 'GATEWAY', 'WALLET', 'CARD_TO_CARD'] as const;

export class ShopRegisterDto {
  @IsString()
  @IsNotEmpty({ message: 'نام را وارد کنید' })
  @MaxLength(60)
  firstName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  lastName?: string;

  @Matches(IRAN_MOBILE, { message: 'شمارهٔ موبایل معتبر نیست' })
  phone!: string;

  /**
   * کد ملی — **اختیاری**.
   *
   * ⚠️ عمداً اجباری نیست.
   *
   *    اجباری کردنِ کد ملی برای ثبت‌نامِ فروشگاه تصمیمی تجاری و
   *    حقوقی است، نه فنی: بسیارِ خریدارها آن را نمی‌دهند و فروشگاه
   *    مشتری از دست می‌دهد.  چنین تصمیمی را کد نباید یک‌طرفه بگیرد.
   *
   *    ولی اگر داده شد، با شاهکار سنجیده می‌شود — کد ملیِ کسِ دیگری
   *    روی یک شماره، بدتر از نبودِ کد ملی است، چون احراز شده به نظر
   *    می‌آید.
   */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  nationalCode?: string;

  /**
   * حداقل ۶ نویسه.
   *
   * از رمز پنل (۸) شل‌تر است چون مشتری فروشگاه نه به داده‌ای دسترسی دارد
   * نه به عملیاتی — فقط سفارش‌های خودش.  سخت‌گیری بیشتر اینجا فقط باعث
   * می‌شود مشتری ثبت‌نام را رها کند.
   */
  @IsString()
  @MinLength(6, { message: 'رمز باید دست‌کم ۶ نویسه باشد' })
  @MaxLength(72)
  password!: string;

  /**
   * کدِ تأیید — فقط وقتی لازم است که این شماره از قبل در فروشگاه
   * سابقه دارد (مشتریِ حضوری که صندوق‌دار ثبتش کرده).
   *
   * ⚠️ اعلامش در DTO **اجباری** است، حتی با `@IsOptional`.
   *
   *    `ValidationPipe` با `whitelist` و `forbidNonWhitelisted` کار
   *    می‌کند: میدانی که اینجا نباشد، درخواست را با ۴۰۰ رد می‌کند.
   *
   *    یعنی اگر این چند خط نبود، رفعِ امنیتی «کار می‌کرد» — ولی هیچ
   *    مشتریِ حضوری‌ای نمی‌توانست ثبت‌نام کند، و علتش هم از پیام خطا
   *    معلوم نمی‌شد.
   */
  @IsOptional()
  @IsString()
  @MaxLength(10)
  code?: string;
}

export class ShopLoginDto {
  @Matches(IRAN_MOBILE, { message: 'شمارهٔ موبایل معتبر نیست' })
  phone!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(72)
  password!: string;
}

export class AddToCartDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  productId!: string;

  /**
   * سقف ۱۰۰۰ برای یک قلم.
   *
   * بدون سقف، `qty` عددی مثل 1e308 می‌پذیرد؛ ضربش در قیمت به `Infinity`
   * می‌رسد و از آنجا به ستون NUMERIC دیتابیس، که با خطای ۵۰۰ می‌شکند —
   * روی نقطه‌ای که مهمان هم می‌تواند صدایش بزند.
   */
  @IsOptional()
  @IsNumber()
  @Min(0.001)
  @Max(1000)
  qty?: number;
}

export class SetCartQtyDto {
  /** صفر یعنی حذف قلم — سرویس همین را انتظار دارد. */
  @IsNumber()
  @Min(0)
  @Max(1000)
  qty!: number;
}

export class ShopCheckoutDto {
  /** نشانی ذخیره‌شدهٔ مشتری؛ اگر بیاید، `shipAddress` لازم نیست. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  addressId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  shipAddress?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  receiverName?: string;

  @IsOptional()
  @Matches(IRAN_MOBILE, { message: 'شمارهٔ گیرنده معتبر نیست' })
  receiverPhone?: string;

  /**
   * همان چهار مقداری که CHECK دیتابیس می‌پذیرد.
   *
   * فهرست از روی محدودیت جدول برداشته شده، نه از حدس: اگر اینجا مقداری
   * بیاید که دیتابیس نمی‌شناسد، خطا در لایهٔ SQL می‌افتد و کاربر پیام
   * خام postgres می‌بیند نه پیام فارسی فرم.
   */
  @IsOptional()
  @IsIn(PAYMENT_METHODS as unknown as string[], {
    message: 'روش پرداخت پشتیبانی نمی‌شود',
  })
  paymentMethod?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}

export class ShopSettingsDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  shopName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  shopDescription?: string;

  @IsOptional()
  @IsBoolean()
  isOpen?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  shippingFee?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  freeShippingOver?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minOrderAmount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  warehouseId?: string;

  @IsOptional()
  @Matches(/^0\d{9,10}$/, { message: 'شمارهٔ پشتیبانی معتبر نیست' })
  supportPhone?: string;
}



export class OrderStatusDto {
  @IsIn(ONLINE_ORDER_STATUSES as unknown as string[], {
    message: 'وضعیت سفارش معتبر نیست',
  })
  status!: string;
}

/** توکن شناسایی QR — مدتش را مشتری تعیین نمی‌کند، ولی می‌تواند بفرستد. */
export class CheckinTokenDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(60)
  minutes?: number;
}

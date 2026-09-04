import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class SaleItemDto {
  @IsString()
  @IsNotEmpty()
  productId!: string;

  @IsNumber()
  @Min(0.001)
  quantity!: number;

  /**
   * @deprecated نادیده گرفته می‌شود — قیمت را سرور تعیین می‌کند.
   *
   * فیلد نگه داشته شده تا کلاینت‌های قدیمی ۴۰۰ نگیرند (اعتبارسنجی روی
   * `forbidNonWhitelisted` است)، ولی مقدارش در محاسبه به کار نمی‌رود.
   */
  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  /** @deprecated نادیده گرفته می‌شود — تخفیف قلم از قواعد تخفیف می‌آید. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  discount?: number;

  /**
   * تخفیف دستی این قلم — «این یکی ضربه دیده، ۲۰٪ کمتر».
   *
   * برخلاف `discount` واقعاً اعمال می‌شود، ولی سقفش را شرکت تعیین می‌کند
   * و صفر یعنی ممنوع.  بدون سقف، صندوق‌دار می‌تواند کالا را رایگان بدهد.
   */
  @IsOptional()
  @IsNumber()
  @Min(0)
  manualDiscount?: number;

  /**
   * شرح این قلم — «۲ متر کم داشت»، «رنگ سفارشی».
   *
   * جدا از شرح فاکتور: در فاکتور ده‌ردیفی، توضیحی که در شرح کل نوشته شود
   * معلوم نیست به کدام قلم مربوط است.
   */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;

  /**
   * شمارهٔ سریال کالا روی همین ردیف.
   *
   * متن آزاد چون گاهی چند سریال در یک ردیف است؛ ردیابی گارانتیِ دقیق
   * کار جدول `SerialNumber` است، این فقط چیزی است که روی فاکتور چاپ
   * می‌شود.
   */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  serial?: string;
}

export const PAYMENT_METHODS = [
  'CASH',
  'CARD',
  'BANK_TRANSFER',
  'CHEQUE',
  'ONLINE',
  'WALLET',
  /**
   * نسیه — صریح، نه «هرچه ناشناخته بود».
   *
   * تا امروز نسیه فقط با «کمتر پرداخت کردن» ثبت می‌شد و روش پرداختی
   * نداشت.  نتیجه‌اش این بود که صندوق‌دار نمی‌توانست بگوید «این را
   * نسیه دادم» و گزارش، فروش نسیه را از فروشِ نیمه‌پرداخت‌شده تشخیص
   * نمی‌داد.  سند حسابداری‌اش از قبل درست بود (حساب دریافتنی).
   */
  'CREDIT',
] as const;

/**
 * یک قسمت از پرداخت. فروشگاه اغلب یک فاکتور را نقد + کارت تسویه می‌کند، پس
 * پرداخت باید چندبخشی باشد نه تک‌روشی.
 */
export class SalePaymentDto {
  @IsIn(PAYMENT_METHODS as unknown as string[])
  method!: string;

  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsOptional()
  @IsString()
  cashBoxId?: string;

  @IsOptional()
  @IsString()
  referenceNo?: string;
}

export class CreateSaleDto {
  @IsString()
  @IsNotEmpty()
  warehouseId!: string;

  @IsOptional()
  @IsString()
  customerId?: string;

  /**
   * ویزیتورِ این فروش.  اگر داده نشود، از ویزیتورِ پیش‌فرضِ همان مشتری
   * برداشته می‌شود — بیشتر فروش‌ها از مسیر ویزیتور ثابتِ مشتری می‌آیند و
   * صندوق‌دار نباید هر بار دستی انتخاب کند.
   */
  @IsOptional()
  @IsString()
  salesAgentId?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SaleItemDto)
  items!: SaleItemDto[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  discount?: number;

  /** کد تخفیف مشتری — شخصی یا عمومی. */
  @IsOptional()
  @IsString()
  discountCode?: string;

  /** شناسهٔ شناسایی QR که صندوق‌دار اسکن کرده. */
  @IsOptional()
  @IsString()
  checkinId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  tax?: number;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  paidAmount?: number;

  @IsOptional()
  @IsIn(PAYMENT_METHODS as unknown as string[])
  paymentMethod?: string;

  @IsOptional()
  @IsString()
  cashBoxId?: string;

  /**
   * تسویهٔ چندبخشی. اگر داده شود، جایگزین paidAmount/paymentMethod می‌شود؛
   * دو شکل قدیمی برای سازگاری با کلاینت‌های موجود باقی مانده‌اند.
   */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SalePaymentDto)
  payments?: SalePaymentDto[];

  /**
   * حساب کالابرگ خریدار.  مبلغ برداشت از روی اقلام مشمول و قیمت مصوب آن‌ها
   * در سرور محاسبه می‌شود و از سمت صندوق قابل تعیین نیست.
   */
  @IsOptional()
  @IsString()
  rationAccountId?: string;

  /** شمارهٔ سفارش خریدار، قرارداد، یا حوالهٔ انبار. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  reference?: string;

  /**
   * سررسید تسویه برای فروش نسیه.
   *
   * فقط تاریخ (YYYY-MM-DD)، نه زمان: «۲۵ مرداد» سررسید است، «۲۵ مرداد
   * ساعت ۱۴:۳۲» یعنی ساعتِ ثبت فاکتور که ربطی به سررسید ندارد.
   */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'مهلت تسویه باید به شکل YYYY-MM-DD باشد' })
  dueDate?: string;

  /** کرایهٔ حمل، بسته‌بندی — نه تخفیف است نه مالیات. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  additions?: number;

  /** کسر توافقی، گرد کردن مبلغ. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  deductions?: number;

  /**
   * تاریخ فاکتور — نه لحظهٔ ثبت.
   *
   * فاکتوری که امروز برای فروشِ دیروز زده می‌شود باید در گزارش فروشِ
   * دیروز بنشیند، وگرنه فروش روزانه و سند حسابداری روی روز اشتباه
   * می‌افتد.  اگر داده نشود، همان روز ثبت است.
   */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'تاریخ فاکتور باید به شکل YYYY-MM-DD باشد' })
  invoiceDate?: string;
}

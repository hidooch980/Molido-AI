import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsNotEmpty,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class PurchaseItemDto {
  @IsString()
  @IsNotEmpty()
  productId!: string;

  @IsNumber()
  @Min(0.001)
  quantity!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  purchasePrice?: number;

  /** شمارهٔ سری ساخت این محموله */
  @IsOptional()
  @IsString()
  batchNo?: string;

  /** تاریخ انقضای همین محموله — نه کل کالا */
  @IsOptional()
  @IsDateString()
  expiryDate?: string;

  @IsOptional()
  @IsDateString()
  manufactureDate?: string;
}

export class CreatePurchaseDto {
  @IsString()
  @IsNotEmpty()
  supplierId!: string;

  @IsString()
  @IsNotEmpty()
  warehouseId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PurchaseItemDto)
  items!: PurchaseItemDto[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  discount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  tax?: number;

  @IsOptional()
  @IsString()
  note?: string;

  /**
   * کرایهٔ حمل ورودی.  به نسبت ارزش روی اقلام سرشکن می‌شود و در بهای
   * تمام‌شدهٔ کالا می‌نشیند — نه به‌عنوان هزینهٔ دوره.
   */
  @IsOptional()
  @IsNumber()
  @Min(0)
  freightCost?: number;

  @IsOptional()
  @IsString()
  freightCarrier?: string;

  /**
   * اگر false باشد کرایه هزینهٔ دوره می‌شود، نه بخشی از بهای کالا.
   * انتخاب باید صریح باشد چون اثرش روی سود ناخالص مستقیم است.
   */
  @IsOptional()
  @IsBoolean()
  capitalizeFreight?: boolean;

  /**
   * ثبت و دریافت در یک درخواست.
   *
   * ⚠️ برای صفِ آفلاین لازم است، نه راحتی.
   *
   *    مسیرِ عادی دو درخواست است: `POST /purchases` و سپس
   *    `PATCH /purchases/:id/receive`.  صفِ آفلاین نمی‌تواند این
   *    زنجیره را اجرا کند، چون شناسهٔ فاکتور تا رسیدنِ پاسخِ اول
   *    وجود ندارد.
   *
   *    مسیرِ دومرحله‌ای دست‌نخورده می‌ماند: فاکتور همچنان ممکن است
   *    پیش از رسیدنِ کالا ثبت شود.
   */
  @IsOptional()
  @IsBoolean()
  receive?: boolean;

  /**
   * کلیدِ یکتاسازی — کلاینت پیش از رفتن به صف می‌سازدش.
   *
   * ⚠️ بدونِ این، تلاشِ دوبارهٔ صف فاکتورِ دوم می‌سازد: دو برابر
   *    موجودی و دو سندِ حسابداری.  توضیح کامل در
   *    `sql/migrations/045_idempotency.sql`.
   */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  idempotencyKey?: string;
}

import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
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

  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  discount?: number;
}

export const PAYMENT_METHODS = [
  'CASH',
  'CARD',
  'BANK_TRANSFER',
  'CHEQUE',
  'ONLINE',
  'WALLET',
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
}

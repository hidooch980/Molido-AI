import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Min,
} from 'class-validator';

export class UpdateProductDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  sku?: string;

  @IsOptional()
  @IsString()
  barcode?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  purchasePrice?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  salePrice?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  taxRate?: number;

  @IsOptional()
  @IsString()
  unit?: string;

  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE', 'OUT_OF_STOCK'])
  status?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minStock?: number;

  @IsOptional()
  @IsString()
  expiryDate?: string;

  /** کالای وزنی: مقدار از برچسب ترازو خوانده می‌شود، نه شمارش. */
  @IsOptional()
  @IsBoolean()
  isWeighed?: boolean;

  /** کد ۵ رقمی کالا روی ترازو — داخل بارکد برچسب چاپ می‌شود. */
  @IsOptional()
  @Matches(/^\d{5}$/, { message: 'کد ترازو باید دقیقاً ۵ رقم باشد' })
  scaleCode?: string;

  /** مشمول کالابرگ الکترونیکی. */
  @IsOptional()
  @IsBoolean()
  isRationEligible?: boolean;

  /** قیمت مصوب کالابرگ؛ خالی یعنی همان قیمت فروش عادی. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  rationPrice?: number;
}

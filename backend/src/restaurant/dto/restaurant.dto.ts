import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum OrderTypeDto {
  DINE_IN = 'DINE_IN',
  TAKEAWAY = 'TAKEAWAY',
  DELIVERY = 'DELIVERY',
}

export enum StationDto {
  KITCHEN = 'KITCHEN',
  GRILL = 'GRILL',
  COLD = 'COLD',
  BAR = 'BAR',
  COFFEE = 'COFFEE',
  DESSERT = 'DESSERT',
}

/** یک قلم سفارش */
export class OrderItemDto {
  @ApiPropertyOptional({ description: 'شناسه آیتم منو' })
  @IsOptional()
  @IsString()
  menuItemId?: string;

  @ApiPropertyOptional({ description: 'نام دستی (اگر آیتم منو نباشد)' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ example: 2, description: 'تعداد' })
  @IsNumber()
  @Min(0.01)
  qty!: number;

  @ApiPropertyOptional({ description: 'قیمت واحد — پیش‌فرض قیمت منو' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  unitPrice?: number;

  @ApiPropertyOptional({ description: 'تخفیف قلم' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  discount?: number;

  @ApiPropertyOptional({ description: 'توضیح مثل «بدون پیاز»' })
  @IsOptional()
  @IsString()
  note?: string;
}

/** ثبت سفارش جدید */
export class CreateOrderDto {
  @ApiPropertyOptional({ enum: OrderTypeDto, default: OrderTypeDto.DINE_IN })
  @IsOptional()
  @IsEnum(OrderTypeDto)
  type?: OrderTypeDto;

  @ApiPropertyOptional({ description: 'شناسه میز (برای سفارش سالن)' })
  @IsOptional()
  @IsString()
  tableId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customerId?: string;

  @ApiPropertyOptional({ description: 'تعداد نفرات', default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  guestCount?: number;

  @ApiPropertyOptional({ description: 'تخفیف کل فاکتور' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  discount?: number;

  @ApiPropertyOptional({ description: 'درصد حق سرویس', example: 10 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  servicePercent?: number;

  @ApiPropertyOptional({ description: 'درصد مالیات', example: 9 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  taxPercent?: number;

  @ApiPropertyOptional({ description: 'هزینه پیک' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  deliveryFee?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  deliveryAddress?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  deliveryPhone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;

  @ApiProperty({ type: [OrderItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items!: OrderItemDto[];
}

/** افزودن اقلام به سفارش باز */
export class AddItemsDto {
  @ApiProperty({ type: [OrderItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items!: OrderItemDto[];
}

/** تسویه سفارش */
export class SettleOrderDto {
  @ApiProperty({ description: 'مبلغ پرداختی' })
  @IsNumber()
  @Min(0)
  paidAmount!: number;

  @ApiPropertyOptional({ description: 'CASH | CARD | ONLINE | ...' })
  @IsOptional()
  @IsString()
  paymentMethod?: string;

  @ApiPropertyOptional({ description: 'انعام' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  tipAmount?: number;

  @ApiPropertyOptional({ description: 'صندوق برای واریز وجه' })
  @IsOptional()
  @IsString()
  cashBoxId?: string;

  @ApiPropertyOptional({
    description: 'انبار برای کسر خودکار مواد اولیه طبق رسپی',
  })
  @IsOptional()
  @IsString()
  warehouseId?: string;
}

/** آیتم منو */
export class MenuItemDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiProperty()
  @IsString()
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  code?: string;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  price!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  cost?: number;

  @ApiPropertyOptional({ enum: StationDto })
  @IsOptional()
  @IsEnum(StationDto)
  station?: StationDto;

  @ApiPropertyOptional({ default: 10 })
  @IsOptional()
  @IsInt()
  @Min(0)
  prepMinutes?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;
}

/** رسپی آیتم منو */
export class RecipeLineDto {
  @ApiProperty({ description: 'شناسه کالای انبار (ماده اولیه)' })
  @IsString()
  productId!: string;

  @ApiProperty({ description: 'مقدار مصرفی برای یک پرس' })
  @IsNumber()
  @Min(0)
  qty!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  unit?: string;

  @ApiPropertyOptional({ description: 'درصد ضایعات', default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  wastePct?: number;
}

export class SetRecipeDto {
  @ApiProperty({ type: [RecipeLineDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RecipeLineDto)
  lines!: RecipeLineDto[];
}

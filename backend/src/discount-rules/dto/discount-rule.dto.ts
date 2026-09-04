import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

/**
 * قاعدهٔ تخفیف — عمداً DTO دارد، نه `any`.
 *
 * دیتابیس از قبل درست محافظت می‌کرد:
 *
 *   kind  ∈ {PERCENT, AMOUNT, BUY_X_GET_Y}
 *   value ≥ ۰، و اگر PERCENT باشد ≤ ۱۰۰
 *
 * ولی کنترلر `@Body() dto: any` می‌گرفت، پس ورودی غلط تا خودِ دیتابیس
 * می‌رفت و آنجا می‌شکست — کاربر **۵۰۰ خطای سرور** می‌گرفت به‌جای ۴۰۰
 * با پیام روشن.  محافظِ درست در جای غلط، شبیه خرابی سامانه به نظر
 * می‌رسد.
 *
 * و بدتر: میدان ناشناس بی‌صدا دور ریخته می‌شد.  کسی که `type` بنویسد
 * به‌جای `kind`، پاسخ ۲۰۱ می‌گرفت و قاعده‌اش با نوع پیش‌فرض ذخیره
 * می‌شد — موفقیتی که موفقیت نبود.
 */

export const DISCOUNT_KINDS = ['PERCENT', 'AMOUNT', 'BUY_X_GET_Y'] as const;

const trimmed = Transform(({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value,
);

export class CreateDiscountRuleDto {
  @trimmed
  @IsString()
  @IsNotEmpty({ message: 'نام قاعده لازم است' })
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsIn(DISCOUNT_KINDS as unknown as string[], {
    message: `نوع تخفیف باید یکی از ${DISCOUNT_KINDS.join('، ')} باشد`,
  })
  kind?: string;

  /**
   * سقف ۱۰۰ فقط برای درصد.
   *
   * `AMOUNT` مبلغ ریالی است و صد ریال تخفیف بی‌معنی است؛ همان قاعده‌ای
   * که دیتابیس دارد، اینجا هم اجرا می‌شود تا خطا پیش از رسیدن به
   * دیتابیس گرفته شود.
   */
  @IsNumber()
  @Min(0, { message: 'مقدار تخفیف نمی‌تواند منفی باشد' })
  @ValidateIf((o: CreateDiscountRuleDto) => (o.kind ?? 'PERCENT') === 'PERCENT')
  @Max(100, { message: 'تخفیف درصدی نمی‌تواند بیش از ۱۰۰ باشد' })
  value!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minQty?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minAmount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  getQty?: number;

  @IsOptional()
  @trimmed
  @IsString()
  @MaxLength(40)
  code?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxUses?: number;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  productId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  categoryId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  priority?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  startsAt?: string;

  @IsOptional()
  @IsString()
  endsAt?: string;
}

export class UpdateDiscountRuleDto {
  @IsOptional()
  @trimmed
  @IsString()
  @IsNotEmpty({ message: 'نام قاعده نمی‌تواند خالی باشد' })
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsIn(DISCOUNT_KINDS as unknown as string[])
  kind?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  value?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minQty?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minAmount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  getQty?: number;

  @IsOptional()
  @trimmed
  @IsString()
  @MaxLength(40)
  code?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxUses?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

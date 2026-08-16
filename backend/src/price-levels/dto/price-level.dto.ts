import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/**
 * سطح قیمت — عمداً DTO دارد، نه `any`.
 *
 * پیش از این کنترلر `@Body() dto: any` می‌گرفت، که `ValidationPipe`
 * سراسری را کاملاً دور می‌زند.  نتیجه‌اش این بود:
 *
 *   نام خالی        → ۲۰۱ پذیرفته می‌شد
 *   نام ۱۰٬۰۰۰ حرفی → ۲۰۱ پذیرفته می‌شد
 *   میدان ناشناس    → ۲۰۱ پذیرفته می‌شد
 *   بدون نام        → ۵۰۰ خطای سرور، نه ۴۰۰
 *
 * `any` در امضای کنترلر شبیه «هنوز تایپ ننوشته‌ام» به نظر می‌رسد، ولی
 * در عمل یعنی «هیچ اعتبارسنجی‌ای انجام نشود» — و این تفاوت در امضا
 * دیده نمی‌شود.
 */

/** فاصله‌های ابتدا و انتها حذف می‌شوند پیش از سنجش خالی بودن. */
const trimmed = Transform(({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value,
);

export class CreatePriceLevelDto {
  @trimmed
  @IsString()
  // فقط فاصله، نام نیست: سطحی که در فهرست خالی دیده شود، انتخاب‌شدنی
  // نیست و کسی هم نمی‌فهمد چرا.
  @IsNotEmpty({ message: 'نام سطح قیمت لازم است' })
  @MaxLength(80, { message: 'نام سطح قیمت بیش از حد بلند است' })
  name!: string;

  @IsOptional()
  @trimmed
  @IsString()
  @MaxLength(300)
  description?: string;

  /**
   * سطح پیش‌فرض.
   *
   * سرویس تضمین می‌کند فقط یکی پیش‌فرض بماند؛ اینجا فقط شکل داده
   * سنجیده می‌شود.
   */
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class UpdatePriceLevelDto {
  @IsOptional()
  @trimmed
  @IsString()
  @IsNotEmpty({ message: 'نام سطح قیمت نمی‌تواند خالی باشد' })
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @trimmed
  @IsString()
  @MaxLength(300)
  description?: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

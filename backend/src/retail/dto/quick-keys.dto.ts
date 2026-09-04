import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/** رنگ هگز — رابط انتخابگر رنگ می‌دهد، ولی API هر رشته‌ای می‌گیرد. */
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export class QuickKeyGroupDto {
  @IsString()
  @IsNotEmpty({ message: 'نام گروه را وارد کنید' })
  @MaxLength(40)
  name!: string;

  @IsOptional()
  @Matches(HEX_COLOR, { message: 'رنگ باید به شکل #RRGGBB باشد' })
  color?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(999)
  sortOrder?: number;
}

export class UpdateQuickKeyGroupDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  name?: string;

  @IsOptional()
  @Matches(HEX_COLOR, { message: 'رنگ باید به شکل #RRGGBB باشد' })
  color?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(999)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class QuickKeyDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  groupId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  productId!: string;

  /**
   * برچسب روی دکمه.
   *
   * نام کالا در سامانه ممکن است «برنج هاشمی درجه یک ۱۰ کیلویی» باشد؛
   * روی دکمهٔ صندوق باید «برنج ۱۰ک» بنویسد وگرنه جا نمی‌شود.
   */
  @IsOptional()
  @IsString()
  @MaxLength(24)
  label?: string;

  @IsOptional()
  @Matches(HEX_COLOR, { message: 'رنگ باید به شکل #RRGGBB باشد' })
  color?: string;

  /**
   * مقدار پیش‌فرض.
   *
   * نان یک عدد نیست، ده تاست.  سقف ۱۰۰۰ چون بیشتر از آن یعنی اشتباه
   * تایپی، و دکمه‌ای که هزار عدد اضافه کند فاکتور را خراب می‌کند.
   */
  @IsOptional()
  @IsNumber()
  @Min(0.001)
  @Max(1000)
  defaultQty?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(999)
  sortOrder?: number;
}

class ReorderItem {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  id!: string;

  @IsInt()
  @Min(0)
  @Max(999)
  sortOrder!: number;
}

export class ReorderQuickKeysDto {
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => ReorderItem)
  items!: ReorderItem[];
}

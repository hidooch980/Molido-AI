import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * انبار.
 *
 * تا امروز این مسیر هیچ اعتبارسنجی‌ای نداشت: نام خالی و کدِ نداده‌شده
 * هر دو تا لایهٔ دیتابیس می‌رفتند و آنجا با «null value in column code
 * violates not-null constraint» می‌شکستند — یعنی کاربر ۵۰۰ می‌گرفت و
 * هیچ‌وقت نمی‌فهمید چه چیزی کم بوده.
 */
export class CreateWarehouseDto {
  @IsString()
  @IsNotEmpty({ message: 'نام انبار الزامی است' })
  @MaxLength(120)
  name!: string;

  /**
   * کد انبار.
   *
   * اختیاری در API ولی `NOT NULL` در دیتابیس: اگر ندهند، سرویس از نام
   * می‌سازدش.  اجباری کردنش در فرم، کاربری را که فقط «انبار دوم» را
   * می‌خواهد اضافه کند، سر یک میدان بی‌اهمیت متوقف می‌کرد.
   */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsString()
  branchId?: string;
}

export class UpdateWarehouseDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'نام انبار نمی‌تواند خالی باشد' })
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

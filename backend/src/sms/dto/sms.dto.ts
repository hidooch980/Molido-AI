import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

/** بلندترین پیامکی که منطقی است فرستاده شود — حدود ۱۰ قبض فارسی. */
const MAX_BODY = 700;

/**
 * سقف گیرندگان در یک درخواست.
 *
 * نه محدودیت فنی، بلکه محافظ: اگر روزی کسی صد هزار شماره در یک
 * درخواست بفرستد، هم اتصال منقضی می‌شود و هم نیمه‌کاره می‌ماند.
 */
const MAX_RECIPIENTS = 5000;

export class SmsSendDto {
  @IsString()
  @IsNotEmpty({ message: 'متن پیام را وارد کنید' })
  @MaxLength(MAX_BODY, { message: 'متن پیام بیش از حد بلند است' })
  body!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_RECIPIENTS)
  @IsString({ each: true })
  phones?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_RECIPIENTS)
  @IsString({ each: true })
  customerIds?: string[];

  /** متغیرهای مشترک قالب، مثل `{code}` یا `{pct}`. */
  @IsOptional()
  @IsObject()
  vars?: Record<string, string>;

  @IsOptional()
  @IsIn(['MANUAL', 'CAMPAIGN', 'ORDER', 'SYSTEM'])
  kind?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  campaignId?: string;

  /**
   * کلید یکتاسازی.
   *
   * با همین کلید، اجرای دوبارهٔ همان ارسال پیام تکراری نمی‌سازد —
   * محافظت در سطح دیتابیس است، نه حافظهٔ برنامه.
   */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  dedupeKey?: string;

  /**
   * سقف ایمنی گیرندگان.
   *
   * کاربر عدد مورد انتظارش را می‌نویسد؛ اگر انتخاب مخاطب اشتباه شده
   * باشد و تعداد بیشتر درآید، ارسال انجام نمی‌شود.  پیامک فرستاده‌شده
   * برنمی‌گردد.
   */
  @IsOptional()
  @IsInt()
  @Min(1)
  maxRecipients?: number;
}

export class SmsPreviewDto {
  @IsString()
  @IsNotEmpty({ message: 'متن پیام را وارد کنید' })
  @MaxLength(MAX_BODY)
  body!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_RECIPIENTS)
  @IsString({ each: true })
  phones?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_RECIPIENTS)
  @IsString({ each: true })
  customerIds?: string[];

  @IsOptional()
  @IsObject()
  vars?: Record<string, string>;
}

export class SmsTemplateDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  id?: string;

  @IsString()
  @IsNotEmpty({ message: 'نام قالب را وارد کنید' })
  @MaxLength(80)
  name!: string;

  @IsString()
  @IsNotEmpty({ message: 'متن قالب را وارد کنید' })
  @MaxLength(MAX_BODY)
  body!: string;
}

export class SmsOptOutDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  phone!: string;

  /** `false` یعنی مشتری دوباره مایل به دریافت است. */
  @IsOptional()
  @IsBoolean()
  optOut?: boolean;
}

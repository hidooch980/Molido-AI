import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

class InquiryItemDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  productId!: string;

  /**
   * سقف ۱۰۰٬۰۰۰ واحد.
   *
   * بیشتر از این در یک قلمِ استعلام یعنی اشتباه تایپی — و اشتباهی که
   * تا فاکتور خرید برود، سفارشی می‌سازد که انبار جا ندارد.
   */
  @IsNumber()
  @Min(0.001)
  @Max(100_000)
  qty!: number;
}

export class CreateInquiryDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  warehouseId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'استعلام بدون قلم معنا ندارد' })
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => InquiryItemDto)
  items!: InquiryItemDto[];
}

class QuoteDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  productId!: string;

  @IsNumber()
  @Min(1)
  @Max(1_000_000_000_000)
  unitPrice!: number;

  /** موجودی تأمین‌کننده؛ نیامدنش یعنی «نگفت»، نه «ندارد». */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100_000_000)
  availableQty?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  leadDays?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}

export const CALL_STATUSES = [
  'PENDING',
  'RINGING',
  'ANSWERED',
  'QUOTED',
  'NO_ANSWER',
  'REFUSED',
  'FAILED',
] as const;

export class RecordCallDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  supplierId!: string;

  @IsOptional()
  @IsIn(CALL_STATUSES as unknown as string[], { message: 'وضعیت تماس معتبر نیست' })
  status?: string;

  /**
   * دستی یا ویپ.
   *
   * تفکیکش لازم است: قیمتی که اپراتور انسانی شنیده با قیمتی که موتور
   * گفتار استخراج کرده، اعتبار یکسان ندارند — و اگر روزی قیمتی غلط
   * درآمد، باید بشود فهمید از کدام مسیر آمده.
   */
  @IsOptional()
  @IsIn(['MANUAL', 'VOIP'], { message: 'کانال تماس معتبر نیست' })
  channel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  /** متن مکالمه — با ویپ از موتور گفتار می‌آید، دستی از یادداشت اپراتور. */
  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  transcript?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(7200)
  durationSec?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => QuoteDto)
  quotes?: QuoteDto[];
}

export class VoipSettingDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  provider?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  callerId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  apiKey?: string;

  /**
   * سقف تماس در هر دور.
   *
   * محافظ، نه محدودیت فنی: استعلامی که به دویست بنکدار زنگ بزند، هم
   * هزینهٔ تماس دارد و هم اعتبار فروشگاه را می‌برد.
   */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  maxCallsPerRun?: number;
}

/**
 * درخواست شماره‌گیری با بنکدار.
 *
 * ⚠️ شمارهٔ تلفن عمداً **در این DTO نیست**.
 *
 *    شماره از رکورد تأمین‌کننده خوانده می‌شود.  اگر اینجا می‌آمد، هر
 *    کاربرِ واردشده می‌توانست هر شماره‌ای را با خطِ فروشگاه بگیرد —
 *    یعنی سامانه به یک شماره‌گیرِ انبوه بدل می‌شد.
 */
export class DialSupplierDto {
  @IsString()
  @IsNotEmpty({ message: 'تأمین‌کننده مشخص نشده است' })
  supplierId!: string;

  /**
   * داخلیِ خودِ اپراتور.
   *
   * مرکز اول به او زنگ می‌زند و وقتی برداشت شمارهٔ بنکدار را می‌گیرد.
   * برعکسش یعنی بنکدار گوشی را برمی‌دارد و کسی آن‌طرف نیست.
   */
  @IsString()
  @IsNotEmpty({ message: 'داخلی اپراتور مشخص نشده است' })
  @MaxLength(20)
  extension!: string;
}

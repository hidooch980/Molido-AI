import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { DIALECTS } from '../voice.service';

/**
 * رشتهٔ خالی یعنی «نگفتم»، نه «خالی».
 *
 * `?dialect=` و نبودنِ `dialect` یک معنی دارند و باید یک رفتار داشته
 * باشند.  بدون این، اعتبارسنجی رشتهٔ خالی را رد می‌کند در حالی که
 * `scopeOf` آن را پیش‌فرض می‌گیرد — دو قانون برای یک چیز، که همیشه
 * سرِ بزنگاه از هم جدا می‌افتند.
 */
const emptyToUndefined = Transform(({ value }: { value: unknown }) =>
  typeof value === 'string' && !value.trim() ? undefined : value,
);

/** فاصله‌های ابتدا و انتها حذف می‌شوند پیش از اینکه «خالی نباشد» سنجیده شود. */
const trimmed = Transform(({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value,
);

/**
 * پارامترهای مشترک همهٔ مسیرها.
 *
 * جدا نگه داشته شده تا گویشِ نامعتبر در **همان لبه** رد شود، نه بعد از
 * اینکه سیصد عبارت در گویش اشتباه ساخته شد.
 */
export class ScopeQueryDto {
  @IsOptional()
  @emptyToUndefined
  @IsString()
  @MaxLength(8)
  lang?: string;

  @IsOptional()
  @emptyToUndefined
  @IsIn(DIALECTS as unknown as string[], {
    message: `گویش باید یکی از ${DIALECTS.join('، ')} باشد`,
  })
  dialect?: string;
}

export class ImportDictionaryDto extends ScopeQueryDto {
  /**
   * محتوای CSV.
   *
   * سقف دو مگابایت: واژه‌نامهٔ متنی بزرگ‌تر از این وجود ندارد، و
   * چیزی که بزرگ‌تر باشد یا فایل اشتباه است یا حمله.
   */
  @IsString()
  @IsNotEmpty({ message: 'فایل واژه‌نامه خالی است' })
  @MaxLength(2_000_000, { message: 'فایل واژه‌نامه بیش از حد بزرگ است' })
  csv!: string;
}

export class SetTargetDto {
  /**
   * متن بلوچی.
   *
   * خالی مجاز است — یعنی «این را پاک کن».  بازبینی که نمی‌تواند
   * حدسِ اشتباه را پس بگیرد، بازبینی نیست.
   */
  @IsString()
  @MaxLength(200)
  textTarget!: string;
}

export class AddSampleDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  phraseId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  audioUrl!: string;

  /**
   * برچسب گوینده.
   *
   * نام واقعی نیست و نباید باشد: برای شمردنِ «چند گویندهٔ متفاوت» فقط
   * تفکیک لازم است، و نگه‌داشتن نام، دادهٔ شخصی می‌سازد که دلیلی ندارد.
   */
  @trimmed
  @IsString()
  // فقط فاصله، برچسب نیست: گویندهٔ «   » از گویندهٔ «  » جدا شمرده
  // می‌شود و پیکره‌ای می‌سازد که آمارش می‌گوید سه گوینده دارد و ندارد.
  @IsNotEmpty({ message: 'برچسب گوینده لازم است' })
  @MaxLength(40)
  speakerTag!: string;

  /**
   * سقف ۳۰ ثانیه، کف ۲۰۰ میلی‌ثانیه — همان بازه‌ای که در دیتابیس
   * هم اجبار شده.  ضبط کوتاه‌تر معمولاً کلیک دکمه است و بلندتر یعنی
   * میکروفن باز مانده.
   */
  @IsOptional()
  @IsInt()
  @Min(201)
  @Max(29_999)
  durationMs?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20_000_000)
  sizeBytes?: number;
}

export class ReviewSampleDto {
  @IsBoolean()
  approved!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}

/**
 * فهرست عبارت‌ها با پیشرفتِ یک گویندهٔ مشخص.
 *
 * جدا از `ScopeQueryDto` است چون فقط حالت ضبط پیوسته لازمش دارد؛
 * بقیهٔ مسیرها نباید پارامتری بگیرند که استفاده نمی‌کنند.
 */
export class PhrasesQueryDto extends ScopeQueryDto {
  @IsOptional()
  @trimmed
  @IsString()
  @MaxLength(40)
  speakerTag?: string;
}

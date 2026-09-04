import { IsString, MinLength, MaxLength } from 'class-validator';

export class ChangePasswordDto {
  /**
   * رمز فعلی — لازم است حتی وقتی کاربر وارد شده.
   *
   * بدون آن، هر نشستِ باز مانده روی صندوق کافی است تا کسی رمز صاحب
   * فروشگاه را عوض کند و خودش را بیرون بیندازد.
   */
  @IsString()
  @MinLength(1, { message: 'رمز فعلی را وارد کنید' })
  currentPassword!: string;

  /**
   * حداقل ۸ نویسه.  کوتاه‌تر از این روی فروشگاهی که پنلش روی شبکهٔ محلی
   * باز است، با چند دقیقه امتحان کردن شکسته می‌شود.
   */
  @IsString()
  @MinLength(8, { message: 'رمز تازه باید دست‌کم ۸ نویسه باشد' })
  @MaxLength(72, { message: 'رمز تازه بیش از حد بلند است' })
  newPassword!: string;
}

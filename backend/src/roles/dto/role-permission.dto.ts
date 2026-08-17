import { IsBoolean, IsIn, IsNotEmpty, IsString, MaxLength } from 'class-validator';

import { ROLE_LABELS } from '../permission-catalog';

const ROLE_CODES = ROLE_LABELS.map((r) => r.code);

export class SetRolePermissionDto {
  /**
   * نقش — فقط از فهرست شناخته‌شده.
   *
   * رشتهٔ آزاد یعنی ردیفی ساخته می‌شود که هیچ کاربری آن نقش را ندارد،
   * و مدیر فکر می‌کند تنظیمش اثر کرده در حالی که هیچ‌جا خوانده نمی‌شود.
   */
  @IsString()
  @IsIn(ROLE_CODES, { message: 'نقش شناخته نشد' })
  role!: string;

  @IsString()
  @IsNotEmpty({ message: 'اختیار مشخص نشده است' })
  @MaxLength(80)
  permission!: string;

  /** `true` می‌دهد، `false` می‌گیرد.  برای «پیش‌فرض» از DELETE استفاده شود. */
  @IsBoolean({ message: 'مقدار باید بله یا خیر باشد' })
  allowed!: boolean;
}

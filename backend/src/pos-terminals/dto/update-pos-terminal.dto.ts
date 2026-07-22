import { IsIn, IsOptional, IsString, Matches } from 'class-validator';

export class UpdatePosTerminalDto {
  @IsOptional()
  @IsString()
  serialNo?: string;

  @IsOptional()
  @IsString()
  merchantId?: string;

  @IsOptional()
  @IsString()
  bankName?: string;

  @IsOptional()
  @IsString()
  pspName?: string;

  @IsOptional()
  @IsIn(['FIXED', 'MOBILE'], {
    message: 'نوع کارت‌خوان باید FIXED یا MOBILE باشد',
  })
  type?: string;

  @IsOptional()
  @IsString()
  accountNo?: string;

  @IsOptional()
  @Matches(/^IR[0-9]{24}$/, {
    message: 'شماره شبا باید با IR شروع شود و ۲۴ رقم داشته باشد',
  })
  iban?: string;

  @IsOptional()
  @IsString()
  holderName?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsString()
  simNumber?: string;

  @IsOptional()
  @IsString()
  cashBoxId?: string | null;

  @IsOptional()
  @IsString()
  installedAt?: string;

  @IsOptional()
  @IsString()
  note?: string;
}

export class UpdatePosStatusDto {
  @IsIn(['ACTIVE', 'INACTIVE', 'UNDER_REPAIR', 'RETURNED'], {
    message: 'وضعیت نامعتبر است',
  })
  status!: string;
}

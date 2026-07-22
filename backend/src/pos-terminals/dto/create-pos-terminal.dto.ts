import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';

export class CreatePosTerminalDto {
  @IsString()
  @IsNotEmpty({ message: 'شماره پایانه الزامی است' })
  terminalNo!: string;

  @IsOptional()
  @IsString()
  serialNo?: string;

  @IsOptional()
  @IsString()
  merchantId?: string;

  @IsString()
  @IsNotEmpty({ message: 'نام بانک الزامی است' })
  bankName!: string;

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
  cashBoxId?: string;

  @IsOptional()
  @IsString()
  installedAt?: string;

  @IsOptional()
  @IsString()
  note?: string;
}

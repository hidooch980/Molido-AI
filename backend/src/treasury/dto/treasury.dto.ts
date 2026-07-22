import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  Min,
} from 'class-validator';

export class CreateTreasuryAccountDto {
  @IsString()
  @IsNotEmpty({ message: 'نام حساب الزامی است' })
  name!: string;

  @IsOptional()
  @IsIn(['BANK', 'CASH', 'FUND'], { message: 'نوع حساب نامعتبر است' })
  type?: string;

  @IsOptional()
  @IsString()
  bankName?: string;

  @IsOptional()
  @IsString()
  accountNo?: string;

  @IsOptional()
  @Matches(/^IR[0-9]{24}$/, {
    message: 'شماره شبا باید با IR شروع شود و ۲۴ رقم داشته باشد',
  })
  iban?: string;

  @IsOptional()
  @IsNumber({}, { message: 'موجودی اولیه باید عدد باشد' })
  @Min(0, { message: 'موجودی اولیه نمی‌تواند منفی باشد' })
  openingBalance?: number;

  @IsOptional()
  @IsString()
  note?: string;
}

export class UpdateTreasuryAccountDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsIn(['BANK', 'CASH', 'FUND'], { message: 'نوع حساب نامعتبر است' })
  type?: string;

  @IsOptional()
  @IsString()
  bankName?: string;

  @IsOptional()
  @IsString()
  accountNo?: string;

  @IsOptional()
  @Matches(/^IR[0-9]{24}$/, {
    message: 'شماره شبا باید با IR شروع شود و ۲۴ رقم داشته باشد',
  })
  iban?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  note?: string;
}

export class CreateTreasuryTransactionDto {
  @IsString()
  @IsNotEmpty({ message: 'شناسه حساب الزامی است' })
  accountId!: string;

  @IsIn(['DEPOSIT', 'WITHDRAWAL'], {
    message: 'نوع تراکنش باید DEPOSIT یا WITHDRAWAL باشد',
  })
  type!: string;

  @IsNumber({}, { message: 'مبلغ باید عدد باشد' })
  @IsPositive({ message: 'مبلغ باید بزرگ‌تر از صفر باشد' })
  amount!: number;

  @IsOptional()
  @IsString()
  reference?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  date?: string;
}

export class TransferDto {
  @IsString()
  @IsNotEmpty({ message: 'حساب مبدأ الزامی است' })
  fromAccountId!: string;

  @IsString()
  @IsNotEmpty({ message: 'حساب مقصد الزامی است' })
  toAccountId!: string;

  @IsNumber({}, { message: 'مبلغ باید عدد باشد' })
  @IsPositive({ message: 'مبلغ باید بزرگ‌تر از صفر باشد' })
  amount!: number;

  @IsOptional()
  @IsString()
  description?: string;
}

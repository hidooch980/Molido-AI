import {
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
} from 'class-validator';

const CONTRACT_TYPES = [
  'PURCHASE',
  'SALE',
  'SERVICE',
  'CONSTRUCTION',
  'EMPLOYMENT',
  'RENT',
  'OTHER',
];

const CONTRACT_STATUSES = [
  'DRAFT',
  'ACTIVE',
  'SUSPENDED',
  'COMPLETED',
  'TERMINATED',
];

export class CreateContractDto {
  @IsString()
  @IsNotEmpty({ message: 'شماره قرارداد الزامی است' })
  contractNo!: string;

  @IsString()
  @IsNotEmpty({ message: 'عنوان قرارداد الزامی است' })
  title!: string;

  @IsOptional()
  @IsIn(CONTRACT_TYPES, { message: 'نوع قرارداد نامعتبر است' })
  type?: string;

  @IsString()
  @IsNotEmpty({ message: 'نام طرف قرارداد الزامی است' })
  partyName!: string;

  @IsOptional()
  @IsString()
  partyPhone?: string;

  @IsOptional()
  @IsString()
  partyNationalId?: string;

  @IsOptional()
  @IsNumber({}, { message: 'مبلغ باید عدد باشد' })
  @Min(0, { message: 'مبلغ نمی‌تواند منفی باشد' })
  amount?: number;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateContractDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsIn(CONTRACT_TYPES, { message: 'نوع قرارداد نامعتبر است' })
  type?: string;

  @IsOptional()
  @IsString()
  partyName?: string;

  @IsOptional()
  @IsString()
  partyPhone?: string;

  @IsOptional()
  @IsString()
  partyNationalId?: string;

  @IsOptional()
  @IsNumber({}, { message: 'مبلغ باید عدد باشد' })
  @Min(0, { message: 'مبلغ نمی‌تواند منفی باشد' })
  amount?: number;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateContractStatusDto {
  @IsIn(CONTRACT_STATUSES, { message: 'وضعیت قرارداد نامعتبر است' })
  status!: string;
}

export class AddContractPaymentDto {
  @IsNumber({}, { message: 'مبلغ باید عدد باشد' })
  @IsPositive({ message: 'مبلغ باید بزرگ‌تر از صفر باشد' })
  amount!: number;

  @IsString()
  @IsNotEmpty({ message: 'تاریخ سررسید الزامی است' })
  dueDate!: string;

  @IsOptional()
  @IsString()
  note?: string;
}

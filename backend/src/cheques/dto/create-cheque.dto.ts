import {
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
} from 'class-validator';

export class CreateChequeDto {
  @IsString()
  @IsNotEmpty({ message: 'شماره چک الزامی است' })
  chequeNo!: string;

  @IsOptional()
  @IsString()
  bankName?: string;

  @IsString()
  @IsNotEmpty({ message: 'تاریخ سررسید الزامی است' })
  dueDate!: string;

  @IsNumber({}, { message: 'مبلغ باید عدد باشد' })
  @IsPositive({ message: 'مبلغ باید بزرگ‌تر از صفر باشد' })
  amount!: number;

  @IsOptional()
  @IsIn(['RECEIVED', 'ISSUED'], { message: 'نوع چک نامعتبر است' })
  type?: string;

  @IsOptional()
  @IsString()
  ownerName?: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsString()
  saleId?: string;
}

export class UpdateChequeStatusDto {
  @IsString()
  @IsNotEmpty({ message: 'وضعیت الزامی است' })
  status!: string;
}

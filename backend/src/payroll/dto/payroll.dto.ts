import {
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Min,
} from 'class-validator';

export class CreateEmployeeDto {
  @IsString()
  @IsNotEmpty({ message: 'شماره پرسنلی الزامی است' })
  employeeNo!: string;

  @IsString()
  @IsNotEmpty({ message: 'نام الزامی است' })
  firstName!: string;

  @IsString()
  @IsNotEmpty({ message: 'نام خانوادگی الزامی است' })
  lastName!: string;

  @IsOptional()
  @IsString()
  nationalId?: string;

  @IsOptional()
  @IsString()
  position?: string;

  @IsOptional()
  @IsString()
  department?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  hireDate?: string;

  @IsNumber({}, { message: 'حقوق پایه باید عدد باشد' })
  @Min(0, { message: 'حقوق پایه نمی‌تواند منفی باشد' })
  baseSalary!: number;

  @IsOptional()
  @IsNumber({}, { message: 'حق مسکن باید عدد باشد' })
  @Min(0)
  housingAllowance?: number;

  @IsOptional()
  @IsNumber({}, { message: 'بن خواروبار باید عدد باشد' })
  @Min(0)
  foodAllowance?: number;

  @IsOptional()
  @IsString()
  note?: string;
}

export class UpdateEmployeeDto {
  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsString()
  nationalId?: string;

  @IsOptional()
  @IsString()
  position?: string;

  @IsOptional()
  @IsString()
  department?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  hireDate?: string;

  @IsOptional()
  @IsNumber({}, { message: 'حقوق پایه باید عدد باشد' })
  @Min(0, { message: 'حقوق پایه نمی‌تواند منفی باشد' })
  baseSalary?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  housingAllowance?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  foodAllowance?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  note?: string;
}

export class CreatePayrollSlipDto {
  @IsString()
  @IsNotEmpty({ message: 'شناسه کارمند الزامی است' })
  employeeId!: string;

  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, {
    message: 'دوره باید به فرمت YYYY-MM باشد (مثلاً 2026-07)',
  })
  period!: string;

  @IsOptional()
  @IsNumber({}, { message: 'ساعات اضافه‌کاری باید عدد باشد' })
  @Min(0)
  overtimeHours?: number;

  @IsOptional()
  @IsNumber({}, { message: 'نرخ اضافه‌کاری باید عدد باشد' })
  @Min(0)
  overtimeRate?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  bonus?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  deductions?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  insurance?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  tax?: number;

  @IsOptional()
  @IsString()
  note?: string;
}

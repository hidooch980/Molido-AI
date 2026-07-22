import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateComplaintDto {
  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  citizenName?: string;

  @IsOptional()
  @IsString()
  citizenPhone?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsString()
  @IsNotEmpty({ message: 'موضوع پیام الزامی است' })
  subject!: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class ReferComplaintDto {
  @IsString()
  @IsNotEmpty({ message: 'واحد گیرنده الزامی است' })
  referredTo!: string;
}

export class UpdateComplaintStatusDto {
  @IsString()
  @IsNotEmpty({ message: 'وضعیت الزامی است' })
  status!: string;

  @IsOptional()
  @IsString()
  responseNote?: string;
}

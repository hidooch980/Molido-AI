import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, Length, MaxLength, MinLength } from 'class-validator';
import { MAX_EMAIL_LENGTH, MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from '@molido/security';

/**
 * Every field is explicitly declared and explicitly bounded.
 *
 * Combined with `whitelist` + `forbidNonWhitelisted` on the global validation
 * pipe, an undeclared property is not merely ignored — the request is rejected.
 * That is what closes off mass assignment: a client cannot smuggle `status`,
 * `roles` or `passwordHash` into a registration payload.
 */
export class RegisterDto {
  @ApiProperty({ example: 'founder@molido.ai', maxLength: MAX_EMAIL_LENGTH })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail({}, { message: 'A valid email address is required' })
  @MaxLength(MAX_EMAIL_LENGTH)
  email!: string;

  @ApiProperty({ minLength: MIN_PASSWORD_LENGTH, maxLength: MAX_PASSWORD_LENGTH })
  @IsString()
  @MinLength(MIN_PASSWORD_LENGTH, {
    message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters long`,
  })
  @MaxLength(MAX_PASSWORD_LENGTH)
  password!: string;

  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  displayName?: string;

  @ApiPropertyOptional({ description: 'Non-authoritative client device hint.', maxLength: 128 })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  deviceId?: string;
}

export class LoginDto {
  @ApiProperty({ example: 'founder@molido.ai' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail({}, { message: 'A valid email address is required' })
  @MaxLength(MAX_EMAIL_LENGTH)
  email!: string;

  @ApiProperty()
  @IsString()
  // Deliberately not length-validated against the password policy: telling a
  // caller their password is "too short to be valid" on the login form leaks
  // policy detail and helps nobody.
  @MaxLength(MAX_PASSWORD_LENGTH)
  password!: string;

  @ApiPropertyOptional({ maxLength: 128 })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  deviceId?: string;
}

export class RefreshDto {
  @ApiProperty({ description: 'The opaque refresh token issued at login.' })
  @IsString()
  @Length(16, 512)
  refreshToken!: string;
}

export class LogoutDto {
  @ApiPropertyOptional({
    description: 'Refresh token to revoke. Omit to revoke only the current access session.',
  })
  @IsOptional()
  @IsString()
  @Length(16, 512)
  refreshToken?: string;
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

/** Agents a client may request. Rejecting unknown keys at the edge keeps a
 *  typo from reaching the orchestrator as a database lookup. */
const AVAILABLE_AGENTS = ['research'] as const;

export class CreateAiTaskDto {
  @ApiProperty({ enum: AVAILABLE_AGENTS, example: 'research' })
  @IsString()
  @IsIn(AVAILABLE_AGENTS, { message: `agent must be one of: ${AVAILABLE_AGENTS.join(', ')}` })
  agent!: string;

  @ApiProperty({
    example: 'Explain the trade-offs of running AI models locally versus hosted.',
    minLength: 3,
    maxLength: 4000,
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(3)
  // Bounded to the database column width, so an oversized goal is a validation
  // error rather than a truncation surprise.
  @MaxLength(4000)
  input!: string;
}

export class ListAiTasksDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

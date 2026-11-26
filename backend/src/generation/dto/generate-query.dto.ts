import { Type } from 'class-transformer';
import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

export const DEFAULT_HEIGHT = 60;

export class GenerateQueryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  @Matches(/^[^\p{Cc}\p{Cf}]+$/u)
  left!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  @Matches(/^[^\p{Cc}\p{Cf}]+$/u)
  right!: string;

  @IsOptional()
  @IsIn(['hermit-frame'])
  style: string = 'hermit-frame';

  @IsOptional()
  @IsIn(['png', 'webp'])
  format: string = 'png';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  height: number = DEFAULT_HEIGHT;
}

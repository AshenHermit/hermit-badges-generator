import { IsIn, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

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
  @IsIn(['png'])
  format: string = 'png';
}

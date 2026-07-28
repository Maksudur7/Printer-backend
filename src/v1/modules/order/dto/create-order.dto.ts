import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateOrderDto {
  @IsString()
  @IsNotEmpty()
  kioskId: string;

  @IsString()
  @IsOptional()
  userId?: string;

  @IsString()
  @IsOptional()
  userEmail?: string;

  @IsString()
  @IsOptional()
  userPhone?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  pageCount?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  copyCount?: number;

  @IsBoolean()
  @IsOptional()
  isColor?: boolean;

  @IsBoolean()
  @IsOptional()
  isDuplex?: boolean;

  @IsString()
  @IsOptional()
  orientation?: string;
}

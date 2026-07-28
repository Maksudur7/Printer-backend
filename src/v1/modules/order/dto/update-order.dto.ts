import { IsBoolean, IsEnum, IsInt, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { PrintStatus, PaymentStatus } from '@prisma/client';

export class UpdateOrderDto {
  @IsEnum(PrintStatus)
  @IsOptional()
  printStatus?: PrintStatus;

  @IsEnum(PaymentStatus)
  @IsOptional()
  paymentStatus?: PaymentStatus;

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
}

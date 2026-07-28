import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class UpdateKioskStatusDto {
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  paperLevel?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  inkLevel?: number;
}
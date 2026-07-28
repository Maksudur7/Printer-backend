import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateKioskDto {
    @IsString()
    @IsNotEmpty()
    name: string;

    @IsString()
    @IsNotEmpty()
    deviceId: string;

    @IsString()
    @IsOptional()
    location?: string;
}

import { Controller, Get, Post, Body } from '@nestjs/common';
import { ConfigService } from './config.service';

@Controller('v1/config')
export class ConfigController {
  constructor(private readonly configService: ConfigService) {}

  @Get()
  getConfig() {
    return this.configService.get();
  }

  @Post()
  updateConfig(@Body() data: any) {
    return this.configService.update(data);
  }
}

import { Module } from '@nestjs/common';
import { PrintGateway } from './print.gateway';

@Module({
  providers: [PrintGateway],
  exports: [PrintGateway], // Other modules use korte parbe
})
export class PrintGatewayModule {}

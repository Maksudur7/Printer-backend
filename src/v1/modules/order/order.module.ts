import { Module } from '@nestjs/common';
import { OrderService } from './order.service';
import { OrderController } from './order.controller';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { PrintGatewayModule } from '../print-gateway/print-gateway.module';

@Module({
  imports: [PrintGatewayModule], // PrintGateway use korar jonno
  controllers: [OrderController],
  providers: [OrderService, PrismaService],
})
export class OrderModule {}

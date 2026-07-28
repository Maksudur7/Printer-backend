import { Module } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { PrintGatewayModule } from '../print-gateway/print-gateway.module';

@Module({
  imports: [PrintGatewayModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, PrismaService],
})
export class PaymentsModule {}

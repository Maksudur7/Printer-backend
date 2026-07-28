import { Controller, Get, Post, Body, Param, Res, Query, NotFoundException } from '@nestjs/common';
import { PaymentsService } from './payments.service';

@Controller('v1/payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) { }

  @Post('init/:orderId')
  async initPayment(@Param('orderId') orderId: string) {
    return this.paymentsService.initPayment(orderId);
  }

  @Get('success')
  async paymentSuccess(
    @Query('session_id') session_id: string,
    @Query('orderId') orderId: string,
    @Res() res: any
  ) {
    if (!session_id || !orderId) {
      throw new NotFoundException('Missing payment details');
    }

    const result = await this.paymentsService.paymentSuccess({ session_id, orderId });
    const frontendUrl = process.env.FRONTEND_URL || 'https://printer-client.vercel.app';

    return res.redirect(`${frontendUrl}/payment/success?orderId=${result.orderId}`);
  }

  @Get()
  findAll() {
    return this.paymentsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.paymentsService.findOne(id);
  }
}

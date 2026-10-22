import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';
import Stripe from 'stripe';
import { PrintGateway } from '../print-gateway/print.gateway';

@Injectable()
export class PaymentsService {
  private stripe: any;
  private readonly appUrl = process.env.APP_URL || 'https://printer-project-production.up.railway.app';
  private readonly frontendUrl = process.env.FRONTEND_URL || 'https://printer-client.vercel.app';

  constructor(
    private readonly prisma: PrismaService,
    private readonly printGateway: PrintGateway,
  ) {
    this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
      apiVersion: '2025-01-27' as any,
    });
  }

  async initPayment(orderId: string, method?: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.paymentStatus === 'COMPLETED') {
      throw new BadRequestException('Order is already paid');
    }

    const selectedMethod = (method || 'STRIPE').toUpperCase();

    // If Stripe key is missing or not card payment, allow simulation / gateway redirect fallback
    if (!process.env.STRIPE_SECRET_KEY || selectedMethod !== 'STRIPE') {
      // Record payment attempt in DB
      await this.prisma.payment.create({
        data: {
          orderId: order.id,
          amount: order.totalAmount || 0,
          method: (selectedMethod in ['CASH', 'BKASH', 'NAGAD', 'SSLCOMMERZ', 'STRIPE'] ? selectedMethod : 'STRIPE') as any,
          transactionId: `TXN-${Date.now()}-${order.id.slice(0, 8)}`,
        },
      });

      return {
        message: 'Payment initiated successfully',
        paymentUrl: null,
        url: null,
        success: true,
      };
    }

    // Stripe checkout session তৈরি করা
    try {
      const session = await this.stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: 'bdt',
              product_data: {
                name: `Printing Service - Order #${order.id.slice(0, 8)}`,
                description: `File: ${order.fileName}, Pages: ${order.pageCount}`,
              },
              unit_amount: Math.round((order.totalAmount || 0) * 100), // Stripe expects amount in cents
            },
            quantity: 1,
          },
        ],
        mode: 'payment',
        success_url: `${this.appUrl}/v1/payments/success?session_id={CHECKOUT_SESSION_ID}&orderId=${orderId}`,
        cancel_url: `${this.frontendUrl}/checkout?orderId=${orderId}&status=cancelled`,
        metadata: {
          orderId: orderId,
        },
      });

      // পেমেন্ট রেকর্ড তৈরি করা
      await this.prisma.payment.create({
        data: {
          orderId: order.id,
          amount: order.totalAmount || 0,
          method: 'STRIPE',
          transactionId: session.id,
        },
      });

      return {
        url: session.url,
        paymentUrl: session.url,
        message: 'Payment session created',
        success: true,
      };
    } catch (error) {
      throw new BadRequestException(`Stripe Error: ${error.message}`);
    }
  }

  async paymentSuccess(payload: any) {
    const { session_id, orderId } = payload;

    try {
      // ১. সেশন ভেরিফাই করা
      const session = await this.stripe.checkout.sessions.retrieve(session_id);

      if (session.payment_status === 'paid') {
        // ২. অর্ডার এবং পেমেন্ট স্ট্যাটাস আপডেট করা
        const updatedOrder = await this.prisma.$transaction(async (prisma) => {
          return await prisma.order.update({
            where: { id: orderId },
            data: {
              paymentStatus: 'COMPLETED',
              printStatus: 'QUEUED',
              paidAmount: (session.amount_total || 0) / 100, // cents to BDT
            },
          });
        });

        // ৩. কিওস্ক এবং এর printers তথ্য খুঁজে বের করা
        const kiosk: any = await this.prisma.kiosk.findUnique({
          where: { deviceId: updatedOrder.kioskId },
          include: {
            printers: {
              where: { isActive: true },
            },
          },
        });

        let selectedPrinter: any = null;
        if (kiosk?.printers && kiosk.printers.length > 0) {
          if (updatedOrder.isColor) {
            selectedPrinter =
              kiosk.printers.find((p: any) => p.supportsColor) ||
              kiosk.printers[0];
          } else {
            selectedPrinter =
              kiosk.printers.find((p: any) => p.supportsBW) ||
              kiosk.printers[0];
          }
        }

        // ৪. Kiosk software এ socket-এর মাধ্যমে print job পাঠানো
        const jobSent = this.printGateway.sendPrintJob(updatedOrder.kioskId, {
          orderId: updatedOrder.id,
          orderNumber: updatedOrder.orderNumber,
          fileUrl: updatedOrder.fileUrl,
          fileName: updatedOrder.fileName,
          pageCount: updatedOrder.pageCount,
          copyCount: updatedOrder.copyCount,
          isColor: updatedOrder.isColor,
          isDuplex: updatedOrder.isDuplex,
          orientation: updatedOrder.orientation,
          targetPrinter: selectedPrinter?.windowsName || null,
        });

        if (!jobSent) {
          console.warn(
            `Kiosk ${updatedOrder.kioskId} is OFFLINE. Order ${orderId} queued in DB.`,
          );
        }

        return { message: 'Payment successful', orderId };
      }

      throw new BadRequestException('Payment not completed');
    } catch (error) {
      throw new BadRequestException(`Stripe Verification Error: ${error.message}`);
    }
  }

  // To fetch all payments (admin use)
  async findAll() {
    return this.prisma.payment.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async findOne(id: string) {
    const payment = await this.prisma.payment.findUnique({ where: { id } });
    if (!payment) throw new NotFoundException('Payment not found');
    return payment;
  }
}

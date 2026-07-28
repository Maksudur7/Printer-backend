import { BadRequestException, ForbiddenException, Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { UpdateOrderDto } from './dto/update-order.dto';
import { PrintGateway } from '../print-gateway/print.gateway';
import { PDFDocument } from 'pdf-lib';
import * as fs from 'fs';

@Injectable()
export class OrderService {
  private readonly logger = new Logger(OrderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly printGateway: PrintGateway,
  ) { }

  async createOrder(data: any, file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No file uploaded. Please select a file with key "file"');
    }

    // ১. কিওস্ক আছে কি না চেক করো (Foreign Key Error এড়াতে)
    const rawKioskId = (data.kioskId || '').toString().trim();
    console.log(`[ORDER] Creating order for Kiosk: "${rawKioskId}"`);

    const kiosk = await this.prisma.kiosk.findUnique({
      where: { deviceId: rawKioskId },
    });

    if (!kiosk) {
      this.logger.error(`Kiosk not found in DB: "${rawKioskId}"`);
      throw new BadRequestException(`Invalid Kiosk ID: "${rawKioskId}". Please ensure the Kiosk is registered.`);
    }

    let pageCount = parseInt(data.pageCount) || 1;

    // ২. PDF পেজ কাউন্ট (Vercel-এ ফাইল পাথ হ্যান্ডেল করা)
    if (file.mimetype === 'application/pdf') {
      try {
        const dataBuffer = fs.readFileSync(file.path);
        const pdfDoc = await PDFDocument.load(dataBuffer);
        pageCount = pdfDoc.getPageCount();
      } catch (error) {
        console.error('Error parsing PDF:', error);
      }
    }

    const isColor = String(data.isColor).toLowerCase() === 'true';
    const copyCount = parseInt(data.copyCount) || 1;

    const rate = isColor
      ? Number(process.env.PRICE_COLOR) || 5
      : Number(process.env.PRICE_BW) || 2;
    const totalAmount = pageCount * rate * copyCount;

    // ─── ফাইল ইউআরএল জেনারেট করা
    const appUrl = process.env.BACKEND_URL || 'https://printer-project-production.up.railway.app';
    const fileUrl = `${appUrl.replace(/\/$/, '')}/uploads/${file.filename}`;

    const isCashPayment = 
      String(data.paymentMethod).toUpperCase() === 'CASH' || 
      String(data.isCash).toLowerCase() === 'true' ||
      String(data.paymentType).toUpperCase() === 'CASH';

    // ১. কিওস্কের printers লোড করে নেওয়া
    const kioskWithPrinters = await this.prisma.kiosk.findUnique({
      where: { deviceId: kiosk.deviceId },
      include: {
        printers: {
          where: { isActive: true },
        },
      },
    });

    const order = await this.prisma.order.create({
      data: {
        userId: data.userId,
        userEmail: data.userEmail,
        userPhone: data.userPhone,
        kioskId: kiosk.deviceId, // Use validated deviceId
        filePath: file.path,
        fileName: file.originalname,
        fileUrl: fileUrl,
        pageCount: pageCount,
        copyCount: copyCount,
        isColor: isColor,
        isDuplex: String(data.isDuplex).toLowerCase() === 'true',
        orientation: data.orientation || 'portrait',
        totalAmount: totalAmount,
        paymentStatus: isCashPayment ? 'COMPLETED' : 'PENDING',
        printStatus: isCashPayment ? 'QUEUED' : 'WAITING_FOR_PAYMENT',
      },
    });

    // ২. যদি Cash পেমেন্ট হয়, তবে কোনো এপ্রুভাল ছাড়াই সাথে সাথে প্রিন্ট জব কিওস্কে পাঠিয়ে দাও!
    if (isCashPayment) {
      console.log(`[CASH_BYPASS] Instant Printing for Order #${order.orderNumber} (Cash selected, no approval needed)`);

      let selectedPrinter: any = null;
      if (kioskWithPrinters?.printers && kioskWithPrinters.printers.length > 0) {
        if (order.isColor) {
          selectedPrinter =
            kioskWithPrinters.printers.find((p: any) => p.supportsColor) ||
            kioskWithPrinters.printers[0];
        } else {
          selectedPrinter =
            kioskWithPrinters.printers.find((p: any) => p.supportsBW) ||
            kioskWithPrinters.printers[0];
        }
      }

      const jobSent = this.printGateway.sendPrintJob(order.kioskId, {
        orderId: order.id,
        orderNumber: order.orderNumber,
        fileUrl: order.fileUrl,
        fileName: order.fileName,
        pageCount: order.pageCount,
        copyCount: order.copyCount,
        isColor: order.isColor,
        isDuplex: order.isDuplex,
        orientation: order.orientation,
        targetPrinter: selectedPrinter?.windowsName || null,
      });

      if (!jobSent) {
        console.warn(`[CASH_BYPASS] Kiosk ${order.kioskId} is OFFLINE. Order #${order.orderNumber} queued in DB.`);
      }
    }

    return order;
  }

  async getPendingOrders(kioskId: string) {
    return await this.prisma.order.findMany({
      where: {
        kioskId,
        printStatus: 'WAITING_FOR_PAYMENT',
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findAll() {
    return this.prisma.order.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async findOne(id: string) {
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order) throw new NotFoundException(`Order with ID ${id} not found`);
    return order;
  }

  async update(id: string, updateOrderDto: UpdateOrderDto) {
    const order = await this.prisma.order.findUnique({ where: { id } });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (
      updateOrderDto.paymentStatus === 'COMPLETED' &&
      order.paymentStatus !== 'COMPLETED'
    ) {

      const updatedOrder = await this.prisma.order.update({
        where: { id },
        data: {
          ...updateOrderDto,
          printStatus: 'QUEUED',
        },
      });

      const kiosk: any = await this.prisma.kiosk.findUnique({
        where: { deviceId: order.kioskId },
        include: {
          printers: {
            where: { isActive: true },
          },
        },
      });

      let selectedPrinter: any = null;
      if (kiosk?.printers && kiosk.printers.length > 0) {
        if (order.isColor) {
          selectedPrinter =
            kiosk.printers.find((p: any) => p.supportsColor) ||
            kiosk.printers[0];
        } else {
          selectedPrinter =
            kiosk.printers.find((p: any) => p.supportsBW) ||
            kiosk.printers[0];
        }
      }

      const jobSent = this.printGateway.sendPrintJob(order.kioskId, {
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
          `Kiosk ${order.kioskId} is OFFLINE. Order ${id} queued in DB.`,
        );
      }

      return updatedOrder;
    }

    // Normal update (payment complete na hole)
    if (order.paymentStatus !== 'COMPLETED' && !updateOrderDto.paymentStatus) {
      throw new ForbiddenException(
        'Please complete your payment before updating order status',
      );
    }

    return await this.prisma.order.update({
      where: { id },
      data: updateOrderDto,
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.order.delete({ where: { id } });
  }
}
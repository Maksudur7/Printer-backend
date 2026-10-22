import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { UpdateOrderDto } from './dto/update-order.dto';
import { PrintGateway } from '../print-gateway/print.gateway';
import { PDFDocument } from 'pdf-lib';
import * as fs from 'fs';
import { Order, PaymentStatus, PrintStatus, Printer } from '@prisma/client';
import 'multer';

export interface CreateOrderInput {
  kioskId: string;
  userId?: string;
  userEmail?: string;
  userPhone?: string;
  pageCount?: string | number;
  copyCount?: string | number;
  isColor?: string | boolean;
  isDuplex?: string | boolean;
  orientation?: string;
  paymentMethod?: string;
  isCash?: string | boolean;
  paymentType?: string;
  [key: string]: any;
}

@Injectable()
export class OrderService {
  private readonly logger = new Logger(OrderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly printGateway: PrintGateway,
  ) {}

  /**
   * Helper to select the appropriate printer (Color vs BW)
   */
  private selectPrinter(
    printers: Printer[] | undefined,
    isColor: boolean,
  ): Printer | null {
    if (!printers || printers.length === 0) {
      return null;
    }
    if (isColor) {
      return printers.find((p) => p.supportsColor) || printers[0];
    }
    return printers.find((p) => p.supportsBW) || printers[0];
  }

  async createOrder(
    data: CreateOrderInput,
    file?: Express.Multer.File,
  ): Promise<Order> {
    if (!file) {
      throw new BadRequestException(
        'No file uploaded. Please select a file with key "file"',
      );
    }

    // ১. কিওস্ক আছে কি না চেক করো (Foreign Key Error এড়াতে)
    const rawKioskId = (data.kioskId || '').toString().trim();
    this.logger.log(`[ORDER] Creating order for Kiosk: "${rawKioskId}"`);

    const kiosk = await this.prisma.kiosk.findUnique({
      where: { deviceId: rawKioskId },
    });

    if (!kiosk) {
      this.logger.error(`Kiosk not found in DB: "${rawKioskId}"`);
      throw new BadRequestException(
        `Invalid Kiosk ID: "${rawKioskId}". Please ensure the Kiosk is registered.`,
      );
    }

    let pageCount =
      typeof data.pageCount === 'number'
        ? data.pageCount
        : parseInt(String(data.pageCount || '1'), 10) || 1;

    // ২. PDF পেজ কাউন্ট (Vercel-এ ফাইল পাথ হ্যান্ডেল করা)
    if (file.mimetype === 'application/pdf') {
      try {
        let dataBuffer: Buffer | null = null;
        if (file.path && fs.existsSync(file.path)) {
          dataBuffer = fs.readFileSync(file.path);
        } else if (file.buffer) {
          dataBuffer = file.buffer;
        }

        if (dataBuffer) {
          const pdfDoc = await PDFDocument.load(dataBuffer);
          pageCount = pdfDoc.getPageCount();
        }
      } catch (error) {
        this.logger.error(
          `Error parsing PDF: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    const isColor =
      typeof data.isColor === 'boolean'
        ? data.isColor
        : String(data.isColor).toLowerCase() === 'true';

    const copyCount =
      typeof data.copyCount === 'number'
        ? data.copyCount
        : parseInt(String(data.copyCount || '1'), 10) || 1;

    const isDuplex =
      typeof data.isDuplex === 'boolean'
        ? data.isDuplex
        : String(data.isDuplex).toLowerCase() === 'true';

    let rate: number;
    try {
      const config = await this.prisma.config.findFirst();
      if (config) {
        rate = isColor ? config.colorPrice : config.bwPrice;
      } else {
        rate = isColor
          ? Number(process.env.PRICE_COLOR) || 5
          : Number(process.env.PRICE_BW) || 2;
      }
    } catch {
      rate = isColor
        ? Number(process.env.PRICE_COLOR) || 5
        : Number(process.env.PRICE_BW) || 2;
    }
    const totalAmount = pageCount * rate * copyCount;

    // ─── ফাইল ইউআরএল জেনারেট করা
    const appUrl =
      process.env.BACKEND_URL ||
      'https://printer-project-production.up.railway.app';
    const fileNameOnDisk = file.filename || file.originalname;
    const fileUrl = `${appUrl.replace(/\/$/, '')}/uploads/${fileNameOnDisk}`;

    const isCashPayment =
      String(data.paymentMethod || '').toUpperCase() === 'CASH' ||
      String(data.isCash || '').toLowerCase() === 'true' ||
      String(data.paymentType || '').toUpperCase() === 'CASH';

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
        userId: data.userId || null,
        userEmail: data.userEmail || null,
        userPhone: data.userPhone || null,
        kioskId: kiosk.deviceId, // Use validated deviceId
        filePath: file.path || null,
        fileName: file.originalname,
        fileUrl: fileUrl,
        pageCount: pageCount,
        copyCount: copyCount,
        isColor: isColor,
        isDuplex: isDuplex,
        orientation: data.orientation || 'portrait',
        totalAmount: totalAmount,
        paymentStatus: isCashPayment
          ? PaymentStatus.COMPLETED
          : PaymentStatus.PENDING,
        printStatus: isCashPayment
          ? PrintStatus.QUEUED
          : PrintStatus.WAITING_FOR_PAYMENT,
      },
    });

    // ২. যদি Cash পেমেন্ট হয়, তবে কোনো এপ্রুভাল ছাড়াই সাথে সাথে প্রিন্ট জব কিওস্কে পাঠিয়ে দাও!
    if (isCashPayment) {
      this.logger.log(
        `[CASH_BYPASS] Instant Printing for Order #${order.orderNumber} (Cash selected, no approval needed)`,
      );

      const selectedPrinter = this.selectPrinter(
        kioskWithPrinters?.printers,
        order.isColor,
      );

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
        this.logger.warn(
          `[CASH_BYPASS] Kiosk ${order.kioskId} is OFFLINE. Order #${order.orderNumber} queued in DB.`,
        );
      }
    }

    return order;
  }

  async getPendingOrders(kioskId: string): Promise<Order[]> {
    // Return both QUEUED (payment done, not yet printed) and
    // WAITING_FOR_PAYMENT with COMPLETED payment (edge case on restart)
    return await this.prisma.order.findMany({
      where: {
        kioskId,
        paymentStatus: PaymentStatus.COMPLETED,
        printStatus: {
          in: [PrintStatus.QUEUED, PrintStatus.WAITING_FOR_PAYMENT],
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findAll(): Promise<Order[]> {
    return this.prisma.order.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async findOne(id: string): Promise<Order> {
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order) throw new NotFoundException(`Order with ID ${id} not found`);
    return order;
  }

  async update(id: string, updateOrderDto: UpdateOrderDto): Promise<Order> {
    const order = await this.prisma.order.findUnique({ where: { id } });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (
      updateOrderDto.paymentStatus === PaymentStatus.COMPLETED &&
      order.paymentStatus !== PaymentStatus.COMPLETED
    ) {
      const updatedOrder = await this.prisma.order.update({
        where: { id },
        data: {
          ...updateOrderDto,
          printStatus: PrintStatus.QUEUED,
        },
      });

      const kiosk = await this.prisma.kiosk.findUnique({
        where: { deviceId: order.kioskId },
        include: {
          printers: {
            where: { isActive: true },
          },
        },
      });

      const selectedPrinter = this.selectPrinter(
        kiosk?.printers,
        order.isColor,
      );

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
        this.logger.warn(
          `Kiosk ${order.kioskId} is OFFLINE. Order ${id} queued in DB.`,
        );
      }

      return updatedOrder;
    }

    // Normal update (payment complete na hole)
    if (
      order.paymentStatus !== PaymentStatus.COMPLETED &&
      !updateOrderDto.paymentStatus
    ) {
      throw new ForbiddenException(
        'Please complete your payment before updating order status',
      );
    }

    return await this.prisma.order.update({
      where: { id },
      data: updateOrderDto,
    });
  }

  async remove(id: string): Promise<Order> {
    await this.findOne(id);
    return this.prisma.order.delete({ where: { id } });
  }
}
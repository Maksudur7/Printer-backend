import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';

@Injectable()
@WebSocketGateway({
  cors: {
    origin: (
      process.env.ALLOWED_ORIGINS ||
      `${process.env.FRONTEND_URL || 'https://printer-client.vercel.app'},http://localhost:3000,http://127.0.0.1:3000`
    )
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
    credentials: true,
  },
  namespace: '/kiosk',
})
export class PrintGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(PrintGateway.name);
  private kioskSockets = new Map<string, string>();

  constructor(private readonly prisma: PrismaService) {}

  // ─── Connection Events ────────────────────────────────────────────────────
  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    for (const [deviceId, socketId] of this.kioskSockets.entries()) {
      if (socketId === client.id) {
        this.kioskSockets.delete(deviceId);
        this.logger.log(`Kiosk OFFLINE: ${deviceId}`);
        break;
      }
    }
  }

  // ─── Kiosk Register & Sync ────────────────────────────────────────────────
  @SubscribeMessage('kiosk:register')
  async handleRegister(
    @MessageBody() data: { deviceId: string; name?: string; printers: any[] },
    @ConnectedSocket() client: Socket,
  ) {
    const { deviceId, name, printers } = data;
    this.kioskSockets.set(deviceId, client.id);

    try {
      // QR Code URL Generate koro (Frontend link)
      // Vercel-e deploy korle oboshoy FRONTEND_URL environment variable set korte hobe
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      const scanUrl = `${frontendUrl.replace(/\/$/, '')}/upload?kiosk=${deviceId}`;
      const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(scanUrl)}`;

      this.logger.log(`Generated QR for Kiosk ${deviceId}: ${scanUrl}`);

      // ১. Kiosk Upsert (Thakle update, na thakle create)
      const kiosk = await this.prisma.kiosk.upsert({
        where: { deviceId },
        update: { 
          lastHeartbeat: new Date(), 
          status: 'ONLINE',
          qrCodeUrl // Update QR code if changed
        },
        create: {
          deviceId,
          name: name || `Kiosk ${deviceId}`,
          status: 'ONLINE',
          qrCodeUrl,
          paperLevel: 100,
          inkLevel: 100,
        },
      });

      // ২. Printers Sync
      if (printers && printers.length > 0) {
        for (const p of printers) {
          await this.prisma.printer.upsert({
            where: {
              kioskId_windowsName: {
                kioskId: kiosk.id,
                windowsName: p.windowsName,
              },
            },
            update: {
              supportsColor: !!p.supportsColor,
              supportsBW:    !!p.supportsBW,
              isActive:      true,
              driverName:    p.driverName  || null,
              portName:      p.portName    || null,
              isNetwork:     !!p.isNetwork,
            },
            create: {
              windowsName:  p.windowsName,
              displayName:  p.displayName || p.windowsName,
              supportsColor: !!p.supportsColor,
              supportsBW:    !!p.supportsBW,
              isActive:      true,
              driverName:    p.driverName  || null,
              portName:      p.portName    || null,
              isNetwork:     !!p.isNetwork,
              kiosk: { connect: { id: kiosk.id } },
            },
          });
        }
      }

      this.logger.log(`Kiosk Sync: ${deviceId} | ${printers.length} Printers`);

      client.emit('kiosk:registered', {
        success: true,
        kioskId: kiosk.id,
        message: 'Kiosk and printers synchronized successfully',
      });
    } catch (error) {
      this.logger.error(`Registration failed: ${error.message}`);
      client.emit('kiosk:registered', { success: false, error: error.message });
    }
  }

  // ─── Print Status Update ──────────────────────────────────────────────────
  // Agent jakhon print sesh kore, ei event pathay

  @SubscribeMessage('print:status')
  async handlePrintStatus(
    @MessageBody()
    data: { orderId: string; status: string; deviceId: string },
    @ConnectedSocket() _client: Socket,
  ) {
    this.logger.log(
      `Print status update - Order: ${data.orderId} | Status: ${data.status}`,
    );

    try {
      // ডাটাবেজে স্ট্যাটাস আপডেট করা জরুরি
      await this.prisma.order.update({
        where: { id: data.orderId },
        data: { printStatus: data.status as any },
      });

      // ফ্রন্টএন্ডে সকেট মেসেজ পাঠানো
      this.server.emit(`order:${data.orderId}:status`, { status: data.status });
    } catch (error) {
      this.logger.error(`Failed to update order status: ${error.message}`);
    }
  }

  // ─── Send Print Job to Kiosk ──────────────────────────────────────────────
  // Payment complete hole Order Service ei method call korbe

  sendPrintJob(deviceId: string, orderData: any): boolean {
    const socketId = this.kioskSockets.get(deviceId);

    if (!socketId) {
      this.logger.warn(`Kiosk NOT connected: ${deviceId}`);
      return false;
    }

    // Specific kiosk-ke print job pathao
    this.server.to(socketId).emit('print:new-job', orderData);
    this.logger.log(
      `Print job sent to Kiosk: ${deviceId} | Order: ${orderData.orderId}`,
    );
    return true;
  }

  // ─── Check Kiosk Online ───────────────────────────────────────────────────

  isKioskOnline(deviceId: string): boolean {
    return this.kioskSockets.has(deviceId);
  }

  // ─── Get All Online Kiosks ────────────────────────────────────────────────

  getOnlineKiosks(): string[] {
    return Array.from(this.kioskSockets.keys());
  }
}

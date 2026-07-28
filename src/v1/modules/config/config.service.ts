import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';

@Injectable()
export class ConfigService {
  constructor(private prisma: PrismaService) {}

  async get() {
    try {
      let config = await this.prisma.config.findFirst();
      if (!config) {
        // Create default if not exists
        config = await this.prisma.config.create({
          data: { bwPrice: 2, colorPrice: 5, paperThreshold: 5 }
        });
      }
      return config;
    } catch (error: any) {
      console.error('Prisma Config Error:', error);
      throw new Error(`Prisma Error: ${error.message}`);
    }
  }

  async update(data: any) {
    const config = await this.get();
    return this.prisma.config.update({
      where: { id: config.id },
      data: {
        bwPrice: data.bwPrice !== undefined ? parseFloat(data.bwPrice) : undefined,
        colorPrice: data.colorPrice !== undefined ? parseFloat(data.colorPrice) : undefined,
        paperThreshold: data.paperThreshold !== undefined ? parseInt(data.paperThreshold) : undefined,
      }
    });
  }
}

import { Injectable } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

@Injectable()

export class PrismaService extends PrismaClient {
  constructor() {
    const databaseUrl = process.env.DATABASE_URL?.trim();
    
    if (!databaseUrl) {
      throw new Error('DATABASE_URL environment variable is not set or is empty');
    }

    console.log('✓ Database URL loaded:', databaseUrl.substring(0, 50) + '...');

    const adapter = new PrismaPg({
      connectionString: databaseUrl,
    });
    super({ adapter });
  }
}
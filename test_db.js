require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

const databaseUrl = process.env.DATABASE_URL?.trim();
const adapter = new PrismaPg({ connectionString: databaseUrl });
const prisma = new PrismaClient({ adapter });

async function test() {
  try {
    const kiosks = await prisma.kiosk.findMany({
      include: { printers: true }
    });
    console.log('✅ DB CONNECTION & QUERY SUCCESSFUL');
    console.log('Kiosks in Database:', JSON.stringify(kiosks, null, 2));
  } catch (e) {
    console.error('❌ DB ERROR:', e.message);
  } finally {
    await prisma.$disconnect();
  }
}

test();


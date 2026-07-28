import 'dotenv/config';
import { PrismaClient } from "@prisma/client";

// কোনো অ্যাডাপ্টার ছাড়া সরাসরি ক্লায়েন্ট ইনিশিয়ালাইজ করো
const prisma = new PrismaClient();

export { prisma };
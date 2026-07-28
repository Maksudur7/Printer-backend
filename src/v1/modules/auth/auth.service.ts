import { Injectable, UnauthorizedException, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { RegisterDto, LoginDto } from './dto/auth.dto';
import { UserRole } from '@prisma/client';

import * as bcrypt from 'bcrypt';
import * as jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'smart-print-kiosk-secret-key-2024';

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService) {}

  private generateToken(user: { id: string; email: string; role: string }) {
    return jwt.sign(
      { sub: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
  }

  // ১. রেজিস্ট্রেশন (Admin হিসেবে)
  async register(dto: RegisterDto) {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existingUser) {
      throw new BadRequestException('This email is already registered.');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        password: hashedPassword,
        name: dto.name,
        role: 'ADMIN',
        isApproved: false, // Must wait for Super Admin approval
      },
    });

    return {
      message: 'Registration successful. Please wait for Super Admin approval.',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        isApproved: user.isApproved,
      },
    };
  }

  // ২. লগইন (Token সহ রিটার্ন করবে)
  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.password);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    // NOTE: We allow login even if not approved,
    // so the frontend can redirect to the /pending page.
    const token = this.generateToken(user);

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        isApproved: user.isApproved,
      },
    };
  }

  // ৩. পেন্ডিং অ্যাডমিনদের লিস্ট (Super Admin এর জন্য)
  async getPendingAdmins() {
    return this.prisma.user.findMany({
      where: { role: 'ADMIN', isApproved: false },
      select: { id: true, email: true, name: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ৪. অ্যাডমিন অ্যাপ্রুভ/রিজেক্ট করা
  async approveAdmin(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('User not found.');
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: { isApproved: true },
    });

    return {
      message: `${updatedUser.email} has been approved successfully.`,
      user: { id: updatedUser.id, email: updatedUser.email, isApproved: true },
    };
  }

  // ৪.২ অ্যাডমিন লিস্ট (সব)
  async getAllAdmins() {
    return this.prisma.user.findMany({
      where: { role: 'ADMIN' },
      select: { id: true, email: true, name: true, isApproved: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ৪.৩ ইউজার ডিলিট করা
  async deleteUser(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found.');
    
    await this.prisma.user.delete({ where: { id: userId } });
    return { message: 'User deleted successfully.' };
  }

  // ৫. ইউজার আপডেট করা (Admin/User profile update)
  async updateUser(userId: string, data: { name?: string; email?: string; role?: UserRole }) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found.');

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data,
    });

    return {
      message: 'User updated successfully.',
      user: updatedUser
    };
  }

  // ৭. সব ইউজারের লিস্ট
  async getAllUsers() {
    return this.prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isApproved: true,
        createdAt: true
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  // ৮. কারেন্ট ইউজারের প্রোফাইল
  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, role: true, isApproved: true, createdAt: true },
    });

    if (!user) throw new NotFoundException('User not found.');
    return user;
  }
}

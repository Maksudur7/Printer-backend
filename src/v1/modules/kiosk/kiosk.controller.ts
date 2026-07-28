import { Controller, Get, Post, Body, Patch, Param, UseGuards } from '@nestjs/common';
import { KioskService } from './kiosk.service';
import { CreateKioskDto } from './dto/create-kiosk.dto';
import { UpdateKioskStatusDto } from './dto/update-kiosk.dto';
import { KioskStatus } from '@prisma/client';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';

@Controller('v1/kiosk')
export class KioskController {
  constructor(private readonly kioskService: KioskService) {}

  @Post('register')
  create(@Body() createKioskDto: CreateKioskDto) {
    return this.kioskService.create(createKioskDto);
  }

  // --- ADMIN ENDPOINTS (SECURED) ---
  @UseGuards(JwtAuthGuard)
  @Get('admin/stats')
  getAdminStats() {
    return this.kioskService.getDashboardStats();
  }

  @UseGuards(JwtAuthGuard)
  @Patch('admin/toggle/:deviceId')
  adminToggle(@Param('deviceId') deviceId: string, @Body('status') status: KioskStatus) {
    return this.kioskService.adminToggleStatus(deviceId, status);
  }

  @UseGuards(JwtAuthGuard)
  @Post('admin/delete/:deviceId')
  remove(@Param('deviceId') deviceId: string) {
    return this.kioskService.remove(deviceId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('admin/update/:deviceId')
  update(@Param('deviceId') deviceId: string, @Body() body: any) {
    return this.kioskService.updateInfo(deviceId, body);
  }
  // -----------------------

  @Get('all')
  findAll() {
    return this.kioskService.findAll();
  }

  @Get(':deviceId')
  findOne(@Param('deviceId') deviceId: string) {
    return this.kioskService.findOne(deviceId);
  }

  @Patch(':deviceId/heartbeat')
  heartbeat(@Param('deviceId') deviceId: string) {
    return this.kioskService.updateHeartbeat(deviceId);
  }

  @Patch(':deviceId/status')
  updateStatus(
    @Param('deviceId') deviceId: string,
    @Body() updateDto: UpdateKioskStatusDto
  ) {
    return this.kioskService.updateStatus(deviceId, updateDto);
  }
}
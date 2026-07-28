import { FileInterceptor } from '@nestjs/platform-express';
import { OrderService } from './order.service';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { Controller, Delete, Get, Param, Patch, Post, UploadedFile, UseInterceptors, Body, Res } from '@nestjs/common';
import type { Response } from 'express';
import * as path from 'path';
import * as fs from 'fs';

@Controller('v1/order')
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  @Get('download/:filename')
  async downloadFile(@Param('filename') filename: string, @Res() res: Response) {
    try {
      const folder = 'uploads';
      const filePath = path.join(process.cwd(), folder, filename);

      if (!fs.existsSync(filePath)) {
        this.orderService['logger'].error(`File not found: ${filePath}`);
        return res.status(404).json({ message: 'File not found' });
      }

      // res.download ব্যবহার করা বেশি নিরাপদ
      return res.download(filePath, filename, (err) => {
        if (err) {
          console.error('Download error:', err);
          if (!res.headersSent) {
            res.status(500).send({ message: 'Error downloading file' });
          }
        }
      });
    } catch (error) {
      console.error('Controller Error:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  }


  @Post('upload')
  @UseInterceptors(FileInterceptor('file', {
    storage: diskStorage({
      destination: process.env.VERCEL ? '/tmp' : './uploads',
      filename: (req, file, cb) => {
        const randomName = Array(32).fill(null).map(() => (Math.round(Math.random() * 16)).toString(16)).join('');
        cb(null, `${randomName}${extname(file.originalname)}`);
      },
    }),
  }))
  async create(@UploadedFile() file: Express.Multer.File, @Body() body: any) {
    return await this.orderService.createOrder(body, file);
  }

  @Get('pending/:kioskId')
  async getPending(@Param('kioskId') kioskId: string) {
    return await this.orderService.getPendingOrders(kioskId);
  }

  @Get()
  async findAll() {
    return await this.orderService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return await this.orderService.findOne(id);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() updateOrderDto: any) {
    console.log(id);
    return await this.orderService.update(id, updateOrderDto);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return await this.orderService.remove(id);
  }
}

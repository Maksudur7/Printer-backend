import { Controller, Get, Post, Body, Patch, Param, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto, LoginDto } from './dto/auth.dto';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';

@Controller('v1/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // POST /v1/auth/register
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  // POST /v1/auth/login → returns { user, token }
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  // GET /v1/auth/all-admins → Returns both pending and approved (deprecated, use all-users) (SECURED)
  @UseGuards(JwtAuthGuard)
  @Get('all-admins')
  getAll() {
    return this.authService.getAllUsers();
  }

  // GET /v1/auth/all-users → Returns all users (SECURED)
  @UseGuards(JwtAuthGuard)
  @Get('all-users')
  getAllUsers() {
    return this.authService.getAllUsers();
  }

  // DELETE /v1/auth/user/:id → Remove a user (SECURED)
  @UseGuards(JwtAuthGuard)
  @Post('delete-user/:id') // Using POST for compatibility if DELETE is restricted
  deleteUser(@Param('id') id: string) {
    return this.authService.deleteUser(id);
  }

  // PATCH /v1/auth/user/:id → Update a user (SECURED)
  @UseGuards(JwtAuthGuard)
  @Patch('user/:id')
  updateUser(@Param('id') id: string, @Body() body: any) {
    return this.authService.updateUser(id, body);
  }
}

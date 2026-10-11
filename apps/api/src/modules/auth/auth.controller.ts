import { Body, Controller, Get, HttpCode, Param, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { AuthService } from './auth.service.js';
import { AdminGuard, SessionGuard } from './auth.guard.js';
import { emptyBody, transport, type AuthRequest } from './http.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}
  @Post('challenges/:transport')
  challenge(@Req() request: AuthRequest, @Res({ passthrough: true }) response: Response, @Param('transport') kind: string, @Body() body: unknown) {
    emptyBody(body);
    return this.auth.challenge(request, response, transport(kind));
  }
  @Post('google/:transport')
  @HttpCode(200)
  exchange(@Req() request: AuthRequest, @Res({ passthrough: true }) response: Response, @Param('transport') kind: string, @Body() body: unknown) {
    return this.auth.exchange(request, response, transport(kind), body);
  }
  @Get('me')
  @UseGuards(SessionGuard)
  current(@Req() request: AuthRequest) { return this.auth.current(request.auth!); }
  @Post('logout')
  @HttpCode(204)
  logout(@Req() request: AuthRequest, @Res({ passthrough: true }) response: Response, @Body() body: unknown) {
    emptyBody(body); return this.auth.logout(request, response);
  }
}
@Controller('admin')
export class AdminAccessController {
  @Get('access')
  @UseGuards(SessionGuard, AdminGuard)
  access(@Req() request: AuthRequest) { return request.auth!.user; }
}

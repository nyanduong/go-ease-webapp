import { Controller, Get, Inject, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { AuthVerifier } from './auth-verifier.service.js';
import { requestSignal } from '../../common/http/request-signal.js';
@Controller('v1/auth')
export class AuthController {
  constructor(@Inject(AuthVerifier) private readonly verifier: AuthVerifier) {}
  @Get('me')
  me(@Query() query: unknown, @Req() req: Request) {
    return this.verifier.verify(req.headers.authorization, query, requestSignal(req));
  }
}

import { Body, Controller, HttpCode, Inject, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { AiService } from './ai.service.js';
import { requestSignal } from '../../common/http/request-signal.js';

@Controller('v1/ai')
export class AiController {
  constructor(@Inject(AiService) private readonly ai: AiService) {}
  @Post('itineraries')
  @HttpCode(200)
  generate(@Body() body: unknown, @Query() query: unknown, @Req() req: Request) {
    return this.ai.generate(body, query, req.headers.authorization, requestSignal(req));
  }
}

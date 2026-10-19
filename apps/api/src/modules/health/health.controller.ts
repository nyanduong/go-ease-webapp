import { Controller, Get, Inject, Query } from '@nestjs/common';
import { API_VERSION, healthResponseSchema } from '@goease/contracts';
import { ApiFailure } from '../../common/errors/api-failure.js';
import { PrismaService } from '../../database/prisma.service.js';
import { AiService } from '../ai/ai.service.js';
@Controller('v1/health')
export class HealthController {
  constructor(
    @Inject(PrismaService) private readonly database: PrismaService,
    @Inject(AiService) private readonly ai: AiService,
  ) {}
  @Get() health(@Query() query: unknown) {
    if (!query || typeof query !== 'object' || Object.keys(query).length)
      throw new ApiFailure(400, 'BAD_REQUEST', 'Health không nhận query.');
    return healthResponseSchema.parse({
      apiVersion: API_VERSION,
      service: 'goease-api',
      status: 'ok',
      scope: 'process',
      dependencies: { database: this.database.healthState(), gemini: this.ai.healthState() },
    });
  }
}

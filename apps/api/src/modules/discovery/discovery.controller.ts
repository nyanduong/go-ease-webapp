import { Body, Controller, Get, HttpCode, Inject, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { ApiFailure } from '../../common/errors/api-failure.js';
import { requestSignal } from '../../common/http/request-signal.js';
import { AuthVerifier } from '../auth/auth-verifier.service.js';
import { DiscoveryService } from './discovery.service.js';

@Controller('v1')
export class DiscoveryController {
  constructor(
    @Inject(DiscoveryService) private readonly discovery: DiscoveryService,
    @Inject(AuthVerifier) private readonly auth: AuthVerifier,
  ) {}
  @Get('destinations') destinations(@Query() query: unknown) {
    return this.discovery.searchDestinations(query);
  }
  @Post('discovery/places')
  @HttpCode(200)
  async places(@Req() req: Request, @Body() body: unknown, @Query() query: unknown) {
    this.noQuery(query);
    const identity = await this.auth.verify(req.headers.authorization, {}, requestSignal(req));
    return this.discovery.places(body, identity.identity.id, requestSignal(req));
  }
  @Post('discovery/preview')
  @HttpCode(200)
  async preview(@Req() req: Request, @Body() body: unknown, @Query() query: unknown) {
    this.noQuery(query);
    const identity = await this.auth.verify(req.headers.authorization, {}, requestSignal(req));
    return this.discovery.preview(body, identity.identity.id, requestSignal(req));
  }
  private noQuery(query: unknown) {
    if (!query || typeof query !== 'object' || Object.keys(query).length)
      throw new ApiFailure(
        400,
        'BAD_REQUEST',
        'Tìm địa điểm không nhận query hoặc danh tính tự khai.',
      );
  }
}

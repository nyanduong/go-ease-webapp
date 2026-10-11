import { Body, Controller, Get, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { SessionGuard } from '../auth/auth.guard.js';
import { oneHeader, type AuthRequest } from '../auth/http.js';
import { TripsService } from './trips.service.js';

@Controller('trips')
@UseGuards(SessionGuard)
export class TripsController {
  constructor(private readonly trips: TripsService) {}
  @Post()
  create(@Req() request: AuthRequest, @Body() body: unknown) {
    return this.trips.create(request.auth!.user.id, oneHeader(request, 'idempotency-key'), body);
  }
  @Get()
  list(@Req() request: AuthRequest, @Query() query: Record<string, unknown>) {
    return this.trips.list(request.auth!.user.id, query);
  }
  @Get(':id')
  detail(@Req() request: AuthRequest, @Param('id') id: string) { return this.trips.detail(request.auth!.user.id, id); }
  @Put(':id')
  update(@Req() request: AuthRequest, @Param('id') id: string, @Body() body: unknown) {
    return this.trips.update(request.auth!.user.id, id, oneHeader(request, 'idempotency-key'), body);
  }
}

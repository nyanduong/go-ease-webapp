import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { createServerTripSchema, idSchema } from '@goease/contracts';
import { ApiFailure } from '../../common/errors/api-failure.js';
import { requestSignal } from '../../common/http/request-signal.js';
import { AccountIdentityService } from '../auth/account-identity.service.js';
import { TripsService } from './trips.service.js';
function tripId(value: string) {
  const parsed = idSchema.safeParse(value);
  if (!parsed.success) throw new ApiFailure(400, 'BAD_REQUEST', 'ID chuyến không hợp lệ.');
  return parsed.data;
}
function noQuery(query: unknown) {
  if (!query || typeof query !== 'object' || Object.keys(query).length)
    throw new ApiFailure(400, 'BAD_REQUEST', 'Endpoint không nhận query.');
}
@Controller('v1/trips')
export class TripsController {
  constructor(
    @Inject(TripsService) private readonly trips: TripsService,
    @Inject(AccountIdentityService) private readonly identity: AccountIdentityService,
  ) {}
  @Get() async list(@Req() req: Request, @Query() query: unknown) {
    return this.trips.list(
      await this.identity.verify(req.headers.authorization, requestSignal(req)),
      query,
      requestSignal(req),
    );
  }
  @Get(':id') async get(@Req() req: Request, @Param('id') id: string, @Query() query: unknown) {
    noQuery(query);
    return this.trips.get(
      await this.identity.verify(req.headers.authorization, requestSignal(req)),
      tripId(id),
      requestSignal(req),
    );
  }
  @Post() async create(@Req() req: Request, @Body() body: unknown, @Query() query: unknown) {
    noQuery(query);
    const parsed = createServerTripSchema.safeParse(body);
    if (!parsed.success)
      throw new ApiFailure(400, 'BAD_REQUEST', 'Create cần mutationId và Trip đúng contract.');
    return this.trips.mutate(
      await this.identity.verify(req.headers.authorization, requestSignal(req)),
      'create',
      parsed.data.trip.id,
      body,
      requestSignal(req),
    );
  }
  @Put(':id') async update(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: unknown,
    @Query() query: unknown,
  ) {
    noQuery(query);
    return this.trips.mutate(
      await this.identity.verify(req.headers.authorization, requestSignal(req)),
      'update',
      tripId(id),
      body,
      requestSignal(req),
    );
  }
  @Delete(':id') async remove(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: unknown,
    @Query() query: unknown,
  ) {
    noQuery(query);
    return this.trips.mutate(
      await this.identity.verify(req.headers.authorization, requestSignal(req)),
      'delete',
      tripId(id),
      body,
      requestSignal(req),
    );
  }
}

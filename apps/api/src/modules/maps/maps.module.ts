import { Body, Controller, Get, HttpCode, Injectable, Module, Post, Req, Res, UseGuards, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { isSampleRouteRequest, type SampleMapCatalog, type SampleRouteResult } from '@goease/contracts';
import type { Environment } from '../../config.js';
import { ApiFault } from '../../common/api-fault.js';
import { createDatabaseClient } from '../../database/client.js';
import { samplePlaces } from '../../database/sample-catalog.js';
import { validateApprovedSampleRows } from '../ai/catalog.js';
import { AuthModule } from '../auth/auth.module.js';
import { SessionGuard } from '../auth/auth.guard.js';
import type { AuthRequest } from '../auth/http.js';
import { prepareSampleRoute, validateMapCatalog } from './catalog.js';
import { MapsError } from './errors.js';
import { computeSampleRoute, readRoutesConfig, type RoutesConfig } from './routes.js';

export class MapsFault extends ApiFault {
  constructor(code: string, status: number) { super(code, status); this.message = 'Yêu cầu bản đồ chưa thực hiện được. Vui lòng thử lại hoặc kiểm tra phiên.'; }
}

@Injectable()
export class MapsCatalog implements OnModuleDestroy {
  private readonly client: ReturnType<typeof createDatabaseClient> | undefined;
  constructor(config: ConfigService<Environment, true>) {
    const url = config.get('DATABASE_URL', { infer: true }); this.client = url ? createDatabaseClient(url) : undefined;
  }
  async load(): Promise<SampleMapCatalog> {
    if (!this.client) throw new MapsFault('MAPS_NOT_CONFIGURED', 503);
    try {
      const rows = await this.client.place.findMany({ where: { code: { in: samplePlaces.map(place => place.code) } }, orderBy: { code: 'asc' },
        select: { id: true, code: true, destinationCode: true, name: true, latitude: true, longitude: true, sourceUrl: true, attribution: true, active: true, isSample: true } });
      const approved = validateApprovedSampleRows(rows);
      return validateMapCatalog({ destinationCode: 'VN-HANOI-SAMPLE', isSample: true,
        places: approved.map(({ id, name, latitude, longitude, sourceUrl, attribution }) => ({ id, name, latitude, longitude, sourceUrl, attribution })) });
    } catch { throw new MapsFault('MAPS_CATALOG_UNAVAILABLE', 503); }
  }
  async onModuleDestroy() { await this.client?.$disconnect(); }
}

/** Test transport can only replace this provider through Nest's test module override. */
export abstract class RoutesProvider {
  abstract compute(config: RoutesConfig, request: unknown, catalog: SampleMapCatalog, signal: AbortSignal): Promise<SampleRouteResult>;
}
@Injectable()
class GoogleRoutesProvider extends RoutesProvider {
  async compute(config: RoutesConfig, request: unknown, catalog: SampleMapCatalog, signal: AbortSignal) {
    return (await computeSampleRoute(config, request, catalog, { signal })).result;
  }
}

@Injectable()
export class MapsLimit {
  private readonly users = new Map<string, { since: number; count: number }>();
  private global = { since: 0, count: 0 };
  private active = 0;
  async run<T>(userId: string, work: () => Promise<T>): Promise<T> {
    const now = Date.now();
    for (const [id, bucket] of this.users) if (now - bucket.since >= 60_000) this.users.delete(id);
    if (now - this.global.since >= 60_000) this.global = { since: now, count: 0 };
    const bucket = this.users.get(userId) ?? { since: now, count: 0 };
    if (this.active >= 2 || bucket.count >= 10 || this.global.count >= 30 || (!this.users.has(userId) && this.users.size >= 1024)) {
      throw new MapsFault('MAPS_RATE_LIMITED', 429);
    }
    bucket.count++; this.users.set(userId, bucket); this.global.count++; this.active++;
    try { return await work(); } finally { this.active--; }
  }
}

@Injectable()
export class MapsService {
  constructor(private readonly catalog: MapsCatalog, private readonly provider: RoutesProvider,
    private readonly config: ConfigService<Environment, true>, private readonly limit: MapsLimit) {}
  async route(body: unknown, userId: string, signal: AbortSignal) {
    if (signal.aborted) throw new MapsFault('MAPS_CANCELLED', 499);
    if (!isSampleRouteRequest(body)) throw new MapsFault('MAPS_INVALID_INPUT', 400);
    if (this.config.get('MAPS_ROUTES_ENABLED', { infer: true }) !== true) throw new MapsFault('MAPS_NOT_CONFIGURED', 503);
    let configuration: RoutesConfig;
    try { configuration = readRoutesConfig({ GOOGLE_MAPS_SERVER_API_KEY: this.config.get('GOOGLE_MAPS_SERVER_API_KEY', { infer: true }) }); }
    catch { throw new MapsFault('MAPS_NOT_CONFIGURED', 503); }
    const catalog = await this.catalog.load();
    try {
      const prepared = prepareSampleRoute(body, catalog);
      if (signal.aborted) throw new MapsError('MAPS_CANCELLED');
      return await this.limit.run(userId, () => this.provider.compute(configuration, prepared.request, prepared.catalog, signal));
    } catch (error) {
      if (error instanceof MapsFault) throw error;
      const code = error instanceof MapsError ? error.code : 'MAPS_PROVIDER_FAILURE';
      throw new MapsFault(code, code === 'MAPS_INVALID_INPUT' ? 400 : code === 'MAPS_TIMEOUT' ? 504 : code === 'MAPS_CANCELLED' ? 499 : 502);
    }
  }
}

@Controller('maps')
export class MapsController {
  constructor(private readonly catalog: MapsCatalog, private readonly service: MapsService) {}
  @Get('catalog')
  catalogSnapshot() { return this.catalog.load(); }
  @Post('sample-route')
  @HttpCode(200)
  @UseGuards(SessionGuard)
  async route(@Req() request: AuthRequest, @Res({ passthrough: true }) response: Response, @Body() body: unknown) {
    if (request.auth?.transport !== 'native') throw new MapsFault('MAPS_NATIVE_REQUIRED', 403);
    const controller = new AbortController();
    const close = () => { if (!response.writableEnded) controller.abort(); };
    response.once('close', close);
    // SessionGuard may await DB while the client disconnects before this handler starts.
    if (response.destroyed) controller.abort();
    try { return await this.service.route(body, request.auth.user.id, controller.signal); }
    finally { response.removeListener('close', close); }
  }
}

@Module({ imports: [AuthModule], controllers: [MapsController], providers: [MapsCatalog, MapsService, MapsLimit,
  { provide: RoutesProvider, useClass: GoogleRoutesProvider }] })
export class MapsModule {}

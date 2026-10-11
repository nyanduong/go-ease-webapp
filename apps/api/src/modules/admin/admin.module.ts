import { Controller, Get, Injectable, Module, Query, UseGuards, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isAdminPlacesResponse, type AdminPlacesResponse } from '@goease/contracts';
import { ApiFault } from '../../common/api-fault.js';
import type { Environment } from '../../config.js';
import { createDatabaseClient } from '../../database/client.js';
import { AdminGuard, SessionGuard } from '../auth/auth.guard.js';
import { AuthModule } from '../auth/auth.module.js';

@Injectable()
export class AdminCatalog implements OnModuleDestroy {
  private readonly database: ReturnType<typeof createDatabaseClient> | undefined;
  constructor(config: ConfigService<Environment, true>) {
    const url = config.get('DATABASE_URL', { infer: true });
    this.database = url ? createDatabaseClient(url) : undefined;
  }
  async list(): Promise<AdminPlacesResponse> {
    if (!this.database) throw new ApiFault('ADMIN_NOT_CONFIGURED', 503);
    try {
      // Deliberately no relations, counts or User/Trip/Session projection.
      const rows = await this.database.place.findMany({ where: { isSample: true, destinationCode: 'VN-HANOI-SAMPLE' },
        orderBy: [{ code: 'asc' }, { id: 'asc' }], take: 100,
        select: { id: true, code: true, name: true, latitude: true, longitude: true,
          sourceUrl: true, attribution: true, active: true, isSample: true } });
      const result = { destinationCode: 'VN-HANOI-SAMPLE', isSample: true,
        places: rows.map(row => ({ id: row.id, code: row.code, name: row.name, latitude: row.latitude.toNumber(),
          longitude: row.longitude.toNumber(), sourceUrl: row.sourceUrl, attribution: row.attribution,
          isActive: row.active, isSample: row.isSample })) };
      if (!isAdminPlacesResponse(result)) throw new ApiFault('ADMIN_CATALOG_UNAVAILABLE', 503);
      return result;
    } catch { throw new ApiFault('ADMIN_CATALOG_UNAVAILABLE', 503); }
  }
  async onModuleDestroy() { await this.database?.$disconnect(); }
}
@Controller('admin/places')
@UseGuards(SessionGuard, AdminGuard)
export class AdminPlacesController {
  constructor(private readonly catalog: AdminCatalog) {}
  @Get()
  list(@Query() query: Record<string, unknown>) {
    if (Object.keys(query).length !== 0) throw new ApiFault('ADMIN_INVALID_REQUEST', 400);
    return this.catalog.list();
  }
}
@Module({ imports: [AuthModule], controllers: [AdminPlacesController], providers: [AdminCatalog] })
export class AdminModule {}

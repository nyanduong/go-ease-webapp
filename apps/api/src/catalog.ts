import { Controller, Get, Inject, Injectable, Module, Query } from '@nestjs/common';
import { API_VERSION, catalogQuerySchema, catalogResponseSchema, healthResponseSchema } from '@goease/contracts';
import { CATALOG_INFO } from '@goease/catalog';
import { ApiFailure } from './errors.js';
import { AiService } from './ai/service.js';
import { AiController } from './ai/controller.js';

export const CATALOG_LOADER = Symbol('CATALOG_LOADER');
export type CatalogLoader = () => unknown | Promise<unknown>;
@Injectable()
export class CatalogService {
  constructor(@Inject(CATALOG_LOADER) private readonly load: CatalogLoader) {}
  async list() {
    const result = catalogResponseSchema.safeParse({ apiVersion: API_VERSION, catalog: { ...CATALOG_INFO, entries: await this.load() } });
    if (!result.success) throw new ApiFailure(500, 'RESPONSE_INVALID', 'Catalog server không hợp lệ. Hãy thử lại.');
    return result.data;
  }
}
@Controller('v1')
export class ApiController {
  constructor(@Inject(CatalogService) private readonly catalog: CatalogService, @Inject(AiService) private readonly ai: AiService) {}
  @Get('health')
  health(@Query() query: unknown) {
    if (!query || typeof query !== 'object' || Object.keys(query).length) throw new ApiFailure(400, 'BAD_REQUEST', 'Health không nhận query.');
    return healthResponseSchema.parse({ apiVersion: API_VERSION, service: 'goease-api', status: 'ok', scope: 'process', dependencies: { database: 'not-configured', gemini: this.ai.healthState() } });
  }
  @Get('catalog')
  list(@Query() query: unknown) {
    if (!catalogQuerySchema.safeParse(query).success) throw new ApiFailure(400, 'BAD_REQUEST', 'Chỉ hỗ trợ destinationId=da-lat; không nhận query khác hoặc lặp.');
    return this.catalog.list();
  }
}
@Module({ controllers: [ApiController, AiController], providers: [CatalogService] })
export class ApiModule {}

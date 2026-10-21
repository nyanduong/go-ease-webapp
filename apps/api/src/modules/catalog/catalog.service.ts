import {
  API_VERSION,
  CATALOG_LIMITS,
  catalogResponseSchema,
  managedCatalogSchema,
} from '@goease/contracts';
import { CATALOG_INFO, getDalatCatalog } from '@goease/catalog';
import { ApiFailure } from '../../common/errors/api-failure.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { Transaction } from '../../database/actor-transaction.service.js';
import { CatalogRepository } from './catalog.repository.js';
export type CatalogLoader = () => unknown | Promise<unknown>;
export class CatalogService {
  constructor(
    private readonly database: PrismaService,
    private readonly repository: CatalogRepository,
    private readonly load: CatalogLoader = getDalatCatalog,
  ) {}
  async managedCatalog() {
    if (!this.database.configured)
      return managedCatalogSchema.parse({
        apiVersion: '1',
        places: getDalatCatalog().map((entry) => ({ entry, enabled: true, version: 1 })),
      });
    try {
      const rows = await this.repository.list();
      if (rows.length > CATALOG_LIMITS.maxEntries)
        throw new ApiFailure(
          503,
          'CATALOG_LIMIT',
          'Catalog vượt giới hạn vận hành; cần phân vùng dữ liệu.',
        );
      return managedCatalogSchema.parse({
        apiVersion: '1',
        places: rows.map((p) => ({
          entry: p.snapshot,
          version: p.version,
          enabled: p.enabled,
        })),
      });
    } catch (cause) {
      if (cause instanceof ApiFailure) throw cause;
      throw new ApiFailure(503, 'DB_UNAVAILABLE', 'Catalog database chưa đáp ứng.');
    }
  }
  async enabledEntries() {
    return (await this.managedCatalog()).places.filter((p) => p.enabled).map((p) => p.entry);
  }
  validationEntries(tx: Transaction) {
    return this.repository.validationEntries(tx);
  }
  async list() {
    const entries = this.database.configured ? await this.enabledEntries() : await this.load();
    const result = catalogResponseSchema.safeParse({
      apiVersion: API_VERSION,
      catalog: { ...CATALOG_INFO, entries },
    });
    if (!result.success)
      throw new ApiFailure(500, 'RESPONSE_INVALID', 'Catalog server không hợp lệ. Hãy thử lại.');
    return result.data;
  }
}

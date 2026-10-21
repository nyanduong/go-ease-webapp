import { ApiFailure } from '../../common/errors/api-failure.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { Owner, Transaction } from '../../database/actor-transaction.service.js';
import { CATALOG_LIMITS, type AdminCatalogPageQuery, type CatalogEntry } from '@goease/contracts';
export class CatalogRepository {
  constructor(private readonly database: PrismaService) {}
  list(tx?: Transaction) {
    return (tx ?? this.database.requireClient()).place.findMany({
      orderBy: { id: 'asc' },
      take: CATALOG_LIMITS.maxEntries + 1,
    });
  }
  async validationEntries(tx: Transaction) {
    const rows = await this.list(tx);
    if (rows.length > CATALOG_LIMITS.maxEntries)
      throw new ApiFailure(
        503,
        'CATALOG_LIMIT',
        'Catalog vượt giới hạn vận hành; cần phân vùng dữ liệu.',
      );
    return rows;
  }
  page(tx: Transaction, query: AdminCatalogPageQuery) {
    return tx.place.findMany({
      ...(query.after ? { where: { id: { gt: query.after } } } : {}),
      orderBy: { id: 'asc' },
      take: (query.limit ?? CATALOG_LIMITS.defaultPageSize) + 1,
    });
  }
  async permitted(tx: Transaction, owner: Owner) {
    const rows = await tx.$queryRaw<
      { enabled: boolean }[]
    >`SELECT enabled FROM "CatalogAdmin" WHERE issuer=${owner.ownerIssuer} AND subject=${owner.ownerSubject}::uuid`;
    return !!rows[0]?.enabled;
  }
  async lock(tx: Transaction) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(781601)`;
  }
  count(tx: Transaction, enabledOnly = false) {
    return enabledOnly ? tx.place.count({ where: { enabled: true } }) : tx.place.count();
  }
  find(tx: Transaction, id: string) {
    return tx.place.findUnique({ where: { id } });
  }
  async create(tx: Transaction, owner: Owner, entry: CatalogEntry) {
    const snapshot = JSON.parse(JSON.stringify(entry));
    await tx.place.create({ data: { id: entry.id, name: entry.name, snapshot } });
    await tx.placeRevision.create({
      data: {
        placeId: entry.id,
        version: 1,
        snapshot,
        enabled: true,
        actorIssuer: owner.ownerIssuer,
        actorSubject: owner.ownerSubject,
      },
    });
  }
  async update(
    tx: Transaction,
    owner: Owner,
    entry: CatalogEntry,
    version: number,
    enabled: boolean,
  ) {
    const snapshot = JSON.parse(JSON.stringify(entry));
    await tx.place.update({
      where: { id: entry.id },
      data: { name: entry.name, snapshot, version, enabled },
    });
    await tx.placeRevision.create({
      data: {
        placeId: entry.id,
        version,
        snapshot,
        enabled,
        actorIssuer: owner.ownerIssuer,
        actorSubject: owner.ownerSubject,
      },
    });
  }
}

import { PrismaService } from '../../database/prisma.service.js';
import type { Owner, Transaction } from '../../database/actor-transaction.service.js';
import type { CatalogEntry } from '@goease/contracts';
export class CatalogRepository {
  constructor(private readonly database: PrismaService) {}
  list(tx?: Transaction) {
    return (tx ?? this.database.requireClient()).place.findMany({
      orderBy: { id: 'asc' },
      take: 21,
    });
  }
  validationEntries(tx: Transaction) {
    return tx.place.findMany({ take: 21 });
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

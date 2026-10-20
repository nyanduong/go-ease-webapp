import { Prisma } from '../../generated/prisma/client.js';
import type { Trip } from '@goease/contracts';
import type { Owner, Transaction } from '../../database/actor-transaction.service.js';
import { tripInclude } from './trips.mapper.js';
export class TripsRepository {
  list(tx: Transaction, owner: Owner, cursor?: string) {
    return tx.trip.findMany({
      where: { ...owner, deletedAt: null, ...(cursor ? { id: { gt: cursor } } : {}) },
      orderBy: { id: 'asc' },
      take: 21,
    });
  }
  read(tx: Transaction, owner: Owner, id: string) {
    return tx.trip.findFirst({ where: { ...owner, id, deletedAt: null }, include: tripInclude });
  }
  current(tx: Transaction, owner: Owner, id: string) {
    return tx.trip.findUnique({ where: { ownerIssuer_ownerSubject_id: { ...owner, id } } });
  }
  async lockOwner(tx: Transaction, owner: Owner) {
    await tx.$executeRaw`INSERT INTO "AppUser" (issuer,subject) VALUES (${owner.ownerIssuer},${owner.ownerSubject}::uuid) ON CONFLICT DO NOTHING`;
    await tx.$queryRaw`SELECT subject FROM "AppUser" WHERE issuer=${owner.ownerIssuer} AND subject=${owner.ownerSubject}::uuid FOR UPDATE`;
  }
  async expireMutations(tx: Transaction, owner: Owner) {
    await tx.$executeRaw`DELETE FROM "TripMutation" WHERE "ownerIssuer"=${owner.ownerIssuer} AND "ownerSubject"=${owner.ownerSubject}::uuid AND "createdAt" < now() - interval '24 hours'`;
  }
  mutation(tx: Transaction, owner: Owner, mutationId: string) {
    return tx.tripMutation.findUnique({
      where: { ownerIssuer_ownerSubject_mutationId: { ...owner, mutationId } },
    });
  }
  mutationCount(tx: Transaction, owner: Owner) {
    return tx.tripMutation.count({ where: owner });
  }
  count(tx: Transaction, owner: Owner, activeOnly = false) {
    return tx.trip.count({ where: { ...owner, ...(activeOnly ? { deletedAt: null } : {}) } });
  }
  activities(tx: Transaction, owner: Owner, tripId: string) {
    return tx.tripActivity.findMany({
      where: { ...owner, tripId },
      select: { id: true, placeId: true, name: true, locationSnapshot: true },
    });
  }
  async remove(tx: Transaction, owner: Owner, id: string, timestamp: Date) {
    await tx.tripDay.deleteMany({ where: { ...owner, tripId: id } });
    return tx.trip.update({
      where: { ownerIssuer_ownerSubject_id: { ...owner, id } },
      data: { version: { increment: 1 }, deletedAt: timestamp, updatedAt: timestamp },
    });
  }
  async save(tx: Transaction, owner: Owner, trip: Trip, create: boolean, timestamp: Date) {
    const { days, id: tripId, destination, ...fields } = trip;
    const destinationData = destination
      ? (JSON.parse(JSON.stringify(destination)) as Prisma.InputJsonValue)
      : Prisma.DbNull;
    if (create)
      await tx.trip.create({
        data: {
          ...owner,
          id: tripId,
          ...fields,
          destination: destinationData,
          generationSource: fields.generationSource ?? null,
          updatedAt: timestamp,
        },
      });
    else {
      await tx.trip.update({
        where: { ownerIssuer_ownerSubject_id: { ...owner, id: tripId } },
        data: {
          ...fields,
          destination: destinationData,
          generationSource: fields.generationSource ?? null,
          version: { increment: 1 },
          updatedAt: timestamp,
        },
      });
      await tx.tripDay.deleteMany({ where: { ...owner, tripId } });
    }
    await tx.tripDay.createMany({
      data: days.map((day, position) => ({
        ...owner,
        tripId,
        id: day.id,
        date: day.date,
        position,
      })),
    });
    const activities = days.flatMap((day) =>
      day.activities.map((a, position) => ({
        ...owner,
        tripId,
        dayId: day.id,
        id: a.id,
        position,
        name: a.name,
        locationKind: a.location.kind,
        placeId: a.location.kind === 'catalog' ? a.location.placeId : null,
        locationSnapshot:
          a.location.kind === 'discovered'
            ? (JSON.parse(JSON.stringify(a.location)) as Prisma.InputJsonValue)
            : Prisma.DbNull,
        startTime: a.startTime,
        endTime: a.endTime,
        costVnd: a.costVnd,
        notes: a.notes,
      })),
    );
    if (activities.length) await tx.tripActivity.createMany({ data: activities });
    return (await this.read(tx, owner, tripId))!;
  }
  async receipt(
    tx: Transaction,
    owner: Owner,
    mutationId: string,
    requestHash: string,
    result: unknown,
  ) {
    await tx.tripMutation.create({
      data: {
        ...owner,
        mutationId,
        requestHash,
        result: JSON.parse(JSON.stringify(result)) as Prisma.InputJsonValue,
      },
    });
  }
}

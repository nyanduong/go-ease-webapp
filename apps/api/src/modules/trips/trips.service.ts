import { Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { canonicalCreateTrip, canonicalUpdateTrip, isCreateTripRequest, isTripCursor, isTripDetail, isTripListResponse,
  isTripUuid, isUpdateTripRequest, MAX_TRIP_VERSION, SAMPLE_DESTINATION, TRIP_TIME_ZONE,
  type TripDetail, type TripListResponse, type UpdateTripRequest } from '@goease/contracts';
import { Prisma } from '../../generated/prisma/client.js';
import { samplePlaces } from '../../database/seed.js';
import { ApiFault } from '../../common/api-fault.js';
import { TripsDatabase } from './trips-database.js';
import { tripDetail, tripInclude, tripSummary } from './mapper.js';

const writeOptions = { isolationLevel: 'ReadCommitted', maxWait: 3000, timeout: 10_000 } as const;
const readOptions = { isolationLevel: 'RepeatableRead', maxWait: 3000, timeout: 10_000 } as const;
class VersionLost extends Error {}
function invalid(): never { throw new ApiFault('TRIP_INVALID_REQUEST', 400); }
function uuid(value: unknown) { if (!isTripUuid(value)) invalid(); return value.toLowerCase(); }
function requestHash(operation: string, tripId: string | null, dto: unknown) {
  return createHash('sha256').update(JSON.stringify({ operation, tripId, dto })).digest('hex');
}
/** A different unique violation must never be mistaken for a successful retry. */
export function isReceiptRace(error: unknown) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002' || error.meta?.['modelName'] !== 'IdempotencyRecord') return false;
  const target = error.meta['target'];
  return Array.isArray(target) && target.length === 3 && ['userId', 'operation', 'key'].every(field => target.includes(field));
}
async function lockPlaces(tx: Prisma.TransactionClient, ids: string[]) {
  const ordered = [...new Set(ids)].sort();
  if (ordered.length) await tx.$queryRaw(Prisma.sql`SELECT id FROM "Place" WHERE id IN (${Prisma.join(ordered.map(id => Prisma.sql`${id}::uuid`))}) ORDER BY id FOR SHARE`);
}

@Injectable()
export class TripsService {
  constructor(private readonly database: TripsDatabase) {}
  private async owner(userId: string, id: string) {
    const row = await this.database.db.trip.findFirst({ where: { id, ownerId: userId }, select: { id: true } });
    if (!row) throw new ApiFault('TRIP_NOT_FOUND', 404);
  }
  private async replay(userId: string, operation: string, key: string, hash: string): Promise<TripDetail | null> {
    const row = await this.database.db.idempotencyRecord.findUnique({ where: { userId_operation_key: { userId, operation, key } } });
    if (!row) return null;
    // Owner and current auth are checked even when returning a historical snapshot.
    await this.owner(userId, row.tripId);
    if (row.requestHash !== hash) throw new ApiFault('TRIP_IDEMPOTENCY_CONFLICT', 409);
    if (row.statusCode !== (operation === 'trip.create' ? 201 : 200) || !isTripDetail(row.responseBody) || row.responseBody.id !== row.tripId) {
      throw new Error('Stored trip receipt failed response validation.');
    }
    return row.responseBody;
  }
  private async receipt(tx: Prisma.TransactionClient, userId: string, operation: string, key: string, hash: string, body: TripDetail) {
    await tx.idempotencyRecord.create({ data: { userId, operation, key, requestHash: hash, tripId: body.id,
      statusCode: operation === 'trip.create' ? 201 : 200, responseBody: body as unknown as Prisma.InputJsonValue } });
    return body;
  }
  private async write(userId: string, operation: string, key: string, hash: string, work: (tx: Prisma.TransactionClient) => Promise<TripDetail>) {
    for (let attempt = 0; ; attempt++) {
      try { return await this.database.db.$transaction(work, writeOptions); }
      catch (error) {
        if (isReceiptRace(error) || error instanceof VersionLost) {
          // The failed transaction has rolled back before any fresh receipt query.
          const saved = await this.replay(userId, operation, key, hash);
          if (saved) return saved;
          if (error instanceof VersionLost) throw new ApiFault('TRIP_VERSION_CONFLICT', 409);
          throw error;
        }
        if (attempt === 0 && error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') continue;
        throw error;
      }
    }
  }
  async create(userId: string, rawKey: unknown, input: unknown) {
    const key = uuid(rawKey);
    if (!isCreateTripRequest(input)) invalid();
    const dto = canonicalCreateTrip(input), operation = 'trip.create', hash = requestHash(operation, null, dto);
    const saved = await this.replay(userId, operation, key, hash);
    if (saved) return saved;
    return this.write(userId, operation, key, hash, async tx => {
      const seeds = await tx.place.findMany({ where: { code: { in: samplePlaces.map(p => p.code) } }, select: { id: true } });
      await lockPlaces(tx, seeds.map(p => p.id));
      const catalog = await tx.place.findMany({ where: { id: { in: seeds.map(p => p.id) }, active: true, isSample: true,
        destinationCode: SAMPLE_DESTINATION }, orderBy: { code: 'asc' } });
      if (!catalog.length) throw new ApiFault('TRIP_TEMPLATE_UNAVAILABLE', 503);
      const row = await tx.trip.create({ data: { title: dto.title, ownerId: userId, destinationCode: dto.destinationCode, isSample: true,
        startDate: new Date(`${dto.startDate}T00:00:00.000Z`), durationDays: dto.durationDays, timeZone: TRIP_TIME_ZONE,
        groupSize: dto.groupSize, budgetVnd: dto.budgetVnd === null ? null : BigInt(dto.budgetVnd),
        days: { create: Array.from({ length: dto.durationDays }, (_, i) => {
          const place = catalog[i % catalog.length]!;
          return { dayNumber: i + 1, activities: { create: { title: place.name, position: 0, placeId: place.id,
            notes: null, startMinute: null, endMinute: null, estimatedCostVnd: null } } };
        }) } }, include: tripInclude });
      return this.receipt(tx, userId, operation, key, hash, tripDetail(row));
    });
  }
  async detail(userId: string, rawId: unknown) {
    const id = uuid(rawId);
    return this.database.db.$transaction(async tx => {
      const row = await tx.trip.findFirst({ where: { id, ownerId: userId }, include: tripInclude });
      if (!row) throw new ApiFault('TRIP_NOT_FOUND', 404);
      return tripDetail(row);
    }, readOptions);
  }
  async list(userId: string, query: Record<string, unknown>): Promise<TripListResponse> {
    if (!query || Object.keys(query).some(key => !['limit', 'cursorUpdatedAt', 'cursorId'].includes(key))) invalid();
    const rawLimit = query['limit'] ?? '20';
    if (typeof rawLimit !== 'string' || !/^[1-9][0-9]?$/.test(rawLimit) || String(Number(rawLimit)) !== rawLimit || Number(rawLimit) > 50) invalid();
    const limit = Number(rawLimit);
    let cursor: { updatedAt: string; id: string } | undefined;
    if (query['cursorUpdatedAt'] !== undefined || query['cursorId'] !== undefined) {
      const value = { updatedAt: query['cursorUpdatedAt'], id: query['cursorId'] };
      if (!isTripCursor(value)) invalid();
      cursor = { updatedAt: value.updatedAt, id: value.id.toLowerCase() };
    }
    return this.database.db.$transaction(async tx => {
      const rows = await tx.trip.findMany({ where: { ownerId: userId, ...(cursor ? { OR: [
        { updatedAt: { lt: new Date(cursor.updatedAt) } }, { updatedAt: new Date(cursor.updatedAt), id: { gt: cursor.id } },
      ] } : {}) }, orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }], take: limit + 1 });
      const trips = rows.slice(0, limit).map(tripSummary), last = trips.at(-1);
      const value = { trips, nextCursor: rows.length > limit && last ? { updatedAt: last.updatedAt, id: last.id } : null };
      if (!isTripListResponse(value)) throw new Error('Stored trip list failed response validation.');
      return value;
    }, readOptions);
  }
  async update(userId: string, rawId: unknown, rawKey: unknown, input: unknown) {
    const id = uuid(rawId), key = uuid(rawKey);
    if (!isUpdateTripRequest(input)) invalid();
    const dto = canonicalUpdateTrip(input), operation = `trip.update:${id}`, hash = requestHash(operation, id, dto);
    await this.owner(userId, id);
    const saved = await this.replay(userId, operation, key, hash);
    if (saved) return saved; // Before version, activity membership or Place eligibility checks.
    if (dto.expectedVersion === MAX_TRIP_VERSION) throw new ApiFault('TRIP_VERSION_LIMIT', 409);
    return this.write(userId, operation, key, hash, async tx => {
      const changed = await tx.trip.updateMany({ where: { id, ownerId: userId, version: dto.expectedVersion },
        data: { version: { increment: 1 }, title: dto.title, groupSize: dto.groupSize,
          budgetVnd: dto.budgetVnd === null ? null : BigInt(dto.budgetVnd), updatedAt: new Date() } });
      if (changed.count !== 1) throw new VersionLost();
      const current = await tx.trip.findFirstOrThrow({ where: { id, ownerId: userId }, include: tripInclude });
      if (dto.days.length !== current.durationDays) invalid();
      await this.validateActivities(tx, dto, current.days.flatMap(day => day.activities));
      await tx.activity.deleteMany({ where: { tripDay: { tripId: id } } });
      const data = dto.days.flatMap((day, index) => day.activities.map((activity, position) => ({
        id: activity.id ?? randomUUID(), tripDayId: current.days[index]!.id, placeId: activity.placeId,
        title: activity.title, notes: activity.notes, position, startMinute: activity.startMinute, endMinute: activity.endMinute,
        estimatedCostVnd: activity.estimatedCostVnd === null ? null : BigInt(activity.estimatedCostVnd),
      })));
      if (data.length) await tx.activity.createMany({ data });
      const result = await tx.trip.findFirstOrThrow({ where: { id, ownerId: userId }, include: tripInclude });
      return this.receipt(tx, userId, operation, key, hash, tripDetail(result));
    });
  }
  private async validateActivities(tx: Prisma.TransactionClient, dto: UpdateTripRequest, existing: Array<{ id: string; placeId: string | null }>) {
    const previous = new Map(existing.map(activity => [activity.id, activity.placeId]));
    const activities = dto.days.flatMap(day => day.activities);
    if (activities.some(activity => activity.id !== null && !previous.has(activity.id))) invalid();
    const ids = [...new Set(activities.flatMap(activity => activity.placeId === null ? [] : [activity.placeId]))];
    await lockPlaces(tx, ids);
    const places = new Map((await tx.place.findMany({ where: { id: { in: ids } } })).map(place => [place.id, place]));
    for (const activity of activities) {
      if (activity.placeId === null) continue;
      const place = places.get(activity.placeId);
      const unchanged = activity.id !== null && previous.get(activity.id) === activity.placeId;
      if (!place || place.destinationCode !== SAMPLE_DESTINATION || !place.isSample || (!place.active && !unchanged)) {
        throw new ApiFault('TRIP_PLACE_UNAVAILABLE', 409);
      }
    }
  }
}

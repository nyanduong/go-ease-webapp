import { createHash } from 'node:crypto';
import {
  catalogEntrySchema,
  createServerTripSchema,
  updateServerTripSchema,
  deleteServerTripSchema,
  tripSchemaWithCatalog,
  tripMutationResultSchema,
  tripMutationResponseSchema,
  serverTripListQuerySchema,
  serverTripListResponseSchema,
  type Trip,
  destinationSchema,
  getDestination,
  discoveryPlaceSchema,
} from '@goease/contracts';
import { ApiFailure } from '../../common/errors/api-failure.js';
import {
  ActorTransactionService,
  assertTransactionActive,
  type Owner,
} from '../../database/actor-transaction.service.js';
import { CatalogService } from '../catalog/catalog.service.js';
import { TripsRepository } from './trips.repository.js';
import { tripRecord } from './trips.mapper.js';
import { isVietnamCoordinate } from '../discovery/vietnam-coverage.js';
import { sameDestination } from '../discovery/dynamic-destinations.js';
export class TripsService {
  constructor(
    private readonly transactions: ActorTransactionService,
    private readonly repository: TripsRepository,
    private readonly catalog: CatalogService,
  ) {}
  async list(owner: Owner, query: unknown, signal: AbortSignal) {
    const parsed = serverTripListQuerySchema.safeParse(query);
    if (!parsed.success)
      throw new ApiFailure(400, 'BAD_REQUEST', 'List chỉ nhận cursor ID hợp lệ.');
    return this.transactions.run(owner, signal, async (tx) => {
      const rows = await this.repository.list(tx, owner, parsed.data.cursor);
      return serverTripListResponseSchema.parse({
        apiVersion: '1',
        nextCursor: rows.length > 20 ? rows[19]!.id : null,
        items: rows.slice(0, 20).map((r) => ({
          id: r.id,
          name: r.name,
          startDate: r.startDate,
          durationDays: r.durationDays,
          people: r.people,
          version: r.version,
          updatedAt: r.updatedAt.toISOString(),
        })),
      });
    });
  }
  async get(owner: Owner, id: string, signal: AbortSignal) {
    return this.transactions.run(owner, signal, async (tx) => {
      const row = await this.repository.read(tx, owner, id);
      if (!row) throw new ApiFailure(404, 'NOT_FOUND', 'Không có chuyến của tài khoản này.');
      return tripRecord(row);
    });
  }
  async mutate(
    owner: Owner,
    operation: 'create' | 'update' | 'delete',
    id: string,
    input: unknown,
    signal: AbortSignal,
  ) {
    const parsed = (
      operation === 'create'
        ? createServerTripSchema
        : operation === 'update'
          ? updateServerTripSchema
          : deleteServerTripSchema
    ).safeParse(input);
    if (!parsed.success)
      throw new ApiFailure(
        400,
        'BAD_REQUEST',
        'Mutation cần mutationId, dữ liệu chuyến/version đúng contract; không nhận owner/role.',
      );
    const data = parsed.data,
      trip: Trip | undefined = 'trip' in data ? data.trip : undefined,
      expected = 'expectedVersion' in data ? data.expectedVersion : undefined;
    if (trip && trip.id !== id) throw new ApiFailure(400, 'BAD_REQUEST', 'ID chuyến không hợp lệ.');
    const hash = createHash('sha256').update(JSON.stringify({ operation, id, data })).digest('hex');
    return this.transactions.run(owner, signal, async (tx) => {
      await this.repository.lockOwner(tx, owner);
      assertTransactionActive(signal);
      await this.repository.expireMutations(tx, owner);
      const old = await this.repository.mutation(tx, owner, data.mutationId);
      if (old) {
        if (old.requestHash !== hash)
          throw new ApiFailure(
            409,
            'IDEMPOTENCY_CONFLICT',
            'mutationId đã dùng cho nội dung khác; không ghi đè.',
          );
        return tripMutationResponseSchema.parse({
          apiVersion: '1',
          mutationId: data.mutationId,
          replayed: true,
          result: tripMutationResultSchema.parse(old.result),
        });
      }
      if ((await this.repository.mutationCount(tx, owner)) >= 200)
        throw new ApiFailure(429, 'TRIP_LIMIT', 'Đạt 200 thao tác mới trong 24 giờ của tài khoản.');
      const current = await this.repository.current(tx, owner, id);
      if (trip) {
        const destination = trip.destination ?? getDestination(trip.destinationId);
        const previousDestination = destinationSchema.safeParse(current?.destination);
        const unchangedHistoricalDestination =
          operation === 'update' &&
          previousDestination.success &&
          destination &&
          sameDestination(previousDestination.data, destination);
        if (
          !unchangedHistoricalDestination &&
          (!destination ||
            destination.countryCode !== 'VN' ||
            !isVietnamCoordinate(destination.center))
        )
          throw new ApiFailure(
            400,
            'BAD_REQUEST',
            'Chuyến mới và điểm đến thay đổi chỉ hỗ trợ địa điểm tại Việt Nam.',
          );
        const catalog = await this.catalog.validationEntries(tx);
        const places = catalog.map((p) => {
          const { id, name, destinationId, coordinates, sources } = catalogEntrySchema.parse(
            p.snapshot,
          );
          return { id, name, destinationId, coordinates, sources };
        });
        const previous = await this.repository.activities(tx, owner, id);
        const old = new Map(previous.map((a) => [a.id, a]));
        if (
          trip.days.some((day) =>
            day.activities.some((activity) => {
              if (
                activity.location.kind !== 'discovered' ||
                isVietnamCoordinate(activity.location.placeSnapshot.coordinates)
              )
                return false;
              const savedLocation = old.get(activity.id)?.locationSnapshot;
              const savedPlace = discoveryPlaceSchema.safeParse(
                savedLocation && typeof savedLocation === 'object' && !Array.isArray(savedLocation)
                  ? savedLocation.placeSnapshot
                  : undefined,
              );
              const place = activity.location.placeSnapshot;
              const unchangedHistoricalPlace =
                operation === 'update' &&
                savedPlace.success &&
                savedPlace.data.id === place.id &&
                savedPlace.data.provider === place.provider &&
                savedPlace.data.externalId === place.externalId &&
                savedPlace.data.destinationId === place.destinationId &&
                savedPlace.data.coordinates.latitude === place.coordinates.latitude &&
                savedPlace.data.coordinates.longitude === place.coordinates.longitude;
              return !unchangedHistoricalPlace;
            }),
          )
        )
          throw new ApiFailure(
            400,
            'BAD_REQUEST',
            'Địa điểm mới hoặc tọa độ thay đổi chỉ hỗ trợ trong Việt Nam.',
          );
        // Validate legacy names against their saved activity, while new references need the current canonical name.
        const checking = {
          ...trip,
          days: trip.days.map((d) => ({
            ...d,
            activities: d.activities.map((a) => {
              const location = a.location,
                prior = old.get(a.id);
              return location.kind === 'catalog' &&
                prior?.placeId === location.placeId &&
                prior.name === a.name
                ? { ...a, name: places.find((p) => p.id === location.placeId)?.name ?? a.name }
                : a;
            }),
          })),
        };
        if (!tripSchemaWithCatalog(places).safeParse(checking).success)
          throw new ApiFailure(400, 'BAD_REQUEST', 'Catalog/ngày/giờ/tiền không hợp lệ.');
        if (
          trip.days.some((d) =>
            d.activities.some((a) => {
              const location = a.location;
              return (
                location.kind === 'catalog' &&
                catalog.find((p) => p.id === location.placeId)?.enabled === false &&
                old.get(a.id)?.placeId !== location.placeId
              );
            }),
          )
        )
          throw new ApiFailure(
            400,
            'BAD_REQUEST',
            'Địa điểm đã vô hiệu hóa chỉ được giữ trong hoạt động đã lưu trước đó.',
          );
      }
      if (operation === 'create') {
        if (current)
          throw new ApiFailure(
            409,
            'TRIP_CONFLICT',
            'ID chuyến đã tồn tại hoặc đã xóa; không tạo lại với ID này.',
          );
        if (
          (await this.repository.count(tx, owner)) >= 200 ||
          (await this.repository.count(tx, owner, true)) >= 50
        )
          throw new ApiFailure(
            429,
            'TRIP_LIMIT',
            'Giới hạn MVP: 50 chuyến đang lưu, 200 ID đã dùng/tài khoản.',
          );
      } else if (!current || current.deletedAt)
        throw new ApiFailure(404, 'NOT_FOUND', 'Không có chuyến của tài khoản này.');
      else if (current.version !== expected || current.version === 2147483647)
        throw new ApiFailure(
          409,
          'TRIP_CONFLICT',
          'Version đã thay đổi; đọc lại trước khi sửa/xóa.',
        );
      const timestamp = new Date();
      let result;
      if (operation === 'delete') {
        const updated = await this.repository.remove(tx, owner, id, timestamp);
        result = {
          kind: 'deleted' as const,
          id,
          version: updated.version,
          deletedAt: timestamp.toISOString(),
        };
      } else {
        const saved = tripRecord(
          await this.repository.save(tx, owner, trip!, operation === 'create', timestamp),
        );
        result = {
          kind: 'saved' as const,
          trip: saved.trip,
          version: saved.version,
          updatedAt: saved.updatedAt,
        };
      }
      const checked = tripMutationResultSchema.parse(result);
      assertTransactionActive(signal);
      await this.repository.receipt(tx, owner, data.mutationId, hash, checked);
      return tripMutationResponseSchema.parse({
        apiVersion: '1',
        mutationId: data.mutationId,
        replayed: false,
        result: checked,
      });
    });
  }
}

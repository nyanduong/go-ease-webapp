import {
  serverTripSchema,
  serverTripListResponseSchema,
  tripMutationResponseSchema,
  createServerTripSchema,
  updateServerTripSchema,
  deleteServerTripSchema,
} from '@goease/contracts';
import {
  ServerTripError,
  type ServerTripRequest,
  type callServerTripApi,
} from './server-trip-controller.js';

export const OFFLINE_TRIPS_KEY = 'goease.dev-offline.trips.v1';
// Workspace marker only; this is never an authenticated identity or a bearer token.
export const OFFLINE_WORKSPACE_OWNER =
  'offline'.padEnd(20, '0') + '.00000000-0000-4000-8000-000000000001';
interface Storage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}
export type OfflineTransaction = <T>(work: (storage: Storage) => Promise<T>) => Promise<T>;
type Saved = ReturnType<typeof serverTripSchema.parse>;
type Receipt = { input: string; output: ReturnType<typeof tripMutationResponseSchema.parse> };

/** Runs entirely inside one storage transaction, including version checks and replay receipts. */
export function createOfflineTripRequest(
  transaction: OfflineTransaction,
  now = () => new Date().toISOString(),
) {
  return (operation: ServerTripRequest): ReturnType<typeof callServerTripApi> =>
    transaction(async (storage) => {
      const raw = await storage.getItem(OFFLINE_TRIPS_KEY);
      let trips: Saved[] = [],
        receipts: Receipt[] = [];
      if (raw !== null) {
        const value = JSON.parse(raw);
        if (
          value?.version !== 1 ||
          !Array.isArray(value.trips) ||
          !Array.isArray(value.receipts) ||
          Object.keys(value).some((key) => !['version', 'trips', 'receipts'].includes(key))
        )
          throw Error('Kho dev offline không hợp lệ; dữ liệu được giữ nguyên.');
        trips = value.trips.map((trip: unknown) => serverTripSchema.parse(trip));
        if (new Set(trips.map((saved) => saved.trip.id)).size !== trips.length)
          throw Error('Trùng ID trong kho dev offline.');
        receipts = value.receipts.map((receipt: Receipt) => {
          if (typeof receipt.input !== 'string') throw Error('Biên nhận dev offline không hợp lệ.');
          return { input: receipt.input, output: tripMutationResponseSchema.parse(receipt.output) };
        });
      }
      if (operation.kind === 'list') {
        const sorted = [...trips].sort((a, b) =>
          a.trip.id < b.trip.id ? -1 : a.trip.id > b.trip.id ? 1 : 0,
        );
        const remaining = sorted.filter(
          (saved) => !operation.cursor || saved.trip.id > operation.cursor,
        );
        const page = remaining.slice(0, 20);
        const items = page.map(({ trip, version, updatedAt }) => ({
          id: trip.id,
          name: trip.name,
          destinationId: trip.destinationId,
          startDate: trip.startDate,
          durationDays: trip.durationDays,
          people: trip.people,
          version,
          updatedAt,
        }));
        return {
          kind: 'list' as const,
          data: serverTripListResponseSchema.parse({
            apiVersion: '1',
            items,
            nextCursor: remaining.length > 20 ? page.at(-1)!.trip.id : null,
          }),
        };
      }
      const id =
        operation.kind === 'get' || operation.kind === 'delete' ? operation.id : operation.trip.id;
      const old = trips.find((saved) => saved.trip.id === id);
      if (operation.kind === 'get') {
        if (!old) throw new ServerTripError('NOT_FOUND', 'Không có chuyến local.', 404);
        return { kind: 'get' as const, data: { apiVersion: '1' as const, ...old } };
      }
      const payload =
        operation.kind === 'create'
          ? createServerTripSchema.parse({ mutationId: operation.mutationId, trip: operation.trip })
          : operation.kind === 'update'
            ? updateServerTripSchema.parse({
                mutationId: operation.mutationId,
                trip: operation.trip,
                expectedVersion: operation.expectedVersion,
              })
            : deleteServerTripSchema.parse({
                mutationId: operation.mutationId,
                expectedVersion: operation.expectedVersion,
              });
      if (operation.kind === 'update' && operation.id !== id) throw Error('ID chuyến không khớp.');
      const input = JSON.stringify({ kind: operation.kind, id, payload });
      const replay = receipts.find((receipt) => receipt.output.mutationId === operation.mutationId);
      if (replay) {
        if (replay.input !== input)
          throw new ServerTripError('CONFLICT', 'Mutation đã dùng cho nội dung khác.', 409);
        return { kind: 'mutation' as const, data: { ...replay.output, replayed: true } };
      }
      if (operation.kind === 'create' ? !!old : !old || old.version !== operation.expectedVersion)
        throw new ServerTripError('CONFLICT', 'Chuyến local đã đổi. Tải lại trước khi lưu.', 409);
      const version = operation.kind === 'create' ? 1 : operation.expectedVersion + 1;
      const updatedAt = now();
      const result =
        operation.kind === 'delete'
          ? { kind: 'deleted' as const, id, version, deletedAt: updatedAt }
          : { kind: 'saved' as const, trip: operation.trip, version, updatedAt };
      const output = tripMutationResponseSchema.parse({
        apiVersion: '1',
        mutationId: operation.mutationId,
        replayed: false,
        result,
      });
      trips = trips.filter((saved) => saved.trip.id !== id);
      if (result.kind === 'saved')
        trips.push(
          serverTripSchema.parse({
            trip: result.trip,
            version: result.version,
            updatedAt: result.updatedAt,
          }),
        );
      // Keep recent retries bounded; the UI has at most one pending mutation.
      receipts = [...receipts.slice(-99), { input, output }];
      await storage.setItem(OFFLINE_TRIPS_KEY, JSON.stringify({ version: 1, trips, receipts }));
      return { kind: 'mutation' as const, data: output };
    });
}

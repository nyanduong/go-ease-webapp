import { idSchema, tripSchema, type Trip } from '@goease/contracts';

export const STORAGE_KEY = 'goease.guest-trips.v1';
export interface StorageTransport { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void> }
export type StorageErrorCode = 'READ' | 'WRITE' | 'CORRUPT' | 'VERSION' | 'CONFLICT' | 'NOT_FOUND' | 'INVALID' | 'BUSY';
export class TripStorageError extends Error {
  constructor(public readonly code: StorageErrorCode, message: string) { super(message); this.name = 'TripStorageError'; }
}
export interface SavedTrip { trip: Trip; revision: number }
export interface StorageIssue { index: number; code: 'INVALID_RECORD' | 'DUPLICATE_ID' }
export interface TripList { trips: SavedTrip[]; issues: StorageIssue[] }

const queues = new WeakMap<StorageTransport, Promise<unknown>>();
function object(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function revision(value: unknown): value is number { return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1; }
function parseTrip(input: unknown): Trip {
  const parsed = tripSchema.safeParse(input);
  if (!parsed.success) throw new TripStorageError('INVALID', 'Chuyến không hợp lệ; kiểm tra nội dung trước khi lưu.');
  return parsed.data;
}

export function createLocalTripRepository(storage: StorageTransport) {
  // All repository instances using this transport share the same in-process queue.
  function enqueue<T>(action: () => Promise<T>): Promise<T> {
    const result = (queues.get(storage) ?? Promise.resolve()).then(action);
    queues.set(storage, result.catch(() => undefined));
    return result;
  }
  async function read(): Promise<TripList> {
    let raw: string | null;
    try { raw = await storage.getItem(STORAGE_KEY); }
    catch { throw new TripStorageError('READ', 'Không đọc được chuyến trên máy. Hãy thử lại.'); }
    if (raw === null) return { trips: [], issues: [] };
    let value: unknown;
    try { value = JSON.parse(raw); }
    catch { throw new TripStorageError('CORRUPT', 'Kho chuyến không đọc được. Dữ liệu vẫn được giữ nguyên.'); }
    if (!object(value)) throw new TripStorageError('CORRUPT', 'Cấu trúc kho chuyến không hợp lệ.');
    if (value.storageVersion !== 1) throw new TripStorageError('VERSION', 'Phiên bản kho chuyến chưa được hỗ trợ. Dữ liệu vẫn được giữ nguyên.');
    if (!Array.isArray(value.trips) || Object.keys(value).some((key) => !['storageVersion', 'trips'].includes(key))) {
      throw new TripStorageError('CORRUPT', 'Cấu trúc kho chuyến không hợp lệ.');
    }
    const candidates: { saved: SavedTrip; index: number }[] = [];
    const issues: StorageIssue[] = [];
    value.trips.forEach((record: unknown, index: number) => {
      if (!object(record) || !revision(record.revision) || Object.keys(record).some((key) => !['trip', 'revision'].includes(key))) {
        issues.push({ index, code: 'INVALID_RECORD' }); return;
      }
      const trip = tripSchema.safeParse(record.trip);
      if (!trip.success) { issues.push({ index, code: 'INVALID_RECORD' }); return; }
      candidates.push({ saved: { trip: trip.data, revision: record.revision }, index });
    });
    const counts = new Map<string, number>();
    candidates.forEach(({ saved }) => counts.set(saved.trip.id, (counts.get(saved.trip.id) ?? 0) + 1));
    const trips: SavedTrip[] = [];
    candidates.forEach(({ saved, index }) => {
      if (counts.get(saved.trip.id)! > 1) issues.push({ index, code: 'DUPLICATE_ID' });
      else trips.push(saved);
    });
    return { trips, issues };
  }
  async function writable(): Promise<SavedTrip[]> {
    const result = await read();
    if (result.issues.length) throw new TripStorageError('CORRUPT', 'Kho có bản ghi lỗi. Tạm chặn ghi để giữ nguyên dữ liệu; hãy báo người phụ trách.');
    return result.trips;
  }
  async function write(trips: SavedTrip[]): Promise<void> {
    try { await storage.setItem(STORAGE_KEY, JSON.stringify({ storageVersion: 1, trips })); }
    catch { throw new TripStorageError('WRITE', 'Không lưu được chuyến. Nội dung chưa lưu vẫn được giữ để thử lại.'); }
  }
  return {
    list: () => enqueue(read),
    get: (id: string) => enqueue(async () => {
      idSchema.parse(id); const result = await read();
      if (result.issues.length) throw new TripStorageError('CORRUPT', 'Kho có bản ghi lỗi. Dùng danh sách kèm cảnh báo để kiểm tra.');
      return result.trips.find((saved) => saved.trip.id === id);
    }),
    async create(input: unknown): Promise<SavedTrip> {
      const trip = parseTrip(input); // snapshot before waiting on another operation
      return enqueue(async () => {
        const trips = await writable();
        if (trips.some((saved) => saved.trip.id === trip.id)) throw new TripStorageError('CONFLICT', 'ID chuyến đã tồn tại; không ghi đè.');
        const saved = { trip, revision: 1 };
        await write([...trips, saved]); return saved;
      });
    },
    async update(input: unknown, expectedRevision: number): Promise<SavedTrip> {
      const trip = parseTrip(input);
      return enqueue(async () => {
        const trips = await writable();
        const index = trips.findIndex((saved) => saved.trip.id === trip.id);
        const old = trips[index];
        if (!old) throw new TripStorageError('NOT_FOUND', 'Chuyến không còn trong kho.');
        if (!revision(expectedRevision) || old.revision !== expectedRevision || old.revision === Number.MAX_SAFE_INTEGER) throw new TripStorageError('CONFLICT', 'Chuyến đã thay đổi. Tải lại trước khi sửa tiếp.');
        const saved = { trip, revision: old.revision + 1 };
        trips[index] = saved; await write(trips); return saved;
      });
    },
    delete: (id: string, expectedRevision: number) => enqueue(async () => {
      idSchema.parse(id);
      const trips = await writable();
      const old = trips.find((saved) => saved.trip.id === id);
      if (!old) throw new TripStorageError('NOT_FOUND', 'Chuyến không còn trong kho.');
      if (!revision(expectedRevision) || old.revision !== expectedRevision) throw new TripStorageError('CONFLICT', 'Chuyến đã thay đổi. Tải lại trước khi xóa.');
      await write(trips.filter((saved) => saved.trip.id !== id));
    }),
  };
}
export type TripRepository = ReturnType<typeof createLocalTripRepository>;

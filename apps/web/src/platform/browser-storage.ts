import {
  createLocalTripRepository,
  STORAGE_KEY,
  type TripRepository,
  type StorageTransport,
} from '@goease/trip-storage';

let database: Promise<IDBDatabase> | undefined;
function openDatabase() {
  database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('goease.customer.v1', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('values');
    request.onerror = () => {
      database = undefined;
      reject(Error('Không mở được bộ nhớ trình duyệt.'));
    };
    request.onblocked = () => {
      database = undefined;
      reject(Error('Đóng tab GoEase cũ rồi thử lại.'));
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        database = undefined;
      };
      resolve(db);
    };
  });
  return database;
}
function result<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
// One transaction spans read/check/write. IndexedDB serializes it across tabs, preventing lost revisions.
async function transaction<T>(work: (transport: StorageTransport) => Promise<T>): Promise<T> {
  const db = await openDatabase(),
    tx = db.transaction('values', 'readwrite'),
    store = tx.objectStore('values');
  const completed = new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? Error('Không lưu được trên trình duyệt.'));
    tx.onerror = () => {};
  });
  const transport: StorageTransport = {
    async getItem(key) {
      const value = await result(store.get(key));
      if (value !== undefined) return value as string;
      // Preserve guest trips previously made in Expo Web on this same origin, without deleting original bytes.
      const legacy = key === STORAGE_KEY ? localStorage.getItem(key) : null;
      if (legacy !== null) await result(store.put(legacy, key));
      return legacy;
    },
    async setItem(key, value) {
      await result(store.put(value, key));
    },
  };
  try {
    const value = await work(transport);
    await completed;
    return value;
  } catch (error) {
    try {
      tx.abort();
    } catch {
      /* Already complete. */
    }
    await completed.catch(() => {});
    throw error;
  }
}
export const browserStorage = {
  get: (key: string) => transaction((store) => store.getItem(key)),
  set: (key: string, value: string) => transaction((store) => store.setItem(key, value)),
};
export const browserTrips: TripRepository = {
  list: () => transaction((store) => createLocalTripRepository(store).list()),
  get: (id) => transaction((store) => createLocalTripRepository(store).get(id)),
  create: (trip) => transaction((store) => createLocalTripRepository(store).create(trip)),
  update: (trip, revision) =>
    transaction((store) => createLocalTripRepository(store).update(trip, revision)),
  delete: (id, revision) =>
    transaction((store) => createLocalTripRepository(store).delete(id, revision)),
};

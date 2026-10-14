import { tripSchema, type Trip } from '@goease/contracts';
import { TripStorageError, type SavedTrip, type TripList, type TripRepository } from './repository.js';

interface Draft { trip: Trip; baseRevision: number | null }
export interface TripState extends TripList {
  loadStatus: 'idle' | 'loading' | 'ready' | 'error'; writeStatus: 'idle' | 'saving' | 'deleting' | 'error';
  readError: Error | null; writeError: Error | null; draft: Draft | null;
}
function freeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze); Object.freeze(value);
  }
  return value;
}
export function createTripStore(repository: TripRepository) {
  let state: TripState = freeze({ trips: [], issues: [], loadStatus: 'idle', writeStatus: 'idle', readError: null, writeError: null, draft: null });
  let busy = false;
  const listeners = new Set<() => void>();
  const set = (patch: Partial<TripState>) => { state = freeze({ ...state, ...patch }); listeners.forEach((listener) => listener()); };
  function assertIdle() { if (busy) throw new TripStorageError('BUSY', 'Đang xử lý chuyến. Hãy chờ thao tác hoàn tất.'); }
  function assertNoDraft() { assertIdle(); if (state.draft) throw new TripStorageError('CONFLICT', 'Lưu hoặc hủy draft hiện tại trước.'); }
  const error = (cause: unknown) => cause instanceof Error ? cause : new Error('Không xử lý được chuyến.');
  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    async load(): Promise<boolean> {
      if (busy) return false;
      busy = true; set({ loadStatus: 'loading', readError: null });
      try { const result = await repository.list(); set({ ...result, loadStatus: 'ready' }); return true; }
      catch (cause) { set({ loadStatus: 'error', readError: error(cause) }); return false; }
      finally { busy = false; }
    },
    beginNew(input: unknown) { assertNoDraft(); set({ draft: { trip: tripSchema.parse(input), baseRevision: null }, writeStatus: 'idle', writeError: null }); },
    beginEdit(saved: SavedTrip) { assertNoDraft(); set({ draft: { trip: tripSchema.parse(saved.trip), baseRevision: saved.revision }, writeStatus: 'idle', writeError: null }); },
    changeDraft(input: unknown) {
      assertIdle(); if (!state.draft) throw new TripStorageError('NOT_FOUND', 'Chưa có draft.');
      const trip = tripSchema.parse(input);
      if (trip.id !== state.draft.trip.id) throw new TripStorageError('CONFLICT', 'Không đổi ID của draft.');
      set({ draft: { ...state.draft, trip }, writeStatus: 'idle', writeError: null });
    },
    cancelDraft() { assertIdle(); set({ draft: null, writeStatus: 'idle', writeError: null }); },
    async saveDraft(): Promise<boolean> {
      if (busy || !state.draft) return false;
      const draft = state.draft; busy = true; set({ writeStatus: 'saving', writeError: null });
      try {
        const saved = draft.baseRevision === null ? await repository.create(draft.trip) : await repository.update(draft.trip, draft.baseRevision);
        const exists = state.trips.some((item) => item.trip.id === saved.trip.id);
        set({ trips: exists ? state.trips.map((item) => item.trip.id === saved.trip.id ? saved : item) : [...state.trips, saved], draft: null, writeStatus: 'idle' });
        return true;
      } catch (cause) { set({ writeStatus: 'error', writeError: error(cause) }); return false; }
      finally { busy = false; }
    },
    async deleteSaved(id: string, expectedRevision: number): Promise<boolean> {
      if (busy) return false;
      // Don't let a background delete invalidate an active editor draft.
      if (state.draft?.trip.id === id) { set({ writeStatus: 'error', writeError: new TripStorageError('CONFLICT', 'Hủy draft trước khi xóa chuyến này.') }); return false; }
      busy = true; set({ writeStatus: 'deleting', writeError: null });
      try { await repository.delete(id, expectedRevision); set({ trips: state.trips.filter((item) => item.trip.id !== id), writeStatus: 'idle' }); return true; }
      catch (cause) { set({ writeStatus: 'error', writeError: error(cause) }); return false; }
      finally { busy = false; }
    },
  };
}

import { tripSchema, serverVersionSchema, createServerTripSchema, updateServerTripSchema, deleteServerTripSchema, serverTripListResponseSchema, type Trip, type ServerTrip } from '@goease/contracts';
import { ServerTripError, type ServerTripRequest, type callServerTripApi } from './server-trip-controller';

type Draft = { trip: Trip; baseVersion: number | null };
type Write = Extract<ServerTripRequest, { kind: 'create' | 'update' | 'delete' }>;
type Items = ReturnType<typeof serverTripListResponseSchema.parse>['items'];
export interface AccountTripState {
  owner: string | null; ready: boolean; busy: boolean; items: Items; cursor: string | null;
  selected: ServerTrip | null; draft: Draft | null; pending: Write | null; latest: ServerTrip | null;
  conflict: boolean; message: string; durable: boolean;
}
interface Storage { get(key: string): Promise<string | null>; set(key: string, value: string): Promise<void> }
function freeze<T>(value: T): T { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
const empty = (): AccountTripState => ({ owner: null, ready: false, busy: false, items: [], cursor: null, selected: null, draft: null, pending: null, latest: null, conflict: false, message: '', durable: true });
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const key = (owner: string) => 'goease.account-workspace.v1.' + owner;
function write(value: unknown): Write {
  if (!value || typeof value !== 'object') throw Error();
  const v = value as Record<string, unknown>, { kind, id, ...payload } = v;
  if (kind === 'create' && !('id' in v)) return { kind, ...createServerTripSchema.parse(payload) };
  if (kind === 'update') { const data = updateServerTripSchema.parse(payload); if (id !== data.trip.id) throw Error(); return { kind, id: data.trip.id, ...data }; }
  if (kind === 'delete' && typeof id === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(id)) return { kind, id, ...deleteServerTripSchema.parse(payload) };
  throw Error();
}
export function createAccountTrips(options: { storage: Storage; request: (operation: ServerTripRequest) => ReturnType<typeof callServerTripApi>; newId: () => string }) {
  let state = freeze(empty()), generation = 0, queue = Promise.resolve();
  const listeners = new Set<() => void>();
  const set = (patch: Partial<AccountTripState>) => { state = freeze({ ...state, ...patch }); listeners.forEach(listener => listener()); };
  function persist() {
    const owner = state.owner; if (!owner) return Promise.resolve();
    const encoded = JSON.stringify({ schemaVersion: 1, owner, draft: state.draft, pending: state.pending });
    // Capture owner/content before awaiting. Never redirect a late write to another account.
    const operation = queue.catch(() => {}).then(() => options.storage.set(key(owner), encoded)); queue = operation;
    return operation;
  }
  function editable() { if (!state.ready || state.busy || state.pending || !state.owner) throw Error('Đăng nhập lại hoặc xử lý yêu cầu đang chờ trước.'); }
  function error(cause: unknown) { return cause instanceof ServerTripError ? cause.message : 'Không đọc/ghi được dữ liệu tài khoản. Bản nháp được giữ; chưa xác nhận đồng bộ.'; }
  async function saveLocal() {
    const epoch = generation;
    try { await persist(); if (epoch === generation) set({ durable: true }); return true; }
    catch { if (epoch === generation) set({ durable: false, message: 'Chưa ghi được bản nháp an toàn trên máy. Không gửi server; giữ màn này và thử lưu lại.' }); return false; }
  }
  async function request(operation: ServerTripRequest, apply: (result: Awaited<ReturnType<typeof callServerTripApi>>) => void) {
    if (!state.ready || state.busy || !state.owner) return false;
    const epoch = generation; set({ busy: true, message: 'Đang kết nối server…' });
    try { const result = await options.request(operation); if (epoch !== generation) return false; apply(result); return true; }
    catch (cause) { if (epoch === generation) set({ message: error(cause) }); return false; }
    finally { if (epoch === generation) set({ busy: false }); }
  }
  async function send() {
    if (!state.ready || state.busy || !state.pending || !state.owner) return false;
    const epoch = generation, operation = clone(state.pending); let stage: 'persist' | 'request' | 'cleanup' = 'persist'; set({ busy: true, message: 'Đang lưu yêu cầu trên máy trước khi gửi…' });
    try {
      await persist(); if (epoch !== generation) return false;
      stage = 'request'; set({ durable: true });
      const result = await options.request(operation); if (epoch !== generation || result.kind !== 'mutation') return false;
      const saved = result.data.result;
      set({ pending: null, draft: null, latest: null, conflict: false, selected: saved.kind === 'saved' && !result.data.replayed ? { trip: saved.trip, version: saved.version, updatedAt: saved.updatedAt } : null,
        items: [...state.items.filter(item => item.id !== (saved.kind === 'saved' ? saved.trip.id : saved.id)), ...(saved.kind === 'saved' && !result.data.replayed ? [{ id: saved.trip.id, name: saved.trip.name, startDate: saved.trip.startDate, durationDays: saved.trip.durationDays, people: saved.trip.people, version: saved.version, updatedAt: saved.updatedAt }] : [])],
        message: result.data.replayed ? 'Đã nhận biên nhận cũ. Tải lại danh sách và đọc server trước khi sửa tiếp.' : saved.kind === 'saved' ? `Đã lưu trên server · v${saved.version}.` : 'Đã xóa chuyến server. Chuyến khách giữ nguyên.', durable: true });
      stage = 'cleanup'; await persist(); return true;
    } catch (cause) {
      if (epoch !== generation) return false;
      const definitive = cause instanceof ServerTripError && [400, 404, 409, 429].includes(cause.status);
      if (definitive) {
        set({ pending: null, conflict: cause instanceof ServerTripError && cause.status === 409, message: error(cause) + ' Bản nháp giữ nguyên; đọc bản mới để đối chiếu.' });
        if (!await saveLocal()) return false;
      } else if (stage === 'request') set({ message: error(cause) + ' Giữ nguyên yêu cầu để thử lại sau khi đăng nhập/kết nối lại.', durable: true });
      else set({ message: stage === 'cleanup' ? 'Server đã trả kết quả, nhưng chưa dọn được yêu cầu cũ trên máy. Thử ghi lại trạng thái local; sau mở lại có thể cần replay/đối soát.' : 'Chưa lưu được yêu cầu trên máy nên chưa gửi server. Giữ màn này và thử ghi lại.', durable: false });
      return false;
    } finally { if (epoch === generation) set({ busy: false }); }
  }
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    lock() { generation++; set(empty()); },
    async activate(owner: string) {
      if (!/^[a-z0-9]{20}\.[0-9a-f-]{36}$/i.test(owner)) throw Error('Identity không hợp lệ.');
      generation++; const epoch = generation; set({ ...empty(), owner, busy: true });
      try {
        await queue.catch(() => {}); const raw = await options.storage.get(key(owner)); if (epoch !== generation) return false;
        let draft: Draft | null = null, pending: Write | null = null;
        if (raw) {
          if (raw.length > 600000) throw Error(); const value = JSON.parse(raw);
          if (value.schemaVersion !== 1 || value.owner !== owner || Object.keys(value).some(k => !['schemaVersion','owner','draft','pending'].includes(k))) throw Error();
          if (value.draft !== null) { if (!value.draft || Object.keys(value.draft).some(k => !['trip','baseVersion'].includes(k))) throw Error(); draft = { trip: tripSchema.parse(value.draft.trip), baseVersion: value.draft.baseVersion === null ? null : serverVersionSchema.parse(value.draft.baseVersion) }; }
          if (value.pending !== null) pending = write(value.pending);
          if (pending && pending.kind !== 'delete' && (!draft || JSON.stringify(pending.trip) !== JSON.stringify(draft.trip) || (pending.kind === 'update' ? pending.expectedVersion !== draft.baseVersion : draft.baseVersion !== null))) throw Error();
        }
        set({ ready: true, draft, pending, message: pending ? 'Có yêu cầu chưa xác nhận. Thử lại đúng yêu cầu cũ; không tạo bản mới.' : draft ? 'Đã khôi phục bản nháp riêng của tài khoản này; chưa đồng bộ.' : 'Chưa tải danh sách server.' }); return true;
      } catch { if (epoch === generation) set({ ready: false, message: 'Không đọc được bản nháp tài khoản. Giữ nguyên bytes, không ghi đè hoặc lấy dữ liệu khách thay thế.' }); return false; }
      finally { if (epoch === generation) set({ busy: false }); }
    },
    list(more = false) { return request({ kind: 'list', ...(more && state.cursor ? { cursor: state.cursor } : {}) }, result => { if (result.kind === 'list') set({ items: more ? [...state.items, ...result.data.items.filter(t => !state.items.some(old => old.id === t.id))] : result.data.items, cursor: result.data.nextCursor, message: 'Danh sách server đã tải.' }); }); },
    read(id: string) { return request({ kind: 'get', id }, result => { if (result.kind === 'get') { if (state.draft || state.pending) set({ latest: result.data, message: 'Đã đọc bản server để đối chiếu; bản nháp giữ nguyên.' }); else set({ selected: result.data, message: 'Đã đọc chuyến server.' }); } }); },
    async begin(trip: Trip, version: number | null = null) { editable(); if (state.draft) throw Error('Lưu hoặc bỏ bản nháp hiện tại trước.'); set({ draft: { trip: tripSchema.parse(trip), baseVersion: version === null ? null : serverVersionSchema.parse(version) }, latest: null, conflict: false }); return saveLocal(); },
    async change(trip: Trip) { editable(); if (!state.draft || trip.id !== state.draft.trip.id) throw Error('Không đổi ID bản nháp.'); set({ draft: { ...state.draft, trip: tripSchema.parse(trip) } }); return saveLocal(); },
    async discard() { editable(); set({ draft: null, latest: null, conflict: false }); return saveLocal(); },
    async rebase() { editable(); if (!state.draft || !state.latest || state.latest.trip.id !== state.draft.trip.id) throw Error('Đọc cùng ID chuyến server trước.'); set({ draft: { ...state.draft, baseVersion: state.latest.version }, conflict: false, latest: null }); return saveLocal(); },
    async useLatest() { editable(); if (!state.latest) throw Error('Chưa đọc server.'); set({ selected: state.latest, latest: null, draft: null, conflict: false }); return saveLocal(); },
    async save() { editable(); if (!state.draft || state.conflict) return false; const { trip, baseVersion } = state.draft; const mutationId = options.newId(); set({ pending: baseVersion === null ? { kind: 'create', mutationId, trip } : { kind: 'update', mutationId, id: trip.id, expectedVersion: baseVersion, trip } }); return send(); },
    async remove(saved: ServerTrip) { editable(); if (state.draft) throw Error('Xử lý bản nháp trước khi xóa.'); set({ pending: { kind: 'delete', mutationId: options.newId(), id: saved.trip.id, expectedVersion: saved.version } }); return send(); },
    retry: send,
    checkpoint: saveLocal,
  };
}

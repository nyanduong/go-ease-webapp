import { isTripUuid, type TripCursor, type TripDetail, type TripSummary } from '@goease/contracts';
import { AuthFailure } from '../auth/client.ts';
import type { createNativeAuthStore } from '../auth/store.ts';
import { TripFailure, type createTripsClient, type TripMutation } from './client.ts';
import { copyForm, createBody, emptyCreate, formFromTrip, TripFormFailure, updateBody, type CreateForm, type TripForm } from './form.ts';

type AuthStore = ReturnType<typeof createNativeAuthStore>;
export interface PendingTripMutation extends TripMutation { readonly ownerId: string; readonly submittedRevision: number; readonly acknowledgedId: string | null; readonly receiptVersion: number | null }
export interface TripsState {
  available: boolean; ownerId: string | null; screen: 'list' | 'create' | 'detail' | 'map'; selectedDay: number;
  listStatus: 'idle' | 'loading' | 'ready' | 'error'; trips: TripSummary[]; nextCursor: TripCursor | null; listMessage: string;
  detailStatus: 'idle' | 'loading' | 'ready' | 'error'; detailId: string | null; saved: TripDetail | null; draft: TripForm | null; create: CreateForm;
  revision: number; dirty: boolean; pending: Readonly<PendingTripMutation> | null;
  mutation: 'idle' | 'sending' | 'uncertain' | 'refreshing' | 'conflict'; message: string;
}
function initial(): TripsState {
  return { available: false, ownerId: null, screen: 'list', selectedDay: 1, listStatus: 'idle', trips: [], nextCursor: null, listMessage: '',
    detailStatus: 'idle', detailId: null, saved: null, draft: null, create: emptyCreate(), revision: 0, dirty: false, pending: null, mutation: 'idle', message: '' };
}
export function createTripsStore(client: ReturnType<typeof createTripsClient>, auth: AuthStore, newKey: () => string) {
  let state = initial(), owner: string | null = null, rejectedOwner: string | null = null, generation = 0, readGeneration = 0, listGeneration = 0, mutationGeneration = 0;
  let mutationController: AbortController | undefined, readController: AbortController | undefined, listController: AbortController | undefined;
  const listeners = new Set<() => void>();
  const publish = (patch: Partial<TripsState>) => { state = { ...state, ...patch }; listeners.forEach(listener => listener()); };
  const verifiedOwner = () => { const session = auth.snapshot(); return session.kind === 'signedIn' && session.user ? session.user.id.toLowerCase() : null; };
  const permitted = () => state.available && owner !== null && verifiedOwner() === owner;
  const editable = () => permitted() && state.pending === null && state.mutation !== 'sending' && state.mutation !== 'refreshing';
  const detailEditable = () => editable() && state.detailStatus === 'ready' && state.saved !== null && state.detailId?.toLowerCase() === state.saved.id.toLowerCase();
  function invalidate() {
    generation++; readGeneration++; listGeneration++; mutationGeneration++; mutationController?.abort(); readController?.abort(); listController?.abort();
  }
  function invalidateRead() { readGeneration++; readController?.abort(); }
  function safe(error: unknown) { return error instanceof TripFailure ? error : error instanceof AuthFailure ? new TripFailure(error.code === 'cancelled' ? 'cancelled' : 'session') : new TripFailure('network'); }
  function sessionError(error: unknown) { if (safe(error).code === 'session') { rejectedOwner = owner; void auth.restore(); } }
  async function list(more = false) {
    if (!permitted()) return;
    const cursor = more ? state.nextCursor : undefined; if (more && !cursor) return;
    listController?.abort(); const controller = listController = new AbortController(), id = ++listGeneration, capturedOwner = owner, epoch = generation;
    publish({ listStatus: 'loading', listMessage: 'Đang đọc chuyến từ máy chủ…' });
    try {
      const result = await auth.withSession((token, signal) => client.list(token, signal, cursor ?? undefined), controller.signal);
      if (id !== listGeneration || epoch !== generation || owner !== capturedOwner || !permitted()) return;
      const trips = more ? [...state.trips, ...result.trips.filter(trip => !state.trips.some(old => old.id.toLowerCase() === trip.id.toLowerCase()))] : result.trips;
      publish({ trips, nextCursor: result.nextCursor, listStatus: 'ready', listMessage: trips.length ? 'Các chuyến đã lưu trên máy chủ.' : 'Chưa có chuyến. Tạo một lịch trình mẫu cho nhóm.' });
    } catch (error) {
      if (id !== listGeneration || epoch !== generation || !permitted()) return;
      publish({ listStatus: 'error', listMessage: safe(error).message }); sessionError(error);
    }
  }
  async function open(id: string, discardDraft = false) {
    if (!permitted() || state.pending || state.dirty && !discardDraft || !isTripUuid(id)) return;
    readController?.abort(); const controller = readController = new AbortController(), readId = ++readGeneration, epoch = generation, capturedOwner = owner;
    publish({ screen: 'detail', detailId: id, detailStatus: 'loading', message: 'Đang mở bản đã lưu…' });
    try {
      const trip = await auth.withSession((token, signal) => client.detail(id, token, signal), controller.signal);
      if (readId !== readGeneration || epoch !== generation || capturedOwner !== owner || !permitted()) return;
      publish({ saved: trip, draft: formFromTrip(trip), detailStatus: 'ready', selectedDay: 1, dirty: false, mutation: 'idle', revision: state.revision + 1, message: `Đã đọc phiên bản ${trip.version} từ máy chủ.` });
    } catch (error) {
      if (readId !== readGeneration || epoch !== generation || !permitted()) return;
      publish({ detailStatus: 'error', message: safe(error).message }); sessionError(error);
    }
  }
  async function sendPending() {
    const pending = state.pending;
    if (!permitted() || !pending || pending.ownerId !== owner || state.mutation === 'sending' || state.mutation === 'refreshing') return;
    const capturedOwner = owner, epoch = generation, mutationId = ++mutationGeneration, controller = mutationController = new AbortController();
    publish({ mutation: pending.acknowledgedId ? 'refreshing' : 'sending', message: pending.acknowledgedId ? 'Đã nhận kết quả lưu; đang đọc phiên bản hiện tại…' : 'Đang gửi bản đã khóa. Không tạo yêu cầu lưu thứ hai…' });
    try {
      let acknowledged = pending;
      if (!pending.acknowledgedId) {
        const receipt = await auth.withSession((token, signal) => client.mutate(pending, token, signal), controller.signal);
        if (epoch !== generation || mutationId !== mutationGeneration || capturedOwner !== owner || !permitted()) return;
        acknowledged = Object.freeze({ ...pending, acknowledgedId: receipt.id, receiptVersion: receipt.version });
        publish({ pending: acknowledged, mutation: 'refreshing', message: 'Máy chủ đã nhận lưu. Đang đọc lại vì kết quả retry có thể là phiên bản cũ.' });
      }
      const latest = await auth.withSession((token, signal) => client.detail(acknowledged.acknowledgedId!, token, signal), controller.signal);
      if (epoch !== generation || mutationId !== mutationGeneration || capturedOwner !== owner || !permitted()) return;
      if (latest.version < acknowledged.receiptVersion!) throw new TripFailure('contract');
      publish({ saved: latest, draft: formFromTrip(latest), screen: 'detail', detailId: latest.id, detailStatus: 'ready', selectedDay: Math.min(state.selectedDay, latest.durationDays),
        pending: null, mutation: 'idle', dirty: false, revision: state.revision + 1,
        message: latest.version > acknowledged.receiptVersion! ? `Đã đọc phiên bản hiện tại ${latest.version}; máy chủ có thay đổi sau bản gửi này.` : `Đã đọc lại phiên bản ${latest.version}. Bản đang xem đã đồng bộ.` });
      void list();
    } catch (error) {
      if (epoch !== generation || mutationId !== mutationGeneration || capturedOwner !== owner || !permitted()) return;
      const failure = safe(error);
      // A replay snapshot acknowledged a commit; later GET refusal must never discard its pending reconciliation.
      const acknowledged = state.pending?.acknowledgedId !== null;
      if (failure.code === 'conflict' && !acknowledged) publish({ pending: null, mutation: 'conflict', message: `${failure.message} Có thể tiếp tục giữ bản nháp hoặc chọn mở bản máy chủ; không tự gộp/ghi đè.` });
      else publish({ mutation: 'uncertain', message: `${failure.message} ${acknowledged ? 'Thử đọc lại để xác nhận bản hiện tại.' : 'Bản gửi đang khóa; thử lại dùng đúng key, nội dung và version cũ.'}` });
      sessionError(error);
    }
  }
  async function submit(operation: 'create' | 'update') {
    if (!editable() || operation === 'update' && !detailEditable()) return;
    try {
      const body = JSON.stringify(operation === 'create' ? createBody(state.create) : state.draft && state.saved ? updateBody(state.draft, state.saved.version) : (() => { throw new TripFormFailure('Chưa có chuyến để lưu.'); })());
      const key = newKey(); if (!isTripUuid(key)) throw new TripFailure('configuration');
      invalidateRead();
      const pending = Object.freeze({ operation, tripId: operation === 'create' ? null : state.saved!.id, key, body,
        ownerId: owner!, submittedRevision: state.revision, acknowledgedId: null, receiptVersion: null });
      // Capture immutable body/key BEFORE the first asynchronous request. Double taps see the lock immediately.
      publish({ pending }); await sendPending();
    } catch (error) { publish({ message: error instanceof TripFormFailure ? error.message : safe(error).message }); }
  }
  function synchronize() {
    const next = verifiedOwner(), session = auth.snapshot();
    if (next && state.available && owner === next) return;
    invalidate();
    if (!next) {
      if (session.kind === 'signedOut' || session.kind === 'blocked') { owner = null; rejectedOwner = null; state = initial(); publish({}); }
      else publish({ available: false, listStatus: 'idle', detailStatus: state.saved && state.detailId === state.saved.id ? 'ready' : state.detailId ? 'error' : 'idle', mutation: state.pending ? 'uncertain' : state.mutation });
      return;
    }
    if (owner !== next) { owner = next; rejectedOwner = null; state = initial(); }
    publish({ available: true, ownerId: next });
    if (rejectedOwner === next) publish({ listStatus: 'error', listMessage: 'Phiên đã được kiểm tra lại. Bấm đọc chuyến lại để thử quyền trên máy chủ.' });
    else void list();
  }
  return {
    snapshot: () => state, subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    connect() { const unsubscribe = auth.subscribe(synchronize); synchronize(); return () => { unsubscribe(); invalidate(); }; },
    list, open, retry: sendPending,
    create() { if (editable()) { invalidateRead(); publish({ screen: 'create', message: '' }); } },
    setCreate(form: CreateForm, expectedOwner = owner) { if (editable() && expectedOwner === owner) publish({ create: copyForm(form), revision: state.revision + 1, message: '' }); },
    edit(form: TripForm, expectedOwner = owner, expectedTrip = state.saved?.id) { if (detailEditable() && expectedOwner === owner && expectedTrip === state.saved?.id) { invalidateRead(); publish({ draft: copyForm(form), dirty: true, revision: state.revision + 1, message: '', mutation: 'idle' }); } },
    submitCreate: () => submit('create'), save: () => state.dirty ? submit('update') : Promise.resolve(),
    show(screen: 'list' | 'detail' | 'map') {
      if (!permitted()) return;
      if (screen === 'detail' && state.pending?.operation === 'create') { publish({ screen: 'create' }); return; }
      if (screen === 'list' || state.saved) publish({ screen });
    },
    selectDay(day: number) { if (permitted() && state.saved && Number.isInteger(day) && day >= 1 && day <= state.saved.durationDays) publish({ selectedDay: day }); },
    cancelRequest() { if (state.pending) { mutationGeneration++; mutationController?.abort(); publish({ mutation: 'uncertain', message: 'Đã dừng chờ. Bản gửi vẫn khóa vì chưa biết máy chủ đã lưu hay chưa.' }); } },
    dispose() { invalidate(); },
  };
}

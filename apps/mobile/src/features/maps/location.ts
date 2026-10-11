import { isMapCoordinate, type MapCoordinate } from '@goease/contracts';
import { mapAbortable } from './client.ts';

export interface LocationPermission { granted: boolean; canAskAgain: boolean }
export interface LocationFix { coords: MapCoordinate & { accuracy: number | null }; timestamp: number }
export interface LocationAdapter {
  permission(): Promise<LocationPermission>; request(): Promise<LocationPermission>; services(): Promise<boolean>;
  watch(success: (fix: LocationFix) => void, failure: () => void): Promise<{ remove(): void }>;
}
export interface LocationState { kind: 'idle' | 'locating' | 'ready' | 'denied' | 'unavailable' | 'error'; message: string; fix?: LocationFix }
/** One foreground fix only; no last-known fallback, background task or settings popup. */
export function createLocationStore(adapter: LocationAdapter, timeoutMs = 20_000) {
  let state: LocationState = { kind: 'idle', message: 'Vị trí chỉ lấy khi bạn yêu cầu.' }, generation = 0;
  let active: AbortController | undefined, subscription: { remove(): void } | undefined, timer: ReturnType<typeof setTimeout> | undefined;
  let foreground = true, permissionPhase: 'none' | 'prompt' | 'resume' = 'none', resume: (() => void) | undefined;
  const listeners = new Set<() => void>();
  const publish = (next: LocationState) => { state = next; listeners.forEach(listener => listener()); };
  function stop() { generation++; active?.abort(); clearTimeout(timer); subscription?.remove(); subscription = undefined; resume = undefined; permissionPhase = 'none'; }
  async function locate() {
    if (!foreground) return;
    stop(); const id = generation, controller = active = new AbortController();
    publish({ kind: 'locating', message: 'Đang xin một vị trí foreground…' });
    const finish = (next: LocationState) => { if (id === generation) { stop(); publish(next); } };
    timer = setTimeout(() => finish({ kind: 'unavailable', message: 'Chưa nhận được GPS trong thời gian cho phép. Có thể thử lại.' }), timeoutMs);
    try {
      let permission = await mapAbortable(adapter.permission(), controller.signal);
      if (!permission.granted && permission.canAskAgain) {
        // iOS permission sheets temporarily emit inactive. Keep only this bounded
        // permission operation alive; no GPS watcher may start until active again.
        permissionPhase = 'prompt';
        permission = await mapAbortable(adapter.request(), controller.signal);
        if (id !== generation) return;
        permissionPhase = 'resume';
        if (!foreground) await mapAbortable(new Promise<void>(resolve => { resume = resolve; }), controller.signal);
        permissionPhase = 'none'; resume = undefined;
      }
      if (!permission.granted) { finish({ kind: 'denied', message: 'Bạn chưa cho phép vị trí. Danh mục và bản đồ mẫu vẫn dùng được.' }); return; }
      if (!await mapAbortable(adapter.services(), controller.signal)) { finish({ kind: 'unavailable', message: 'Dịch vụ vị trí đang tắt. Danh mục mẫu vẫn dùng được.' }); return; }
      const registration = adapter.watch(fix => {
        if (id !== generation) return;
        if (!fix || !fix.coords || !isMapCoordinate({ latitude: fix.coords.latitude, longitude: fix.coords.longitude }) || !Number.isFinite(fix.timestamp)
          || Date.now() - fix.timestamp > 60_000 || fix.timestamp - Date.now() > 60_000 || fix.coords.accuracy !== null && (!Number.isFinite(fix.coords.accuracy) || fix.coords.accuracy < 0)) {
          finish({ kind: 'error', message: 'Vị trí trả về chưa hợp lệ hoặc đã cũ. Hãy thử lại.' }); return;
        }
        finish({ kind: 'ready', message: 'Một vị trí vừa nhận; không theo dõi liên tục.', fix: { coords: { latitude: fix.coords.latitude, longitude: fix.coords.longitude, accuracy: fix.coords.accuracy }, timestamp: fix.timestamp } });
      }, () => finish({ kind: 'error', message: 'Chưa nhận được vị trí. Hãy thử lại.' }));
      // A fix/cancel may precede registration resolution: always remove that late watcher.
      void registration.then(value => { if (id !== generation || controller.signal.aborted) value.remove(); else subscription = value; }, () => {});
      await mapAbortable(registration, controller.signal);
    } catch { if (id === generation) finish({ kind: 'error', message: 'Chưa truy cập được vị trí. Hãy thử lại.' }); }
  }
  return {
    snapshot: () => state, subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; }, locate,
    setAppState(next: 'active' | 'inactive' | 'background' | 'unknown' | 'extension') {
      foreground = next === 'active';
      if (foreground) { resume?.(); return; }
      if (next === 'inactive' && (permissionPhase === 'prompt' || permissionPhase === 'resume')) return;
      stop(); publish({ kind: 'idle', message: 'Đã dừng lấy vị trí; không theo dõi nền.' });
    },
    async recheck() {
      if (!foreground || state.kind === 'locating') return;
      const id = generation, controller = new AbortController(), deadline = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const permission = await mapAbortable(adapter.permission(), controller.signal), enabled = permission.granted && await mapAbortable(adapter.services(), controller.signal);
        if (id !== generation) return;
        if (!permission.granted) { stop(); publish({ kind: 'denied', message: 'Quyền vị trí đã bị thu hồi. Danh mục mẫu vẫn dùng được.' }); }
        else if (!enabled) { stop(); publish({ kind: 'unavailable', message: 'Dịch vụ vị trí đang tắt. Danh mục mẫu vẫn dùng được.' }); }
      } catch { if (id === generation) { stop(); publish({ kind: 'error', message: 'Chưa kiểm tra được quyền vị trí.' }); } }
      finally { clearTimeout(deadline); }
    },
    cancel() { stop(); publish({ kind: 'idle', message: 'Đã dừng lấy vị trí; không theo dõi nền.' }); },
    dispose: stop,
  };
}

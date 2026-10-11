import type { AdminPlacesResponse } from '@goease/contracts';
import type { WebAuthStore } from './auth-context';
import { AdminFailure, type createAdminClient } from './admin-client';

export type AdminCatalogState = { kind: 'locked' | 'loading' | 'ready' | 'error'; message: string; catalog?: AdminPlacesResponse };
export function createAdminCatalogStore(client: ReturnType<typeof createAdminClient>, auth: WebAuthStore) {
  let state: AdminCatalogState = { kind: 'locked', message: 'Cần phiên quản trị được máy chủ xác minh.' };
  let identity: string | null = null, rejectedIdentity: string | null = null, active: AbortController | undefined, generation = 0;
  const listeners = new Set<() => void>();
  const publish = (value: AdminCatalogState) => { state = value; listeners.forEach(listener => listener()); };
  const verifiedIdentity = () => { const session = auth.snapshot(); return session.kind === 'signedIn' && session.user?.role === 'ADMIN' ? session.user.id : null; };
  function invalidate() { active?.abort(); active = undefined; generation++; }
  async function load() {
    const user = verifiedIdentity();
    if (!user || user !== identity) return;
    invalidate(); const id = generation, controller = active = new AbortController();
    publish({ kind: 'loading', message: 'Đang đọc danh mục từ máy chủ…' });
    try {
      const catalog = await client.catalog(controller.signal);
      if (id === generation && user === verifiedIdentity() && !controller.signal.aborted) {
        rejectedIdentity = null; publish({ kind: 'ready', message: 'Danh mục mẫu đã đọc từ cơ sở dữ liệu.', catalog });
      }
    } catch (error) {
      if (id !== generation || controller.signal.aborted || user !== verifiedIdentity()) return;
      const failure = error instanceof AdminFailure ? error : new AdminFailure('network');
      publish({ kind: 'error', message: failure.message });
      if (failure.code === 'expired' || failure.code === 'forbidden') {
        rejectedIdentity = user;
        // No retry loop: after checking the session, this identity needs an explicit catalog retry.
        void auth.restore();
      }
    }
  }
  function synchronize() {
    const next = verifiedIdentity();
    if (next === identity) return;
    identity = next; invalidate();
    if (!next) publish({ kind: 'locked', message: 'Cần phiên quản trị được máy chủ xác minh.' });
    else if (rejectedIdentity === next) publish({ kind: 'error', message: 'Phiên đã được kiểm tra lại. Bấm đọc lại để máy chủ kiểm tra quyền danh mục.' });
    else { rejectedIdentity = null; void load(); }
  }
  return {
    snapshot: () => state, subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; }, load,
    connect() {
      const unsubscribe = auth.subscribe(synchronize); synchronize();
      return () => { unsubscribe(); invalidate(); identity = null; publish({ kind: 'locked', message: 'Đã đóng danh mục.' }); };
    },
  };
}

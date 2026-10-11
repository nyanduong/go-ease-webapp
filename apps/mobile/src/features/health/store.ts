import type { HealthResponse } from '@goease/contracts';
import { HealthFailure } from '../../lib/health.ts';

export type HealthState = { kind: 'loading' } | { kind: 'success'; health: HealthResponse } | { kind: 'error'; message: string };
export function createHealthStore(load: (signal: AbortSignal) => Promise<HealthResponse>) {
  let state: HealthState = { kind: 'loading' };
  let active: AbortController | undefined;
  const listeners = new Set<() => void>();
  const publish = (next: HealthState) => { state = next; for (const listener of listeners) listener(); };
  return {
    snapshot: () => state,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    cancel: () => { active?.abort(); },
    retry: async () => {
      active?.abort();
      const request = new AbortController();
      active = request;
      publish({ kind: 'loading' });
      try {
        const health = await load(request.signal);
        if (!request.signal.aborted && active === request) publish({ kind: 'success', health });
      } catch (error) {
        if (!request.signal.aborted && active === request) publish({ kind: 'error', message: error instanceof HealthFailure
          ? error.message : 'Chưa thể kiểm tra API. Xác minh cấu hình và kết nối, rồi thử lại.' });
      }
    },
  };
}

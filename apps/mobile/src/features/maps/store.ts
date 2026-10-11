import type { SampleMapCatalog, SampleRouteRequest, SampleRouteResult } from '@goease/contracts';
import { MapFailure, safeMapFailure, type createMapsClient } from './client.ts';

interface MapsState {
  catalog?: SampleMapCatalog; catalogStatus: 'idle' | 'loading' | 'ready' | 'error'; catalogMessage: string;
  map: 'blocked' | 'loading' | 'loaded' | 'error'; sdkReady: boolean; revision: number;
  route: 'idle' | 'loading' | 'ready' | 'error'; routeMessage: string; result?: SampleRouteResult;
}
export function createMapsStore(client: ReturnType<typeof createMapsClient>, configured: boolean,
  authorizedRoute: (request: SampleRouteRequest, signal: AbortSignal) => Promise<SampleRouteResult>, mapTimeoutMs = 15_000) {
  let state: MapsState = { catalogStatus: 'idle', catalogMessage: '', map: configured ? 'loading' : 'blocked', sdkReady: false,
    revision: 0, route: 'idle', routeMessage: '' };
  let identity: string | null = null, active = true, catalogGeneration = 0, routeGeneration = 0;
  let catalogRequest: AbortController | undefined, routeRequest: AbortController | undefined, mapTimer: ReturnType<typeof setTimeout> | undefined;
  const listeners = new Set<() => void>();
  const publish = (patch: Partial<MapsState>) => { state = { ...state, ...patch }; listeners.forEach(listener => listener()); };
  function clearRoute() { routeRequest?.abort(); routeGeneration++; state = { ...state }; delete state.result; publish({ route: 'idle', routeMessage: '' }); }
  function retryMap() {
    clearTimeout(mapTimer); clearRoute();
    if (!configured || !active) { publish({ map: 'blocked', sdkReady: false }); return; }
    const revision = state.revision + 1; publish({ map: 'loading', sdkReady: false, revision });
    mapTimer = setTimeout(() => { if (state.revision === revision && state.map === 'loading') publish({ map: 'error' }); }, mapTimeoutMs);
  }
  return {
    snapshot: () => state, subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    setIdentity(next: string | null) { if (next !== identity) { identity = next; clearRoute(); } },
    setActive(next: boolean) { active = next; if (!next) { catalogRequest?.abort(); catalogGeneration++; clearTimeout(mapTimer); clearRoute(); publish({ map: 'blocked' }); } else retryMap(); },
    retryMap,
    sdkReady(revision: number) { if (active && state.revision === revision && state.map === 'loading') publish({ sdkReady: true }); },
    mapLoaded(revision: number) { if (active && state.revision === revision && state.map === 'loading') { clearTimeout(mapTimer); publish({ map: 'loaded' }); } },
    async loadCatalog() {
      if (!active) return;
      clearRoute();
      catalogRequest?.abort(); const controller = catalogRequest = new AbortController(), id = ++catalogGeneration;
      publish({ catalogStatus: 'loading', catalogMessage: 'Đang đọc danh mục mẫu…' });
      try { const catalog = await client.catalog(controller.signal); if (active && id === catalogGeneration) publish({ catalog, catalogStatus: 'ready', catalogMessage: 'Ba địa điểm CC0 mẫu; chưa phải điểm đến launch.' }); }
      catch (error) { if (active && id === catalogGeneration) publish({ catalogStatus: 'error', catalogMessage: safeMapFailure(error).message }); }
    },
    async route(request: SampleRouteRequest) {
      clearRoute();
      if (!identity || !active || state.map !== 'loaded' || state.catalogStatus !== 'ready' || !state.catalog) { publish({ route: 'error', routeMessage: new MapFailure('session').message }); return; }
      const known = new Set(state.catalog.places.map(place => place.id.toLowerCase()));
      if (!known.has(request.originPlaceId.toLowerCase()) || !known.has(request.destinationPlaceId.toLowerCase()) || request.originPlaceId.toLowerCase() === request.destinationPlaceId.toLowerCase()) {
        publish({ route: 'error', routeMessage: new MapFailure('contract').message }); return;
      }
      const capturedIdentity = identity, id = ++routeGeneration, controller = routeRequest = new AbortController();
      publish({ route: 'loading', routeMessage: 'Đang hỏi Routes cho hai địa điểm mẫu…' });
      try {
        const result = await authorizedRoute(request, controller.signal);
        if (!controller.signal.aborted && active && id === routeGeneration && identity === capturedIdentity && state.map === 'loaded') {
          publish({ route: 'ready', result, routeMessage: result.kind === 'no-route' ? 'Google chưa tìm được tuyến cho cặp mẫu này.' : 'Tuyến từ Google Maps; không phải chỉ dẫn từng chặng.' });
        }
      } catch (error) { if (!controller.signal.aborted && active && id === routeGeneration && identity === capturedIdentity) publish({ route: 'error', routeMessage: safeMapFailure(error).message }); }
    },
    cancelRoute: clearRoute,
    dispose() { active = false; catalogRequest?.abort(); catalogGeneration++; clearTimeout(mapTimer); clearRoute(); },
  };
}

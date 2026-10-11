import { decodeRoutePolyline, isSampleRouteResult, type SampleRouteResult } from '@goease/contracts';
import { prepareSampleRoute } from './catalog.js';
import { MapsError } from './errors.js';

export const ROUTES_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes';
export const ROUTES_FIELD_MASK = 'routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline,routes.warnings';
export const MAX_ROUTES_BODY_BYTES = 65_536;
export interface RoutesConfig { apiKey: string }
export interface RoutesOptions { fetch?: typeof globalThis.fetch; signal?: AbortSignal; timeoutMs?: number }
export interface RoutesEvidence { attempts: 1; elapsedMs: number; chargedCostUsd: null; costStatus: 'unavailable' }

export function readRoutesConfig(environment: Record<string, string | undefined>): RoutesConfig {
  const apiKey = environment['GOOGLE_MAPS_SERVER_API_KEY'];
  if (!apiKey || apiKey.length > 512 || /[^A-Za-z0-9_-]/.test(apiKey)) throw new MapsError('MAPS_NOT_CONFIGURED');
  return { apiKey };
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function keys(value: Record<string, unknown>, allowed: string[]) {
  return Object.keys(value).every(key => allowed.includes(key));
}

/** Nonnegative ProtoJSON Duration, nanosecond precision, rounded UP to milliseconds. */
export function durationMilliseconds(value: unknown): number {
  if (typeof value !== 'string') throw new MapsError('MAPS_INVALID_OUTPUT');
  const match = /^(0|[1-9][0-9]{0,11})(?:\.([0-9]{1,9}))?s$/.exec(value);
  if (!match || match[0] !== value) throw new MapsError('MAPS_INVALID_OUTPUT');
  const nanos = BigInt(match[1]!) * 1_000_000_000n + BigInt((match[2] ?? '').padEnd(9, '0'));
  if (nanos > 86_400_000_000_000n) throw new MapsError('MAPS_INVALID_OUTPUT');
  return Number((nanos + 999_999n) / 1_000_000n);
}

/** Empty repeated routes may be omitted by ProtoJSON. Malformed/error envelopes are not no-route. */
export function parseRoutesResponse(value: unknown): SampleRouteResult {
  if (!record(value) || !keys(value, ['routes'])) throw new MapsError('MAPS_INVALID_OUTPUT');
  if (!Object.hasOwn(value, 'routes')) return { kind: 'no-route', source: 'google-routes' };
  if (!Array.isArray(value.routes)) throw new MapsError('MAPS_INVALID_OUTPUT');
  if (value.routes.length === 0) return { kind: 'no-route', source: 'google-routes' };
  if (value.routes.length !== 1 || !record(value.routes[0])) throw new MapsError('MAPS_INVALID_OUTPUT');
  const route = value.routes[0];
  if (!keys(route, ['distanceMeters', 'duration', 'polyline', 'warnings']) || !record(route.polyline)
    || !keys(route.polyline, ['encodedPolyline']) || typeof route.polyline.encodedPolyline !== 'string') {
    throw new MapsError('MAPS_INVALID_OUTPUT');
  }
  let coordinates;
  try { coordinates = decodeRoutePolyline(route.polyline.encodedPolyline); }
  catch { throw new MapsError('MAPS_INVALID_OUTPUT'); }
  // ProtoJSON can omit a default scalar zero. Message duration/polyline must still exist.
  const result = { kind: 'route', source: 'google-routes', attribution: 'Google Maps',
    distanceMeters: Object.hasOwn(route, 'distanceMeters') ? route.distanceMeters : 0,
    durationMilliseconds: durationMilliseconds(route.duration), coordinates,
    warnings: Object.hasOwn(route, 'warnings') ? route.warnings : [] };
  if (!isSampleRouteResult(result)) throw new MapsError('MAPS_INVALID_OUTPUT');
  return result;
}

export function sampleRoutesBody(request: unknown, catalog: unknown) {
  const { origin, destination } = prepareSampleRoute(request, catalog);
  const waypoint = (place: typeof origin) => ({ location: { latLng: { latitude: place.latitude, longitude: place.longitude } } });
  return { origin: waypoint(origin), destination: waypoint(destination), travelMode: 'DRIVE',
    routingPreference: 'TRAFFIC_UNAWARE', computeAlternativeRoutes: false,
    polylineQuality: 'OVERVIEW', polylineEncoding: 'ENCODED_POLYLINE', languageCode: 'vi', units: 'METRIC' };
}

function discard(response: Response) { void response.body?.cancel().catch(() => {}); }
/** Detach immediately on abort; a noncooperative fetch's late response is discarded too. */
function abortable<T>(operation: Promise<T>, signal: AbortSignal, late?: (value: T) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    let finished = false;
    const aborted = () => { if (!finished) { finished = true; signal.removeEventListener('abort', aborted); reject(new MapsError('MAPS_CANCELLED')); } };
    signal.addEventListener('abort', aborted, { once: true });
    operation.then(value => {
      if (finished) { late?.(value); return; }
      finished = true; signal.removeEventListener('abort', aborted); resolve(value);
    }, error => {
      if (finished) return;
      finished = true; signal.removeEventListener('abort', aborted); reject(error);
    });
    if (signal.aborted) aborted();
  });
}
async function boundedJson(response: Response, signal: AbortSignal): Promise<unknown> {
  const length = response.headers.get('content-length');
  if (length && /^\d+$/.test(length) && Number(length) > MAX_ROUTES_BODY_BYTES) {
    discard(response); throw new MapsError('MAPS_INVALID_OUTPUT');
  }
  if (!response.body) throw new MapsError('MAPS_INVALID_OUTPUT');
  const reader = response.body.getReader(), decoder = new TextDecoder('utf-8', { fatal: true });
  let bytes = 0, text = '';
  try {
    for (;;) {
      const chunk = await abortable(reader.read(), signal);
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > MAX_ROUTES_BODY_BYTES) throw new MapsError('MAPS_INVALID_OUTPUT');
      try { text += decoder.decode(chunk.value, { stream: true }); }
      catch { throw new MapsError('MAPS_INVALID_OUTPUT'); }
    }
    try { return JSON.parse(text + decoder.decode()) as unknown; }
    catch { throw new MapsError('MAPS_INVALID_OUTPUT'); }
  } finally {
    void reader.cancel().catch(() => {});
    try { reader.releaseLock(); } catch { /* Cancellation may still be settling a stalled read. */ }
  }
}

/** Backend-only, fixed endpoint and approved seeds. Exactly one attempt, no automatic retry/public controller. */
export async function computeSampleRoute(config: RoutesConfig, request: unknown, catalog: unknown, options: RoutesOptions = {})
  : Promise<{ result: SampleRouteResult; evidence: RoutesEvidence }> {
  const checked = readRoutesConfig({ GOOGLE_MAPS_SERVER_API_KEY: config.apiKey });
  const body = JSON.stringify(sampleRoutesBody(request, catalog)), timeoutMs = options.timeoutMs ?? 15_000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 10 || timeoutMs > 15_000) throw new MapsError('MAPS_INVALID_INPUT');
  if (options.signal?.aborted) throw new MapsError('MAPS_CANCELLED');
  const controller = new AbortController(), started = performance.now();
  let timedOut = false, attempts = 0;
  const cancel = () => controller.abort();
  options.signal?.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  try {
    attempts = 1;
    const response = await abortable((options.fetch ?? globalThis.fetch)(ROUTES_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': checked.apiKey, 'X-Goog-FieldMask': ROUTES_FIELD_MASK },
      body, redirect: 'error', signal: controller.signal,
    }), controller.signal, discard);
    if (!response.ok) { discard(response); throw new MapsError('MAPS_PROVIDER_FAILURE'); }
    const result = parseRoutesResponse(await boundedJson(response, controller.signal));
    // A synchronous/late test transport must not outrun a timer callback and return success past deadline.
    if (controller.signal.aborted || performance.now() - started >= timeoutMs) {
      if (!controller.signal.aborted) timedOut = true;
      throw new MapsError('MAPS_TIMEOUT');
    }
    return { result, evidence: { attempts: 1, elapsedMs: Math.round(performance.now() - started), chargedCostUsd: null, costStatus: 'unavailable' } };
  } catch (error) {
    const code = controller.signal.aborted ? (timedOut ? 'MAPS_TIMEOUT' : 'MAPS_CANCELLED')
      : error instanceof MapsError ? error.code : 'MAPS_PROVIDER_FAILURE';
    throw new MapsError(code, attempts, Math.round(performance.now() - started));
  } finally { clearTimeout(timer); options.signal?.removeEventListener('abort', cancel); }
}

import { pathToFileURL } from 'node:url';
import type { SampleMapCatalog } from '@goease/contracts';
import { loadMapCatalog, prepareSampleRoute, validateMapCatalog } from './catalog.js';
import { MapsError } from './errors.js';
import { computeSampleRoute, readRoutesConfig, ROUTES_FIELD_MASK, ROUTES_URL, sampleRoutesBody } from './routes.js';

interface ProbeDependencies { loadCatalog?: (databaseUrl: string) => Promise<SampleMapCatalog>; fetch?: typeof globalThis.fetch; signal?: AbortSignal }
function parseArguments(args: string[]): 'dry-run' | 'live' {
  const values = new Map<string, string>();
  const switches = new Set(['--dry-run', '--live', '--authorize-live-spend']);
  const references = new Set(['--project-reference', '--quota-reference', '--budget-reference']);
  for (const arg of args) {
    const separator = arg.indexOf('='), name = separator < 0 ? arg : arg.slice(0, separator), value = separator < 0 ? '' : arg.slice(separator + 1);
    if (values.has(name) || (!switches.has(name) && !references.has(name)) || (switches.has(name) && separator >= 0)
      || (references.has(name) && (!/^[a-z0-9]/.test(value) || value.length > 64 || /[^a-z0-9_.:-]/.test(value)))) throw new MapsError('MAPS_LIVE_NOT_AUTHORIZED');
    values.set(name, value);
  }
  if (values.has('--dry-run') === values.has('--live')) throw new MapsError('MAPS_LIVE_NOT_AUTHORIZED');
  if (values.has('--dry-run')) {
    if (values.has('--authorize-live-spend') || [...references].some(key => values.has(key))) throw new MapsError('MAPS_LIVE_NOT_AUTHORIZED');
    return 'dry-run';
  }
  if (!values.has('--authorize-live-spend') || [...references].some(key => !values.has(key))) throw new MapsError('MAPS_LIVE_NOT_AUTHORIZED');
  return 'live';
}

/** Attestation flags do not enable/verify billing or prove permission. References/credentials are never echoed. */
export async function runMapsProbe(args: string[], environment: Record<string, string | undefined>, dependencies: ProbeDependencies = {}) {
  let mode: 'dry-run' | 'live' | undefined;
  try {
    mode = parseArguments(args);
    const config = mode === 'live' ? readRoutesConfig(environment) : undefined;
    const databaseUrl = environment['DATABASE_URL'];
    if (!databaseUrl) throw new MapsError('MAPS_NOT_CONFIGURED');
    if (dependencies.signal?.aborted) throw new MapsError('MAPS_CANCELLED');
    const catalog = validateMapCatalog(await (dependencies.loadCatalog ?? loadMapCatalog)(databaseUrl));
    if (dependencies.signal?.aborted) throw new MapsError('MAPS_CANCELLED');
    // Exactly one deterministic pair of actual approved DB IDs; no user coordinates or ID discovery.
    const request = { originPlaceId: catalog.places[0]!.id, destinationPlaceId: catalog.places[1]!.id };
    prepareSampleRoute(request, catalog);
    if (mode === 'dry-run') return { exitCode: 0, receipt: { mode, status: 'validated-input', outboundCalls: 0,
      endpoint: ROUTES_URL, fieldMask: ROUTES_FIELD_MASK, request, body: sampleRoutesBody(request, catalog),
      note: 'Không gọi Google; đây không phải tuyến đường hoặc bằng chứng Maps live.' } };
    const { result, evidence } = await computeSampleRoute(config!, request, catalog, {
      ...(dependencies.fetch ? { fetch: dependencies.fetch } : {}), ...(dependencies.signal ? { signal: dependencies.signal } : {}),
    });
    // Ephemeral route geometry is deliberately excluded from the diagnostic receipt.
    return { exitCode: 0, receipt: { mode, status: 'completed', timestamp: new Date().toISOString(), ...evidence,
      routeKind: result.kind, ...(result.kind === 'route' ? { distanceMeters: result.distanceMeters,
        durationMilliseconds: result.durationMilliseconds, pointCount: result.coordinates.length, warningCount: result.warnings.length } : {}),
      note: 'Một lần gọi; chi phí chưa có hóa đơn. Không lưu geometry/Google payload.' } };
  } catch (error) {
    const safe = error instanceof MapsError ? error : new MapsError('MAPS_INVALID_INPUT');
    return { exitCode: 1, receipt: { mode: mode ?? 'refused', status: 'failed', code: safe.code, message: safe.message,
      attempts: safe.attempts, elapsedMs: safe.elapsedMs, chargedCostUsd: null, costStatus: 'unavailable' } };
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const controller = new AbortController(), cancel = () => controller.abort();
  process.once('SIGINT', cancel); process.once('SIGTERM', cancel);
  try {
    const result = await runMapsProbe(process.argv.slice(2), process.env, { signal: controller.signal });
    console.info(JSON.stringify(result.receipt)); process.exitCode = result.exitCode;
  } finally { process.removeListener('SIGINT', cancel); process.removeListener('SIGTERM', cancel); }
}

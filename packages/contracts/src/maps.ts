/** M0 controlled sample only. UUIDs and Wikidata entities are not Google Place IDs. */
export interface MapCoordinate { latitude: number; longitude: number }
export interface SampleMapPlace extends MapCoordinate {
  id: string;
  name: string;
  sourceUrl: string;
  attribution: string;
}
export interface SampleMapCatalog {
  destinationCode: 'VN-HANOI-SAMPLE';
  isSample: true;
  places: SampleMapPlace[];
}
export interface SampleRouteRequest { originPlaceId: string; destinationPlaceId: string }
/** Ephemeral Google Routes content: never persist in a Trip, local storage or DB. */
export type SampleRouteResult = { kind: 'no-route'; source: 'google-routes' } | {
  kind: 'route';
  source: 'google-routes';
  attribution: 'Google Maps';
  distanceMeters: number;
  durationMilliseconds: number;
  coordinates: MapCoordinate[];
  warnings: string[];
};

function fields(value: unknown, keys: string[]): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}
function uuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
function text(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= max
    && !/[\u0000-\u001f\u007f]/.test(value) && value.isWellFormed();
}
export function isMapCoordinate(value: unknown): value is MapCoordinate {
  return fields(value, ['latitude', 'longitude']) && typeof value.latitude === 'number'
    && Number.isFinite(value.latitude) && Math.abs(value.latitude) <= 90
    && typeof value.longitude === 'number' && Number.isFinite(value.longitude) && Math.abs(value.longitude) <= 180;
}
export function isSampleRouteRequest(value: unknown): value is SampleRouteRequest {
  return fields(value, ['originPlaceId', 'destinationPlaceId']) && uuid(value.originPlaceId)
    && uuid(value.destinationPlaceId) && value.originPlaceId.toLowerCase() !== value.destinationPlaceId.toLowerCase();
}
export function isSampleMapCatalog(value: unknown): value is SampleMapCatalog {
  if (!fields(value, ['destinationCode', 'isSample', 'places']) || value.destinationCode !== 'VN-HANOI-SAMPLE'
    || value.isSample !== true || !Array.isArray(value.places) || value.places.length !== 3) return false;
  const ids = new Set<string>();
  return Array.from(value.places).every(place => {
    if (!fields(place, ['id', 'name', 'latitude', 'longitude', 'sourceUrl', 'attribution'])
      || !uuid(place.id) || ids.has(place.id.toLowerCase()) || !text(place.name, 320)
      || !text(place.attribution, 2000) || typeof place.sourceUrl !== 'string'
      || !/^https:\/\/www\.wikidata\.org\/w\/index\.php\?title=Q[1-9][0-9]*&oldid=[1-9][0-9]*$/.test(place.sourceUrl)
      || !isMapCoordinate({ latitude: place.latitude, longitude: place.longitude })) return false;
    ids.add(place.id.toLowerCase()); return true;
  });
}
export function isSampleRouteResult(value: unknown): value is SampleRouteResult {
  if (fields(value, ['kind', 'source']) && value.kind === 'no-route' && value.source === 'google-routes') return true;
  return fields(value, ['kind', 'source', 'attribution', 'distanceMeters', 'durationMilliseconds', 'coordinates', 'warnings'])
    && value.kind === 'route' && value.source === 'google-routes' && value.attribution === 'Google Maps'
    && typeof value.distanceMeters === 'number' && Number.isSafeInteger(value.distanceMeters)
    && value.distanceMeters >= 0 && value.distanceMeters <= 1_000_000
    && typeof value.durationMilliseconds === 'number' && Number.isSafeInteger(value.durationMilliseconds)
    && value.durationMilliseconds >= 0 && value.durationMilliseconds <= 86_400_000
    && Array.isArray(value.coordinates) && value.coordinates.length >= 2 && value.coordinates.length <= 5000
    && Array.from(value.coordinates).every(isMapCoordinate) && Array.isArray(value.warnings)
    && value.warnings.length <= 20 && Array.from(value.warnings).every(warning => text(warning, 1000));
}

/** Strict bounded E5 decoding; malformed output must never become a fallback line. */
export function decodeRoutePolyline(encoded: string): MapCoordinate[] {
  const invalid = () => new Error('Invalid bounded route polyline.');
  if (typeof encoded !== 'string' || encoded.length === 0 || encoded.length > 16_384) throw invalid();
  let position = 0, latitude = 0, longitude = 0;
  const coordinates: MapCoordinate[] = [];
  function scalar() {
    let result = 0;
    for (let chunk = 0; chunk < 6; chunk++) {
      if (position >= encoded.length) throw invalid();
      const digit = encoded.charCodeAt(position++) - 63;
      if (digit < 0 || digit > 63) throw invalid();
      result += (digit & 31) * 2 ** (chunk * 5);
      if (digit < 32) return result % 2 ? -Math.floor(result / 2) - 1 : result / 2;
    }
    throw invalid();
  }
  while (position < encoded.length) {
    if (coordinates.length >= 5000) throw invalid();
    latitude += scalar(); longitude += scalar();
    const point = { latitude: latitude / 100_000, longitude: longitude / 100_000 };
    if (!isMapCoordinate(point)) throw invalid();
    coordinates.push(point);
  }
  if (coordinates.length < 2) throw invalid();
  return coordinates;
}

/** Read-only sample catalog. No private user/trip/session fields cross this boundary. */
export interface AdminPlace {
  id: string;
  code: string;
  name: string;
  latitude: number;
  longitude: number;
  sourceUrl: string;
  attribution: string;
  isActive: boolean;
  isSample: true;
}
export interface AdminPlacesResponse {
  destinationCode: 'VN-HANOI-SAMPLE';
  isSample: true;
  places: AdminPlace[];
}

function fields(value: unknown, keys: string[]): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every(key => Object.prototype.hasOwnProperty.call(value, key));
}
function text(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= max && !/[\p{Cc}\p{Cs}]/u.test(value);
}
export function isAdminPlacesResponse(value: unknown): value is AdminPlacesResponse {
  if (!fields(value, ['destinationCode', 'isSample', 'places']) || value.destinationCode !== 'VN-HANOI-SAMPLE'
    || value.isSample !== true || !Array.isArray(value.places) || value.places.length > 100) return false;
  const ids = new Set<string>(), codes = new Set<string>();
  return Array.from(value.places).every(place => {
    if (!fields(place, ['id', 'code', 'name', 'latitude', 'longitude', 'sourceUrl', 'attribution', 'isActive', 'isSample'])
      || typeof place.id !== 'string' || place.id.length !== 36
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(place.id)
      || ids.has(place.id.toLowerCase()) || typeof place.code !== 'string'
      || place.code.length > 80 || !/^sample-wikidata-Q[1-9][0-9]*$/.test(place.code) || codes.has(place.code)
      || !text(place.name, 320) || !text(place.attribution, 2000)
      || typeof place.latitude !== 'number' || !Number.isFinite(place.latitude) || Math.abs(place.latitude) > 90
      || typeof place.longitude !== 'number' || !Number.isFinite(place.longitude) || Math.abs(place.longitude) > 180
      || typeof place.sourceUrl !== 'string' || place.sourceUrl.length > 2048
      || !/^https:\/\/www\.wikidata\.org\/w\/index\.php\?title=Q[1-9][0-9]*&oldid=[1-9][0-9]*$/.test(place.sourceUrl)
      || typeof place.isActive !== 'boolean' || place.isSample !== true) return false;
    ids.add(place.id.toLowerCase()); codes.add(place.code); return true;
  });
}

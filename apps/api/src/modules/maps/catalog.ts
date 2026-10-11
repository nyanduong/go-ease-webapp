import { isSampleMapCatalog, isSampleRouteRequest, type SampleMapCatalog, type SampleRouteRequest } from '@goease/contracts';
import { samplePlaces } from '../../database/sample-catalog.js';
import { loadApprovedSampleCatalog } from '../ai/catalog.js';
import { MapsError } from './errors.js';

/** Recheck even injected/cached catalogs: a valid coordinate alone is not approved data. */
export function validateMapCatalog(value: unknown): SampleMapCatalog {
  if (!isSampleMapCatalog(value)) throw new MapsError('MAPS_INVALID_INPUT');
  const seen = new Set<string>();
  const places = value.places.map(place => {
    const seed = samplePlaces.find(seed => place.sourceUrl === `https://www.wikidata.org/w/index.php?title=${seed.entity}&oldid=${seed.revision}`);
    if (!seed || seen.has(seed.code) || place.name !== seed.name
      || place.latitude !== Number(seed.latitude) || place.longitude !== Number(seed.longitude)
      || place.attribution !== `Wikidata contributors · CC0-1.0 · ${seed.entity} P625 revision ${seed.revision}; retrieved 2026-10-11; source precision ${seed.precision}°; approximate sample point, no price/availability.`) {
      throw new MapsError('MAPS_INVALID_INPUT');
    }
    seen.add(seed.code);
    return { ...place, id: place.id.toLowerCase() };
  }).sort((a, b) => a.sourceUrl.localeCompare(b.sourceUrl, 'en'));
  return { destinationCode: 'VN-HANOI-SAMPLE', isSample: true, places };
}

/** Runtime DB role, existing three CC0 seeds only; no Places creation or Google call. */
export async function loadMapCatalog(databaseUrl: string): Promise<SampleMapCatalog> {
  try {
    const approved = await loadApprovedSampleCatalog(databaseUrl);
    return validateMapCatalog({ destinationCode: 'VN-HANOI-SAMPLE', isSample: true,
      places: approved.map(({ id, name, latitude, longitude, sourceUrl, attribution }) => ({ id, name, latitude, longitude, sourceUrl, attribution })) });
  } catch { throw new MapsError('MAPS_INVALID_INPUT'); }
}

export function prepareSampleRoute(request: unknown, catalog: unknown) {
  const checked = validateMapCatalog(catalog);
  if (!isSampleRouteRequest(request)) throw new MapsError('MAPS_INVALID_INPUT');
  const normalized: SampleRouteRequest = { originPlaceId: request.originPlaceId.toLowerCase(), destinationPlaceId: request.destinationPlaceId.toLowerCase() };
  const origin = checked.places.find(place => place.id === normalized.originPlaceId);
  const destination = checked.places.find(place => place.id === normalized.destinationPlaceId);
  if (!origin || !destination) throw new MapsError('MAPS_INVALID_INPUT');
  return { request: normalized, catalog: checked, origin, destination };
}

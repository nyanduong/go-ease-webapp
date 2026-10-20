import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { destinationSchema, type Destination } from '@goease/contracts';
import { isVietnamCoordinate } from './vietnam-coverage.js';

const text = (value: unknown, max: number) =>
  typeof value === 'string'
    ? value
        .replace(/[\u0000-\u001f\u007f]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, max)
    : '';
const object = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

/** Sign the complete canonical snapshot, including coordinates, source and timezone. */
function canonical(destination: Destination) {
  return JSON.stringify({
    id: destination.id,
    name: destination.name,
    countryCode: destination.countryCode,
    timeZone: destination.timeZone,
    currency: destination.currency,
    center: { latitude: destination.center.latitude, longitude: destination.center.longitude },
    radiusKm: destination.radiusKm,
    ...(destination.address ? { address: destination.address } : {}),
    ...(destination.source
      ? {
          source: {
            provider: destination.source.provider,
            externalId: destination.source.externalId,
            sourceUrl: destination.source.sourceUrl,
            fetchedAt: destination.source.fetchedAt,
          },
        }
      : {}),
  });
}
function signature(destination: Destination, secret: string) {
  return createHmac('sha256', secret)
    .update('goease.destination.v1\0')
    .update(canonical(destination))
    .digest();
}
export function signDestination(destination: Destination, secret: string): Destination {
  // This attests origin, not freshness. Drafts remain usable; source freshness is fetchedAt.
  return { ...destination, selectionToken: signature(destination, secret).toString('base64url') };
}
export function verifyDestination(destination: Destination, secret: string) {
  if (
    !secret ||
    !destination.source ||
    !destination.selectionToken ||
    !/^serp-dest-[a-f0-9]{32}$/.test(destination.id)
  )
    return false;
  const token = Buffer.from(destination.selectionToken, 'base64url');
  if (token.length !== 32 || token.toString('base64url') !== destination.selectionToken)
    return false;
  return timingSafeEqual(token, signature(destination, secret));
}
export const sameDestination = (a: Destination, b: Destination) => canonical(a) === canonical(b);

/** Only GPS candidates inside the independently checked Vietnam boundary become selectable. */
export function normalizeDestinations(raw: unknown, fetchedAt: string) {
  const body = object(raw);
  if (!body) return { valid: false as const, destinations: [] };
  const single = object(body.place_results);
  const entries = single
    ? [single]
    : Array.isArray(body.local_results)
      ? body.local_results
      : undefined;
  if (!entries) return { valid: false as const, destinations: [] };
  const destinations: Destination[] = [];
  const ids = new Set<string>();
  for (const item of entries.slice(0, 100)) {
    const entry = object(item),
      gps = object(entry?.gps_coordinates);
    if (
      !entry ||
      !gps ||
      typeof gps.latitude !== 'number' ||
      typeof gps.longitude !== 'number' ||
      !Number.isFinite(gps.latitude) ||
      !Number.isFinite(gps.longitude) ||
      Math.abs(gps.latitude) > 90 ||
      Math.abs(gps.longitude) > 180 ||
      entry.permanently_closed === true
    )
      continue;
    const name = text(entry.title, 120),
      externalId = text(entry.place_id, 300) || text(entry.data_id, 300);
    if (!name || !externalId) continue;
    const center = { latitude: gps.latitude, longitude: gps.longitude };
    if (!isVietnamCoordinate(center)) continue;
    const id = `serp-dest-${createHash('sha256')
      .update(JSON.stringify([externalId, center.latitude, center.longitude]))
      .digest('hex')
      .slice(0, 32)}`;
    if (ids.has(id)) continue;
    const sourceUrl = new URL('https://www.google.com/maps/search/');
    sourceUrl.searchParams.set('api', '1');
    sourceUrl.searchParams.set('query', `${center.latitude},${center.longitude}`);
    const address = text(entry.address ?? entry.formatted_address, 500);
    const parsed = destinationSchema.safeParse({
      id,
      name,
      countryCode: 'VN',
      timeZone: 'Asia/Ho_Chi_Minh',
      currency: 'VND',
      center,
      radiusKm: 25,
      ...(address ? { address } : {}),
      source: { provider: 'serpapi', externalId, sourceUrl: sourceUrl.toString(), fetchedAt },
    });
    if (!parsed.success) continue;
    ids.add(id);
    destinations.push(parsed.data);
    if (destinations.length >= 10) break;
  }
  return { valid: true as const, destinations };
}

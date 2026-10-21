import { createHash } from 'node:crypto';
import { discoveryPlaceSchema, type Destination, type DiscoveryPlace } from '@goease/contracts';
import { isVietnamCoordinate } from './vietnam-coverage.js';

const text = (value: unknown, max: number) =>
  typeof value === 'string'
    ? value
        .replace(/[\u0000-\u001f\u007f]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, max)
    : '';
const fold = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase();
const object = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
function isNonVisitBusiness(entry: Record<string, unknown>) {
  const typeLabels = [
    entry.type,
    entry.type_id,
    ...(Array.isArray(entry.types) ? entry.types.slice(0, 15) : []),
    ...(Array.isArray(entry.type_ids) ? entry.type_ids.slice(0, 15) : []),
  ];
  const labels = fold(typeLabels.map((value) => text(value, 120)).join(' ')).replace(/[_-]/g, ' ');
  if (
    /\b(travel agency|travelagency|tour operator|tour agency|travel consultant|visa agent|booking agency|dai ly du lich|cong ty du lich|dich vu lu hanh|van phong du lich|hotel|lodging|accommodation|hostel|motel|resort hotel|khach san|nha nghi|cho o|real estate|real estate agency|bat dong san|corporate office|van phong cong ty)\b/.test(
      labels,
    )
  )
    return true;
  // Maps can misclassify an operator's office as a generic tourist attraction.
  // Apply business-name suffixes conservatively, retaining named/specific museums and landmarks.
  const name = fold(text(entry.title, 120)).replace(/[\s.,!"'’()]+$/g, '');
  const namedAttraction =
    /\b(museum|bao tang|park|cong vien|temple|pagoda|chua|church|nha tho|garden|vuon|monument|memorial|citadel|palace|aquarium|zoo|heritage|di tich)\b/;
  return (
    /\b(travel|tours|travel company|tour agency|tour operator|travel agency)$/.test(name) &&
    !namedAttraction.test(`${name} ${labels}`)
  );
}
export function distanceKm(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
) {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = radians(b.latitude - a.latitude),
    dLon = radians(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(a.latitude)) * Math.cos(radians(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}
function category(value: string): DiscoveryPlace['category'] {
  const normalized = fold(value);
  if (/cafe|coffee|ca phe|cà phê/.test(normalized)) return 'cafe';
  if (/restaurant|food|nha hang|quan an|am thuc|banh mi/.test(normalized)) return 'food';
  if (/church|temple|pagoda|chua|nha tho|shrine|religio|den tho/.test(normalized))
    return 'religious';
  if (/market|cho |night market/.test(normalized)) return 'market';
  if (/garden|vuon|flower|botanical/.test(normalized)) return 'garden';
  if (/museum|heritage|histor|bao tang|dinh|di tich|palace|citadel/.test(normalized))
    return 'heritage';
  if (
    /lake|mountain|waterfall|beach|nature|national park|ho |nui|thac|bien|forest|cave|hang /.test(
      normalized,
    )
  )
    return 'nature';
  return 'public-space';
}
const durations: Record<DiscoveryPlace['category'], number> = {
  food: 60,
  cafe: 45,
  heritage: 90,
  religious: 45,
  nature: 90,
  garden: 60,
  market: 60,
  'public-space': 45,
};
function parseClock(value: string) {
  const parsed = value.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (!parsed) return undefined;
  let hour = Number(parsed[1]);
  const minute = Number(parsed[2] ?? 0),
    half = parsed[3]?.toUpperCase();
  if (minute > 59 || (half ? hour < 1 || hour > 12 : hour > 23)) return undefined;
  if (half) hour = (hour % 12) + (half === 'PM' ? 12 : 0);
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}
function openingHours(value: unknown) {
  const hours = object(value);
  if (!hours) return { openingHours: text(value, 1500), incomplete: Boolean(value) };
  const days: Record<string, number> = {
    sunday: 0,
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6,
    'chu nhat': 0,
    'thu hai': 1,
    'thu ba': 2,
    'thu tu': 3,
    'thu nam': 4,
    'thu sau': 5,
    'thu bay': 6,
    'thu 2': 1,
    'thu 3': 2,
    'thu 4': 3,
    'thu 5': 4,
    'thu 6': 5,
    'thu 7': 6,
  };
  const windows: NonNullable<DiscoveryPlace['openingWindows']> = [];
  const labels: string[] = [];
  const completeDays = new Set<number>();
  let invalid = false;
  for (const [day, raw] of Object.entries(hours).slice(0, 7)) {
    const label = text(raw, 150);
    if (!label || !(fold(day) in days)) continue;
    labels.push(`${day}: ${label}`);
    const dayOfWeek = days[fold(day)]!;
    if (/^(closed|dong cua)$/i.test(fold(label))) {
      completeDays.add(dayOfWeek);
      continue;
    }
    if (/^(open 24 hours|mo cua 24 gio|mo cua ca ngay|24\/24)$/i.test(fold(label))) {
      windows.push({ dayOfWeek, startTime: '00:00', endTime: '23:59' });
      completeDays.add(dayOfWeek);
      continue;
    }
    let complete = true;
    for (const range of label.split(',')) {
      const halves = range.replace(/[\u202f\u00a0]/g, ' ').split(/\s*[–—-]\s*/);
      const startTime = halves.length === 2 ? parseClock(halves[0]!) : undefined,
        endTime = halves.length === 2 ? parseClock(halves[1]!) : undefined;
      const sameClockFormat =
        halves.length === 2 &&
        /\b(?:AM|PM)\s*$/i.test(halves[0]!) === /\b(?:AM|PM)\s*$/i.test(halves[1]!);
      if (startTime && endTime && endTime > startTime && sameClockFormat)
        windows.push({ dayOfWeek, startTime, endTime });
      else complete = false;
    }
    if (complete) completeDays.add(dayOfWeek);
    else invalid = true;
  }
  const complete = completeDays.size === 7 && !invalid && windows.length <= 28;
  return {
    openingHours: labels.join('; '),
    ...(complete ? { openingWindows: windows } : {}),
    incomplete: !complete,
  };
}

/** SerpApi region hints are not boundaries. Only GPS-confirmed, in-radius results are accepted. */
export function normalizePlaces(raw: unknown, destination: Destination, fetchedAt: string) {
  const body = object(raw);
  if (!body || !Array.isArray(body.local_results))
    return { valid: false as const, places: [], rejected: 0 };
  const places: DiscoveryPlace[] = [];
  let rejected = 0,
    incompleteHours = 0;
  const ids = new Set<string>();
  for (const item of body.local_results.slice(0, 100)) {
    const entry = object(item),
      gps = object(entry?.gps_coordinates);
    if (
      !entry ||
      !gps ||
      isNonVisitBusiness(entry) ||
      typeof gps.latitude !== 'number' ||
      typeof gps.longitude !== 'number' ||
      !Number.isFinite(gps.latitude) ||
      !Number.isFinite(gps.longitude) ||
      gps.latitude < -90 ||
      gps.latitude > 90 ||
      gps.longitude < -180 ||
      gps.longitude > 180 ||
      entry.permanently_closed === true ||
      entry.temporarily_closed === true ||
      /permanently closed|temporarily closed|dong cua vinh vien|tam thoi dong cua/.test(
        fold(text(entry.open_state, 150)),
      )
    ) {
      rejected++;
      continue;
    }
    const coordinates = { latitude: gps.latitude, longitude: gps.longitude };
    const name = text(entry.title, 120),
      externalId = text(entry.place_id, 240) || text(entry.data_id, 240);
    if (
      !name ||
      !externalId ||
      !isVietnamCoordinate(coordinates) ||
      distanceKm(destination.center, coordinates) > destination.radiusKm ||
      ids.has(externalId) ||
      places.some(
        (place) =>
          fold(place.name) === fold(name) && distanceKm(place.coordinates, coordinates) < 0.15,
      )
    ) {
      rejected++;
      continue;
    }
    const kind = category(`${text(entry.type, 120)} ${name}`);
    // Use a key-free Google Maps source, never SerpApi's place_id_search URL.
    const sourceUrl = new URL('https://www.google.com/maps/search/');
    sourceUrl.searchParams.set('api', '1');
    sourceUrl.searchParams.set('query', `${coordinates.latitude},${coordinates.longitude}`);
    if (typeof entry.place_id === 'string')
      sourceUrl.searchParams.set('query_place_id', externalId);
    const hours = openingHours(entry.operating_hours ?? entry.hours);
    const parsed = discoveryPlaceSchema.safeParse({
      id: `serp-${createHash('sha256').update(externalId).digest('hex').slice(0, 32)}`,
      provider: 'serpapi',
      externalId,
      name,
      destinationId: destination.id,
      coordinates,
      address: text(entry.address, 300),
      category: kind,
      rating:
        typeof entry.rating === 'number' && entry.rating >= 0 && entry.rating <= 5
          ? entry.rating
          : null,
      ...(hours.openingHours ? { openingHours: hours.openingHours } : {}),
      ...('openingWindows' in hours && hours.openingWindows
        ? { openingWindows: hours.openingWindows }
        : {}),
      ...(typeof entry.thumbnail === 'string' &&
      entry.thumbnail.length <= 2048 &&
      URL.canParse(entry.thumbnail) &&
      new URL(entry.thumbnail).protocol === 'https:'
        ? { thumbnailUrl: entry.thumbnail }
        : {}),
      durationMinutes: durations[kind],
      durationBasis: 'estimate',
      sourceUrl: sourceUrl.toString(),
      fetchedAt,
      priceLevel: text(entry.price, 50) || null,
    });
    if (!parsed.success) {
      rejected++;
      continue;
    }
    ids.add(externalId);
    places.push(parsed.data);
    if (hours.incomplete && hours.openingHours) incompleteHours++;
    if (places.length >= 40) break;
  }
  return {
    valid: true as const,
    places,
    rejected,
    warnings: incompleteHours
      ? [
          `${incompleteHours} địa điểm có giờ mở cửa chưa đầy đủ hoặc có khung giờ qua đêm; cần kiểm tra giờ trước khi đi.`,
        ]
      : [],
  };
}

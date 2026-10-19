import { placeSchema, tripSchema, type Place } from '@goease/contracts';

export interface DayPin {
  placeId: string;
  name: string;
  coordinates: Place['coordinates'];
  activities: { id: string; name: string; order: number }[];
}
export function projectDayMap(input: unknown, dayId: string, catalog: Place[]) {
  const trip = tripSchema.parse(input),
    day = trip.days.find((item) => item.id === dayId);
  if (!day) throw new RangeError('Không tìm thấy ngày của chuyến.');
  const places = new Map<string, Place>();
  for (const value of catalog) {
    const place = placeSchema.parse(value);
    if (places.has(place.id)) throw new RangeError('Catalog có Place ID trùng.');
    places.set(place.id, place);
  }
  const pins = new Map<string, DayPin>();
  const unlocated: {
    id: string;
    name: string;
    order: number;
    reason: 'custom' | 'missing-place';
  }[] = [];
  day.activities.forEach((activity, index) => {
    const place =
      activity.location.kind === 'catalog' ? places.get(activity.location.placeId) : undefined;
    if (!place) {
      unlocated.push({
        id: activity.id,
        name: activity.name,
        order: index + 1,
        reason: activity.location.kind === 'custom' ? 'custom' : 'missing-place',
      });
      return;
    }
    const pin = pins.get(place.id) ?? {
      placeId: place.id,
      name: place.name,
      coordinates: { ...place.coordinates },
      activities: [],
    };
    pin.activities.push({
      id: activity.id,
      name: activity.name,
      order: index + 1,
    });
    pins.set(place.id, pin);
  });
  const located = [...pins.values()];
  let region: {
    latitude: number;
    longitude: number;
    latitudeDelta: number;
    longitudeDelta: number;
  } | null = null;
  if (located.length) {
    const latitudes = located.map((pin) => pin.coordinates.latitude),
      longitudes = located.map((pin) => pin.coordinates.longitude);
    const minLat = Math.min(...latitudes),
      maxLat = Math.max(...latitudes),
      minLon = Math.min(...longitudes),
      maxLon = Math.max(...longitudes);
    region = {
      latitude: (minLat + maxLat) / 2,
      longitude: (minLon + maxLon) / 2,
      latitudeDelta: Math.min(180, Math.max(0.02, (maxLat - minLat) * 1.5)),
      longitudeDelta: Math.min(360, Math.max(0.02, (maxLon - minLon) * 1.5)),
    };
  }
  return {
    dayId: day.id,
    date: day.date,
    activityCount: day.activities.length,
    pins: located,
    unlocated,
    region,
  };
}
export type DayMap = ReturnType<typeof projectDayMap>;

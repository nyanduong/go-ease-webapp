import { z } from 'zod';

export const destinationIdSchema = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,79}$/).refine((value) => value.trim() === value);
export const coordinatesSchema = z.strictObject({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) });
export const timeZoneSchema = z.string().min(1).max(80).refine((value) => {
  try { new Intl.DateTimeFormat('en-US', { timeZone: value }).format(0); return true; }
  catch { return false; }
}, 'Múi giờ không hợp lệ');
/** Monetary fields remain explicitly VND until a separate currency conversion policy exists. */
export const destinationSchema = z.strictObject({
  id: destinationIdSchema, name: z.string().trim().min(1).max(120),
  countryCode: z.string().regex(/^[A-Z]{2}$/), timeZone: timeZoneSchema, currency: z.literal('VND'),
  center: coordinatesSchema, radiusKm: z.number().min(1).max(150),
});
export type Destination = z.infer<typeof destinationSchema>;

/** Search starting points, not claims that a live place catalogue exists for each city. */
export const DESTINATIONS: readonly Destination[] = Object.freeze([
  { id: 'da-lat', name: 'Đà Lạt', center: { latitude: 11.9404, longitude: 108.4583 }, radiusKm: 35 },
  { id: 'ha-noi', name: 'Hà Nội', center: { latitude: 21.0285, longitude: 105.8542 }, radiusKm: 35 },
  { id: 'da-nang', name: 'Đà Nẵng', center: { latitude: 16.0544, longitude: 108.2022 }, radiusKm: 35 },
  { id: 'hoi-an', name: 'Hội An', center: { latitude: 15.8801, longitude: 108.338 }, radiusKm: 20 },
  { id: 'ho-chi-minh', name: 'TP. Hồ Chí Minh', center: { latitude: 10.7769, longitude: 106.7009 }, radiusKm: 40 },
  { id: 'hue', name: 'Huế', center: { latitude: 16.4637, longitude: 107.5909 }, radiusKm: 30 },
  { id: 'nha-trang', name: 'Nha Trang', center: { latitude: 12.2388, longitude: 109.1967 }, radiusKm: 30 },
  { id: 'phu-quoc', name: 'Phú Quốc', center: { latitude: 10.2899, longitude: 103.984 }, radiusKm: 45 },
].map((destination) => Object.freeze({ ...destination, center: Object.freeze(destination.center), countryCode: 'VN', timeZone: 'Asia/Ho_Chi_Minh', currency: 'VND' as const })));

export function getDestination(id: string): Destination | undefined {
  const destination = DESTINATIONS.find((value) => value.id === id);
  return destination ? { ...destination, center: { ...destination.center } } : undefined;
}

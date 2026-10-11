/** M0 core template, group totals in VND; null means unknown, zero means free. */
export const SAMPLE_DESTINATION = 'VN-HANOI-SAMPLE' as const;
export const TRIP_TIME_ZONE = 'Asia/Ho_Chi_Minh' as const;
export const MAX_AMOUNT_VND = 1_000_000_000_000;
export const MAX_TRIP_VERSION = 2_147_483_647;
export interface CreateTripRequest {
  title: string; destinationCode: typeof SAMPLE_DESTINATION; startDate: string;
  durationDays: number; groupSize: number; budgetVnd: number | null;
}
export interface UpdateTripActivity {
  id: string | null; placeId: string | null; title: string; notes: string | null;
  startMinute: number | null; endMinute: number | null; estimatedCostVnd: number | null;
}
export interface UpdateTripRequest {
  expectedVersion: number; title: string; groupSize: number; budgetVnd: number | null;
  days: Array<{ dayNumber: number; activities: UpdateTripActivity[] }>;
}
export interface TripPlace {
  id: string; name: string; latitude: number; longitude: number; sourceUrl: string;
  attribution: string; active: boolean; isSample: boolean;
}
export interface TripActivity {
  id: string; position: number; title: string; notes: string | null; startMinute: number | null;
  endMinute: number | null; estimatedCostVnd: number | null; place: TripPlace | null;
}
export interface TripDay { id: string; dayNumber: number; date: string; activities: TripActivity[] }
export interface TripTotals { knownSubtotalVnd: number; unknownCostCount: number; estimatedTotalVnd: number | null }
export type TripWarning = { code: 'BUDGET_EXCEEDED' } | { code: 'ACTIVITY_OVERLAP'; dayNumber: number };
export interface TripSummary {
  id: string; title: string; destinationCode: typeof SAMPLE_DESTINATION; isSample: true;
  startDate: string; durationDays: number; groupSize: number; budgetVnd: number | null;
  version: number; createdAt: string; updatedAt: string;
}
export interface TripDetail extends TripSummary {
  timeZone: typeof TRIP_TIME_ZONE; days: TripDay[]; totals: TripTotals; warnings: TripWarning[];
}
export interface TripCursor { updatedAt: string; id: string }
export interface TripListResponse { trips: TripSummary[]; nextCursor: TripCursor | null }

function fields(value: unknown, keys: string[]): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every(key => Object.prototype.hasOwnProperty.call(value, key));
}
export function isTripUuid(value: unknown): value is string {
  return typeof value === 'string' && value.length === 36 && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
function integer(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
}
export function isTripAmount(value: unknown): value is number | null { return value === null || integer(value, 0, MAX_AMOUNT_VND); }
function text(value: unknown, max: number, empty = false): value is string {
  return typeof value === 'string' && (empty || value.trim().length > 0)
    && [...value].length <= max && !/[\p{Cc}\p{Cs}]/u.test(value);
}
/** Multiline plain notes retain LF/CR/TAB; other controls and lone surrogates are refused. */
function notes(value: unknown): value is string {
  return typeof value === 'string' && [...value].length <= 1000
    && !/[\p{Cc}\p{Cs}]/u.test(value.replace(/[\n\r\t]/g, ''));
}
/** Actual calendar date; host timezone never participates. */
export function isTripDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^(20[0-9]{2})-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/.test(value)) return false;
  const milliseconds = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString().slice(0, 10) === value;
}
export function tripDateAt(startDate: string, dayNumber: number): string {
  if (!isTripDate(startDate) || !integer(dayNumber, 1, 5)) throw new Error('Invalid trip calendar date.');
  return new Date(Date.parse(`${startDate}T00:00:00.000Z`) + (dayNumber - 1) * 86_400_000).toISOString().slice(0, 10);
}
function dates(startDate: unknown, durationDays: unknown) {
  return isTripDate(startDate) && integer(durationDays, 1, 5) && isTripDate(tripDateAt(startDate, durationDays));
}
function timePair(start: unknown, end: unknown) {
  return start === null && end === null || integer(start, 0, 1439) && integer(end, 1, 1440) && start < end;
}
function instant(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}
export function isCreateTripRequest(value: unknown): value is CreateTripRequest {
  return fields(value, ['title', 'destinationCode', 'startDate', 'durationDays', 'groupSize', 'budgetVnd'])
    && text(value.title, 160) && value.destinationCode === SAMPLE_DESTINATION && dates(value.startDate, value.durationDays)
    && integer(value.groupSize, 1, 50) && isTripAmount(value.budgetVnd);
}
export function isUpdateTripRequest(value: unknown): value is UpdateTripRequest {
  if (!fields(value, ['expectedVersion', 'title', 'groupSize', 'budgetVnd', 'days'])
    || !integer(value.expectedVersion, 1, MAX_TRIP_VERSION) || !text(value.title, 160)
    || !integer(value.groupSize, 1, 50) || !isTripAmount(value.budgetVnd)
    || !Array.isArray(value.days) || value.days.length < 1 || value.days.length > 5) return false;
  const ids = new Set<string>();
  return Array.from(value.days).every((day, index) => {
    if (!fields(day, ['dayNumber', 'activities']) || day.dayNumber !== index + 1
      || !Array.isArray(day.activities) || day.activities.length > 50) return false;
    return Array.from(day.activities).every(activity => {
      if (!fields(activity, ['id', 'placeId', 'title', 'notes', 'startMinute', 'endMinute', 'estimatedCostVnd'])
        || !(activity.id === null || isTripUuid(activity.id)) || !(activity.placeId === null || isTripUuid(activity.placeId))
        || !text(activity.title, 160) || !(activity.notes === null || notes(activity.notes))
        || !timePair(activity.startMinute, activity.endMinute) || !isTripAmount(activity.estimatedCostVnd)) return false;
      if (activity.id !== null) {
        const id = activity.id.toLowerCase(); if (ids.has(id)) return false; ids.add(id);
      }
      return true;
    });
  });
}
/** Explicit field order/UUID case for hashing; never hash unvalidated raw input. */
export function canonicalCreateTrip(value: CreateTripRequest): CreateTripRequest {
  if (!isCreateTripRequest(value)) throw new Error('Invalid create trip request.');
  return { title: value.title.trim(), destinationCode: value.destinationCode, startDate: value.startDate,
    durationDays: value.durationDays, groupSize: value.groupSize, budgetVnd: value.budgetVnd };
}
export function canonicalUpdateTrip(value: UpdateTripRequest): UpdateTripRequest {
  if (!isUpdateTripRequest(value)) throw new Error('Invalid update trip request.');
  return { expectedVersion: value.expectedVersion, title: value.title.trim(), groupSize: value.groupSize, budgetVnd: value.budgetVnd,
    days: value.days.map(day => ({ dayNumber: day.dayNumber, activities: day.activities.map(activity => ({
      id: activity.id?.toLowerCase() ?? null, placeId: activity.placeId?.toLowerCase() ?? null,
      title: activity.title.trim(), notes: activity.notes, startMinute: activity.startMinute,
      endMinute: activity.endMinute, estimatedCostVnd: activity.estimatedCostVnd,
    })) })) };
}
/** Amount bound applies per item; the aggregate may legitimately exceed that bound. */
export function calculateTripTotals(days: Array<{ activities: Array<{ estimatedCostVnd: number | null }> }>): TripTotals {
  if (days.length < 1 || days.length > 5) throw new Error('Invalid trip totals input.');
  let knownSubtotalVnd = 0, unknownCostCount = 0;
  for (const day of days) {
    if (day.activities.length > 50) throw new Error('Invalid trip totals input.');
    for (const activity of day.activities) {
      if (!isTripAmount(activity.estimatedCostVnd)) throw new Error('Invalid trip totals input.');
      if (activity.estimatedCostVnd === null) unknownCostCount++; else knownSubtotalVnd += activity.estimatedCostVnd;
    }
  }
  return { knownSubtotalVnd, unknownCostCount, estimatedTotalVnd: unknownCostCount ? null : knownSubtotalVnd };
}
export function calculateTripWarnings(days: Array<{ dayNumber: number; activities: Array<{ startMinute: number | null; endMinute: number | null; estimatedCostVnd: number | null }> }>, budgetVnd: number | null): TripWarning[] {
  const warnings: TripWarning[] = [];
  if (budgetVnd !== null && calculateTripTotals(days).knownSubtotalVnd > budgetVnd) warnings.push({ code: 'BUDGET_EXCEEDED' });
  for (const day of days) {
    const timed = day.activities.filter((a): a is typeof a & { startMinute: number; endMinute: number } => a.startMinute !== null && a.endMinute !== null)
      .slice().sort((a, b) => a.startMinute - b.startMinute);
    let latestEnd = -1;
    for (const activity of timed) {
      if (activity.startMinute < latestEnd) { warnings.push({ code: 'ACTIVITY_OVERLAP', dayNumber: day.dayNumber }); break; }
      latestEnd = Math.max(latestEnd, activity.endMinute);
    }
  }
  return warnings;
}
const summaryKeys = ['id', 'title', 'destinationCode', 'isSample', 'startDate', 'durationDays', 'groupSize', 'budgetVnd', 'version', 'createdAt', 'updatedAt'];
function summary(value: Record<string, unknown>) {
  return isTripUuid(value.id) && text(value.title, 160) && value.destinationCode === SAMPLE_DESTINATION && value.isSample === true
    && dates(value.startDate, value.durationDays) && integer(value.groupSize, 1, 50) && isTripAmount(value.budgetVnd)
    && integer(value.version, 1, MAX_TRIP_VERSION) && instant(value.createdAt) && instant(value.updatedAt);
}
export function isTripSummary(value: unknown): value is TripSummary { return fields(value, summaryKeys) && summary(value); }
function publicSource(value: unknown): value is string {
  if (!text(value, 2048)) return false;
  // WHATWG URL exists on Node, browsers and React Native; no DOM/framework dependency.
  const Url = (globalThis as unknown as { URL: new (input: string) => {
    protocol: string; hostname: string; username: string; password: string;
  } }).URL;
  try { const url = new Url(value); return url.protocol === 'https:' && Boolean(url.hostname) && !url.username && !url.password; }
  catch { return false; }
}
function place(value: unknown): value is TripPlace {
  if (value === null) return false;
  return fields(value, ['id', 'name', 'latitude', 'longitude', 'sourceUrl', 'attribution', 'active', 'isSample'])
    && isTripUuid(value.id) && text(value.name, 160) && typeof value.latitude === 'number' && Number.isFinite(value.latitude) && Math.abs(value.latitude) <= 90
    && typeof value.longitude === 'number' && Number.isFinite(value.longitude) && Math.abs(value.longitude) <= 180
    && publicSource(value.sourceUrl) && text(value.attribution, 1000)
    && typeof value.active === 'boolean' && typeof value.isSample === 'boolean';
}
export function isTripDetail(value: unknown): value is TripDetail {
  if (!fields(value, [...summaryKeys, 'timeZone', 'days', 'totals', 'warnings']) || !summary(value)
    || value.timeZone !== TRIP_TIME_ZONE || !Array.isArray(value.days) || value.days.length !== value.durationDays) return false;
  const ids = new Set<string>(), dayIds = new Set<string>();
  const validDays = Array.from(value.days).every((day, index) => {
    if (!fields(day, ['id', 'dayNumber', 'date', 'activities']) || !isTripUuid(day.id) || dayIds.has(day.id.toLowerCase())
      || day.dayNumber !== index + 1 || day.date !== tripDateAt(value.startDate as string, index + 1)
      || !Array.isArray(day.activities) || day.activities.length > 50) return false;
    dayIds.add(day.id.toLowerCase());
    return Array.from(day.activities).every((activity, position) => {
      if (!fields(activity, ['id', 'position', 'title', 'notes', 'startMinute', 'endMinute', 'estimatedCostVnd', 'place'])
        || !isTripUuid(activity.id) || ids.has(activity.id.toLowerCase()) || activity.position !== position
        || !text(activity.title, 160) || !(activity.notes === null || notes(activity.notes))
        || !timePair(activity.startMinute, activity.endMinute) || !isTripAmount(activity.estimatedCostVnd)
        || !(activity.place === null || place(activity.place))) return false;
      ids.add(activity.id.toLowerCase()); return true;
    });
  });
  if (!validDays || !fields(value.totals, ['knownSubtotalVnd', 'unknownCostCount', 'estimatedTotalVnd']) || !Array.isArray(value.warnings)) return false;
  const days = value.days as TripDay[], totals = calculateTripTotals(days);
  const warnings = calculateTripWarnings(days, value.budgetVnd as number | null);
  return value.totals.knownSubtotalVnd === totals.knownSubtotalVnd && value.totals.unknownCostCount === totals.unknownCostCount
    && value.totals.estimatedTotalVnd === totals.estimatedTotalVnd
    && value.warnings.length === warnings.length && Array.from(value.warnings).every((warning, index) => {
      const expected = warnings[index]!;
      return expected.code === 'BUDGET_EXCEEDED'
        ? fields(warning, ['code']) && warning.code === expected.code
        : fields(warning, ['code', 'dayNumber']) && warning.code === expected.code && warning.dayNumber === expected.dayNumber;
    });
}
export function isTripCursor(value: unknown): value is TripCursor {
  return fields(value, ['updatedAt', 'id']) && instant(value.updatedAt) && isTripUuid(value.id);
}
export function isTripListResponse(value: unknown): value is TripListResponse {
  if (!fields(value, ['trips', 'nextCursor']) || !Array.isArray(value.trips) || value.trips.length > 50
    || !(value.nextCursor === null || isTripCursor(value.nextCursor))) return false;
  const ids = new Set<string>();
  return Array.from(value.trips).every(trip => {
    if (!isTripSummary(trip) || ids.has(trip.id.toLowerCase())) return false;
    ids.add(trip.id.toLowerCase()); return true;
  });
}

/** M0 spike only: a proposed schedule, not opening hours, a route or a booking. */
export interface AiDraftRequest {
  durationDays: number;
  candidatePlaceIds: string[];
}

export interface AiScheduleActivity {
  placeId: string;
  startMinute: number;
  endMinute: number;
}

/** The model may select IDs and time intervals, never invent place/cost fields. */
export interface AiScheduleDraft {
  days: Array<{ dayNumber: number; activities: AiScheduleActivity[] }>;
}

/** Controlled backend snapshot; never supplied by a model or an app payload. */
export interface AiCandidatePlace {
  id: string;
  destinationCode: string;
  name: string;
  latitude: number;
  longitude: number;
  sourceUrl: string;
  attribution: string;
  active: boolean;
  isSample: boolean;
}

export interface AiValidatedSchedule {
  durationDays: number;
  timeZone: 'Asia/Ho_Chi_Minh';
  isSample: true;
  days: Array<{
    dayNumber: number;
    activities: Array<AiScheduleActivity & {
      title: string;
      latitude: number;
      longitude: number;
      sourceUrl: string;
      attribution: string;
      estimatedCostVnd: null;
    }>;
  }>;
  knownSubtotalVnd: number;
  unknownCostCount: number;
  estimatedTotalVnd: null;
}

function objectWithKeys(value: unknown, keys: string[]): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    && Object.keys(value).length === keys.length
    && keys.every(key => Object.prototype.hasOwnProperty.call(value, key));
}
function integer(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
}
function placeId(value: unknown): value is string {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function isAiDraftRequest(value: unknown): value is AiDraftRequest {
  if (!objectWithKeys(value, ['durationDays', 'candidatePlaceIds'])
    || !integer(value.durationDays, 1, 5) || !Array.isArray(value.candidatePlaceIds)
    || value.candidatePlaceIds.length < 1 || value.candidatePlaceIds.length > 10
    || !value.candidatePlaceIds.every(placeId)) return false;
  return new Set(value.candidatePlaceIds.map(id => id.toLowerCase())).size === value.candidatePlaceIds.length;
}

/** Wire shape only; the backend also binds duration and IDs to its snapshot. */
export function isAiScheduleDraft(value: unknown): value is AiScheduleDraft {
  if (!objectWithKeys(value, ['days']) || !Array.isArray(value.days)
    || value.days.length < 1 || value.days.length > 5) return false;
  return value.days.every(day => {
    if (!objectWithKeys(day, ['dayNumber', 'activities']) || !integer(day.dayNumber, 1, 5)
      || !Array.isArray(day.activities) || day.activities.length < 1 || day.activities.length > 10) return false;
    return day.activities.every(activity => objectWithKeys(activity, ['placeId', 'startMinute', 'endMinute'])
      && placeId(activity.placeId) && integer(activity.startMinute, 0, 1439)
      && integer(activity.endMinute, 1, 1440) && activity.startMinute < activity.endMinute);
  });
}

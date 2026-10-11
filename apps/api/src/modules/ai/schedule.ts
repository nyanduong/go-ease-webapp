import { isAiDraftRequest, isAiScheduleDraft, type AiCandidatePlace, type AiDraftRequest,
  type AiValidatedSchedule } from '@goease/contracts';
import { AiError } from './errors.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const text = (value: unknown, max: number): value is string => typeof value === 'string'
  && value.trim().length > 0 && [...value].length <= max && !/[\u0000-\u001f\u007f-\u009f]/u.test(value);

function validSource(value: unknown) {
  if (typeof value !== 'string' || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.hash;
  } catch { return false; }
}

export interface PreparedAiRequest {
  readonly durationDays: number;
  readonly candidates: ReadonlyArray<Readonly<AiCandidatePlace>>;
}

/** Copy once: validation and final decoration use the same canonical snapshot. */
export function prepareAiRequest(request: unknown, catalog: readonly AiCandidatePlace[]): PreparedAiRequest {
  if (!isAiDraftRequest(request) || !Array.isArray(catalog) || catalog.length < 1 || catalog.length > 10) {
    throw new AiError('AI_INVALID_INPUT');
  }
  const byId = new Map<string, AiCandidatePlace>();
  for (const place of catalog) {
    if (!place || typeof place !== 'object' || typeof place.id !== 'string' || !uuid.test(place.id) || !text(place.name, 160)
      || !text(place.destinationCode, 64) || !text(place.attribution, 1000) || !validSource(place.sourceUrl)
      || typeof place.latitude !== 'number' || !Number.isFinite(place.latitude) || Math.abs(place.latitude) > 90
      || typeof place.longitude !== 'number' || !Number.isFinite(place.longitude) || Math.abs(place.longitude) > 180
      || place.active !== true || place.isSample !== true || byId.has(place.id.toLowerCase())) {
      throw new AiError('AI_INVALID_INPUT');
    }
    byId.set(place.id.toLowerCase(), { id: place.id.toLowerCase(), destinationCode: place.destinationCode,
      name: place.name, latitude: place.latitude, longitude: place.longitude, sourceUrl: place.sourceUrl,
      attribution: place.attribution, active: true, isSample: true });
  }
  const candidates = request.candidatePlaceIds.map(id => byId.get(id.toLowerCase()));
  if (candidates.some(place => !place) || new Set(candidates.map(place => place?.destinationCode)).size !== 1) {
    throw new AiError('AI_INVALID_INPUT');
  }
  return Object.freeze({ durationDays: request.durationDays,
    candidates: Object.freeze(candidates.map(place => Object.freeze(place!))) });
}

export function aiResponseSchema(prepared: PreparedAiRequest) {
  return {
    type: 'object', additionalProperties: false, required: ['days'], properties: {
      days: { type: 'array', minItems: prepared.durationDays, maxItems: prepared.durationDays, items: {
        type: 'object', additionalProperties: false, required: ['dayNumber', 'activities'], properties: {
          dayNumber: { type: 'integer', minimum: 1, maximum: prepared.durationDays },
          activities: { type: 'array', minItems: 1, maxItems: 10, items: {
            type: 'object', additionalProperties: false, required: ['placeId', 'startMinute', 'endMinute'], properties: {
              placeId: { type: 'string', enum: prepared.candidates.map(place => place.id) },
              startMinute: { type: 'integer', minimum: 0, maximum: 1439 },
              endMinute: { type: 'integer', minimum: 1, maximum: 1440 },
            },
          } },
        },
      } },
    },
  };
}

export function validateAiSchedule(value: unknown, prepared: PreparedAiRequest): AiValidatedSchedule {
  if (!isAiScheduleDraft(value) || value.days.length !== prepared.durationDays) throw new AiError('AI_INVALID_OUTPUT');
  const byId = new Map(prepared.candidates.map(place => [place.id, place]));
  let activityCount = 0;
  const days = value.days.map((day, index) => {
    if (day.dayNumber !== index + 1) throw new AiError('AI_INVALID_OUTPUT');
    let previousEnd = 0;
    const seen = new Set<string>();
    const activities = day.activities.map(activity => {
      const id = activity.placeId.toLowerCase(), place = byId.get(id);
      if (!place || seen.has(id) || activity.startMinute < previousEnd) throw new AiError('AI_INVALID_OUTPUT');
      seen.add(id); previousEnd = activity.endMinute; activityCount++;
      return { placeId: id, startMinute: activity.startMinute, endMinute: activity.endMinute,
        title: place.name, latitude: place.latitude, longitude: place.longitude,
        sourceUrl: place.sourceUrl, attribution: place.attribution, estimatedCostVnd: null };
    });
    return { dayNumber: day.dayNumber, activities };
  });
  if (activityCount > 50) throw new AiError('AI_INVALID_OUTPUT');
  return { durationDays: prepared.durationDays, timeZone: 'Asia/Ho_Chi_Minh', isSample: true, days,
    knownSubtotalVnd: 0, unknownCostCount: activityCount, estimatedTotalVnd: null };
}

export function aiModelInput(prepared: PreparedAiRequest) {
  // Names are data, not instructions. No identity, coordinates, cost or source URLs leave this boundary.
  return JSON.stringify({ durationDays: prepared.durationDays,
    candidates: prepared.candidates.map(place => ({ placeId: place.id, name: place.name })) });
}

export function requestFromCatalog(durationDays: number, catalog: readonly AiCandidatePlace[]): AiDraftRequest {
  return { durationDays, candidatePlaceIds: catalog.map(place => place.id) };
}

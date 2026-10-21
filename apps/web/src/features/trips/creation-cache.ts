import {
  destinationSchema,
  discoveryPreviewResponseSchema,
  type DiscoveryPreviewResponse,
  type DiscoveryPreviewRequest,
} from '@goease/contracts';
import type { TripFormValues } from '@goease/trip-client/create-trip-controller';

export const FORM_TTL = 24 * 60 * 60 * 1000;
export const PREVIEW_TTL = 60 * 60 * 1000;
const prefix = 'goease.creation.v1.';
export interface CreationState {
  form: TripFormValues;
  pace: 'relaxed' | 'balanced' | 'active';
  interests: NonNullable<DiscoveryPreviewRequest['interests']>;
  preview: DiscoveryPreviewResponse | null;
  previewAt: number | null;
  reviewing: boolean;
}
type CacheStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export function clearCreation(storage: CacheStorage, owner: string | null) {
  if (!owner) return;
  try {
    storage.removeItem(prefix + owner);
  } catch {
    /* Browser storage may be unavailable. */
  }
}
export function saveCreation(
  storage: CacheStorage,
  owner: string,
  state: CreationState,
  now = Date.now(),
) {
  try {
    const encoded = JSON.stringify({ version: 1, owner, expiresAt: now + FORM_TTL, ...state });
    if (encoded.length > 2_000_000) return false;
    storage.setItem(prefix + owner, encoded);
    return true;
  } catch {
    return false;
  }
}
export function restoreCreation(
  storage: CacheStorage,
  owner: string,
  now = Date.now(),
): CreationState | null {
  try {
    const raw = storage.getItem(prefix + owner);
    if (!raw || raw.length > 2_000_000) return null;
    const value = JSON.parse(raw);
    if (
      value.version !== 1 ||
      value.owner !== owner ||
      !Number.isFinite(value.expiresAt) ||
      value.expiresAt <= now
    )
      return null;
    const form = value.form;
    if (
      !form ||
      !['name', 'startDate', 'durationDays', 'people', 'budgetVnd'].every(
        (key) => typeof form[key] === 'string' && form[key].length <= 200,
      )
    )
      return null;
    if (form.destinationId !== undefined && typeof form.destinationId !== 'string') return null;
    if (form.destination !== undefined && !destinationSchema.safeParse(form.destination).success)
      return null;
    if (!['relaxed', 'balanced', 'active'].includes(value.pace)) return null;
    const allowed = [
      'heritage',
      'religious',
      'nature',
      'garden',
      'market',
      'public-space',
      'food',
      'cafe',
    ];
    if (
      !Array.isArray(value.interests) ||
      value.interests.length > 6 ||
      !value.interests.every((item: unknown) => typeof item === 'string' && allowed.includes(item))
    )
      return null;
    const parsed = discoveryPreviewResponseSchema.safeParse(value.preview);
    const fresh =
      Number.isFinite(value.previewAt) &&
      value.previewAt <= now &&
      now - value.previewAt < PREVIEW_TTL;
    const preview = fresh && parsed.success ? parsed.data : null;
    return {
      form,
      pace: value.pace,
      interests: value.interests,
      preview,
      previewAt: preview ? value.previewAt : null,
      reviewing: !!preview && value.reviewing === true,
    };
  } catch {
    return null;
  }
}

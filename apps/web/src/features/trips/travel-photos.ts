import type { Activity } from '@goease/contracts';
import curated from './curated-photos.json';

export interface TravelPhoto {
  src: string;
  alt: string;
  sourceUrl: string;
  author: string;
  license?: string;
  licenseUrl?: string;
  illustrative: boolean;
}

function normalize(value: string) {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replaceAll('đ', 'd')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function destinationPhoto(destinationId?: string): TravelPhoto {
  const photo = curated.find((item) => item.id === destinationId) ?? curated[0];
  return { ...photo, illustrative: true };
}

export function activityPhotos(activity: Activity, destinationId: string): TravelPhoto[] {
  const name = normalize(activity.name);
  const exact = curated.find(
    (photo) =>
      photo.destinationId === destinationId &&
      photo.aliases.some((alias) => name === normalize(alias)),
  );
  const fallback = exact ? { ...exact, illustrative: false } : destinationPhoto(destinationId);
  const snapshot = activity.location.kind === 'discovered' ? activity.location.placeSnapshot : null;
  // Read-only selection: do not change saved snapshots or call discovery for imagery.
  if (snapshot?.thumbnailUrl?.startsWith('https://')) {
    return [
      {
        src: snapshot.thumbnailUrl,
        alt: activity.name,
        sourceUrl: snapshot.sourceUrl,
        author: 'Nguồn địa điểm',
        illustrative: false,
      },
      fallback,
    ];
  }
  return [fallback];
}

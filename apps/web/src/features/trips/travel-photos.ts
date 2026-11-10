import type { Activity } from '@goease/contracts';
import curated from './curated-photos.json' with { type: 'json' };

export interface TravelPhoto {
  src: string;
  alt: string;
  sourceUrl: string;
  author: string;
  license?: string;
  licenseUrl?: string;
}
export const neutralPhoto: TravelPhoto = {
  src: '/travel/placeholder.svg',
  alt: 'Chưa có ảnh cho điểm đến này',
  sourceUrl: '',
  author: 'GoEase',
};

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
  const photo = curated.find((item) => item.id === destinationId) ?? neutralPhoto;
  return photo;
}
export function placePhoto(name: string, destinationId: string): TravelPhoto | undefined {
  return curated.find(
    (photo) =>
      photo.destinationId === destinationId &&
      photo.aliases.some((alias) => normalize(alias) === normalize(name)),
  );
}

export function activityPhotos(activity: Activity, destinationId: string): TravelPhoto[] {
  const name = normalize(activity.name);
  const exact = curated.find(
    (photo) =>
      photo.destinationId === destinationId &&
      photo.aliases.some((alias) => name === normalize(alias)),
  );
  const fallbacks = [exact, destinationPhoto(destinationId), neutralPhoto]
    .filter((photo): photo is TravelPhoto => !!photo)
    .filter((photo, index, list) => list.findIndex((item) => item.src === photo.src) === index);
  const snapshot = activity.location.kind === 'discovered' ? activity.location.placeSnapshot : null;
  // Read-only selection: do not change saved snapshots or call discovery for imagery.
  if (snapshot?.thumbnailUrl?.startsWith('https://')) {
    return [
      {
        src: snapshot.thumbnailUrl,
        alt: activity.name,
        sourceUrl: snapshot.sourceUrl,
        author: 'Nguồn địa điểm',
      },
      ...fallbacks,
    ];
  }
  return fallbacks;
}

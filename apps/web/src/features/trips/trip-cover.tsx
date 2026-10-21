import type { Trip } from '@goease/contracts';
import { activityPhotos } from './travel-photos';
import { TravelPhotoView } from './travel-photo';

export function TripCover({ trip }: { trip: Trip }) {
  const candidates = trip.days
    .flatMap((day) => day.activities)
    .map((activity) => activityPhotos(activity, trip.destinationId));
  const photos =
    candidates.find((photos) => photos[0]?.src.startsWith('https://')) ??
    candidates.find((photos) => photos.length > 0) ??
    [];
  return <TravelPhotoView photos={photos} cover className="mx-auto w-full max-w-4xl" />;
}

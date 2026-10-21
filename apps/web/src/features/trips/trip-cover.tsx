import type { Trip } from '@goease/contracts';
import { activityPhotos, destinationPhoto } from './travel-photos';
import { TravelPhotoView } from './travel-photo';

export function TripCover({ destinationId, trip }: { destinationId?: string; trip?: Trip }) {
  const activity = trip?.days
    .flatMap((day) => day.activities)
    .find(
      (item) => item.location.kind === 'discovered' && item.location.placeSnapshot.thumbnailUrl,
    );
  const photos =
    activity && trip
      ? activityPhotos(activity, trip.destinationId)
      : [destinationPhoto(destinationId ?? trip?.destinationId)];
  return <TravelPhotoView photos={photos} cover className="mx-auto w-full max-w-4xl" />;
}

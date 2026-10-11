import type { SampleMapCatalog, TripActivity } from '@goease/contracts';

/** A historical inactive pin stays visible, but only the loaded active catalog can authorize a new route. */
export function routeablePlaces(catalog: SampleMapCatalog | undefined, activities?: TripActivity[]) {
  return (catalog?.places ?? []).filter(place => activities === undefined || activities.some(activity => activity.place?.active === true && activity.place.id.toLowerCase() === place.id.toLowerCase()));
}

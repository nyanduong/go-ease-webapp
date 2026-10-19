import { createTripStore } from '@goease/trip-storage';
import { useEffect, useSyncExternalStore } from 'react';
import { browserTrips } from '../../platform/browser-storage';
export const guestTrips = createTripStore(browserTrips);
export function useGuestTrips() {
  const state = useSyncExternalStore(guestTrips.subscribe, guestTrips.getSnapshot);
  useEffect(() => {
    if (guestTrips.getSnapshot().loadStatus === 'idle') void guestTrips.load();
  }, []);
  return state;
}

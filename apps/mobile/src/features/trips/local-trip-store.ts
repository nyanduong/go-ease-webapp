import AsyncStorage from '@react-native-async-storage/async-storage';
import { createLocalTripRepository, createTripStore } from '@goease/trip-storage';
import { useEffect, useSyncExternalStore } from 'react';

export const localTripRepository = createLocalTripRepository(AsyncStorage);
export const localTripStore = createTripStore(localTripRepository);

export function useLocalTrips() {
  const state = useSyncExternalStore(localTripStore.subscribe, localTripStore.getSnapshot, localTripStore.getSnapshot);
  useEffect(() => { if (localTripStore.getSnapshot().loadStatus === 'idle') void localTripStore.load(); }, []);
  return { state, actions: localTripStore };
}

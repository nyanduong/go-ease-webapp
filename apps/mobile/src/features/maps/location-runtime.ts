import * as Location from 'expo-location';
import type { LocationAdapter } from './location.ts';

export const foregroundLocation: LocationAdapter = {
  permission: () => Location.getForegroundPermissionsAsync(), request: () => Location.requestForegroundPermissionsAsync(),
  services: () => Location.hasServicesEnabledAsync(),
  watch: (success, failure) => Location.watchPositionAsync({ accuracy: Location.Accuracy.Balanced, mayShowUserSettingsDialog: false }, success, failure),
};

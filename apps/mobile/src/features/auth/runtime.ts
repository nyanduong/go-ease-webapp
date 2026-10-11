import * as SecureStore from 'expo-secure-store';
import { GoogleOneTapSignIn } from 'react-native-nitro-google-signin';
import type { SessionVault } from './store.ts';
import { createGoogleCredentialProvider, type GoogleConfig } from './google.ts';

const key = 'goease.session.v1';
const options: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
export const sessionVault: SessionVault = {
  get: () => SecureStore.getItemAsync(key, options),
  set: token => SecureStore.setItemAsync(key, token, options),
  delete: () => SecureStore.deleteItemAsync(key, options),
};
export function nativeGoogleProvider(config: GoogleConfig) { return createGoogleCredentialProvider(config, GoogleOneTapSignIn); }

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { randomUUID } from 'expo-crypto';
import { AppState, Platform } from 'react-native';
import { useEffect, useSyncExternalStore } from 'react';
import { createAuthPilot, type AuthPilotState } from './auth-pilot-controller';
import { createAccountTrips } from './account-trip-controller';

const project = process.env.EXPO_PUBLIC_SUPABASE_URL?.match(/^https:\/\/([a-z0-9]{20})\.supabase\.co$/)?.[1];
const storageKey = `goease.account.${project ?? 'unconfigured'}.refresh`;
const secureOptions = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
const native = () => { if (Platform.OS === 'web') throw Error('Native credential storage required'); };
let state: AuthPilotState = { busy: false, phase: 'signed-out', userId: null, message: 'Đăng nhập để xem chuyến trên server; chuyến khách giữ trên thiết bị.' };
const listeners = new Set<() => void>();
export const accountTrips = createAccountTrips({
  storage: { get: key => AsyncStorage.getItem(key), set: (key, value) => AsyncStorage.setItem(key, value) },
  request: operation => auth.serverTrips(operation), newId: randomUUID,
});
const auth = createAuthPilot({ url: process.env.EXPO_PUBLIC_SUPABASE_URL, key: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY, preserveRefreshOnTransient: true,
  storage: {
    async get() { native(); return SecureStore.getItemAsync(storageKey, secureOptions); },
    async set(value) { native(); await SecureStore.setItemAsync(storageKey, value, secureOptions); },
    async remove() { native(); await SecureStore.deleteItemAsync(storageKey, secureOptions); },
  },
  onChange(next) {
    state = next;
    if (!next.userId || next.phase !== 'backend-verified') accountTrips.lock();
    listeners.forEach(listener => listener());
  },
});
async function connect() {
  if (auth.snapshot().phase === 'provider-verified') await auth.verifyBackend(process.env.EXPO_PUBLIC_AUTH_API_BASE_URL);
  const next = auth.snapshot();
  if (project && next.userId && next.phase === 'backend-verified' && await accountTrips.activate(project + '.' + next.userId)) await accountTrips.list();
}
let restoring: Promise<void> | null = null;
export const accountSession = {
  snapshot: () => state,
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  async login(email: string, password: string) { await auth.login(email, password); await connect(); },
  restore() { if (restoring) return restoring; restoring = (async () => { await auth.restore(); await connect(); })().finally(() => { restoring = null; }); return restoring; },
  logout: () => auth.logout(),
  cancel: () => auth.cancel(),
};
export function useAccount() {
  const session = useSyncExternalStore(accountSession.subscribe, accountSession.snapshot, accountSession.snapshot);
  const trips = useSyncExternalStore(accountTrips.subscribe, accountTrips.getSnapshot, accountTrips.getSnapshot);
  return { session, trips };
}
export function AccountSessionLifecycle() {
  useEffect(() => {
    // Hide private RAM on background; draft/pending bytes remain owner-bound for re-authentication.
    const subscription = AppState.addEventListener('change', next => { if (next !== 'active') auth.cancel(); });
    const timer = setInterval(() => { auth.snapshot(); }, 1000);
    return () => { subscription.remove(); clearInterval(timer); auth.cancel(); };
  }, []);
  return null;
}

import { createContext, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { AppState, Platform } from 'react-native';
import { apiBaseUrl } from '../../lib/config';
import { createNativeAuthClient } from './client';
import { googleConfig } from './google';
import { nativeGoogleProvider, sessionVault } from './runtime';
import { createNativeAuthStore } from './store';

const AuthContext = createContext<ReturnType<typeof createNativeAuthStore> | null>(null);
export function NativeAuthProvider({ children }: { children: ReactNode }) {
  const store = useMemo(() => {
    try {
      const config = googleConfig(process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID, process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID, Platform.OS);
      const url = apiBaseUrl(process.env.EXPO_PUBLIC_API_BASE_URL, __DEV__ ? 'development' : 'preview');
      return createNativeAuthStore(createNativeAuthClient(url), nativeGoogleProvider(config), sessionVault);
    } catch {
      return createNativeAuthStore(createNativeAuthClient(''), { credential: async () => { throw new Error(); }, signOut: async () => {} }, sessionVault, true);
    }
  }, []);
  useEffect(() => {
    void store.restore();
    const subscription = AppState.addEventListener('change', value => { if (value === 'active') void store.restore(); });
    return () => { subscription.remove(); store.dispose(); };
  }, [store]);
  return <AuthContext.Provider value={store}>{children}</AuthContext.Provider>;
}
export function useNativeAuth() {
  const store = useContext(AuthContext);
  if (!store) throw new Error('NativeAuthProvider is required.');
  const state = useSyncExternalStore(store.subscribe, store.snapshot);
  return { store, state };
}

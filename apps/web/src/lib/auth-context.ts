import { createContext, useContext, useSyncExternalStore } from 'react';
import type { createWebAuthStore } from './auth-store';

export type WebAuthStore = ReturnType<typeof createWebAuthStore>;
// Tests can provide a store through React context; production has no identity/config bypass.
export const WebAuthContext = createContext<WebAuthStore | null>(null);
export function useWebAuth() {
  const store = useContext(WebAuthContext);
  if (!store) throw new Error('WebAuthProvider is required.');
  const state = useSyncExternalStore(store.subscribe, store.snapshot);
  return { store, state };
}

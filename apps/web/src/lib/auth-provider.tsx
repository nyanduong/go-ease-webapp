import { useEffect, useMemo, type ReactNode } from 'react';
import { WebAuthContext } from './auth-context';
import { createWebAuthClient, webAuthConfig } from './auth-client';
import { createWebGoogleProvider } from './auth-google';
import { createWebAuthStore } from './auth-store';
import { API_BASE_URL } from './health';

export function WebAuthProvider({ children }: { children: ReactNode }) {
  const store = useMemo(() => {
    try {
      const config = webAuthConfig(import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID, API_BASE_URL, window.location.origin);
      return createWebAuthStore(createWebAuthClient(config.apiBase), createWebGoogleProvider(config.clientId));
    } catch { return createWebAuthStore(createWebAuthClient(''), createWebGoogleProvider(''), true); }
  }, []);
  useEffect(() => {
    void store.restore();
    const refresh = () => { if (document.visibilityState === 'visible') void store.restore(); };
    document.addEventListener('visibilitychange', refresh);
    return () => { document.removeEventListener('visibilitychange', refresh); store.dispose(); };
  }, [store]);
  return <WebAuthContext.Provider value={store}>{children}</WebAuthContext.Provider>;
}

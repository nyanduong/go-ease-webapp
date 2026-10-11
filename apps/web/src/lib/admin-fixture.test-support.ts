import type { AdminPlacesResponse, AuthUser, CurrentSessionResponse } from '@goease/contracts';
import { createWebAuthStore } from './auth-store';
import type { createWebAuthClient } from './auth-client';

// TEST ONLY fixtures; production never imports this module or invents a session.
export const adminUser: AuthUser = { id: '00000000-0000-4000-8000-000000000001', displayName: 'TEST ONLY employee', role: 'ADMIN' };
export const catalog: AdminPlacesResponse = { destinationCode: 'VN-HANOI-SAMPLE', isSample: true, places: [{
  id: '00000000-0000-4000-8000-000000000002', code: 'sample-wikidata-Q1202019', name: 'TEST ONLY Văn Miếu',
  latitude: 21.028611, longitude: 105.835556, sourceUrl: 'https://www.wikidata.org/w/index.php?title=Q1202019&oldid=2549929856',
  attribution: 'TEST ONLY Wikidata contributors · CC0-1.0', isActive: true, isSample: true,
}] };
export function authFixture(initial: AuthUser = adminUser) {
  let user = initial;
  const client: ReturnType<typeof createWebAuthClient> = {
    current: async (): Promise<Extract<CurrentSessionResponse, { transport: 'web' }>> => ({
      transport: 'web', user, expiresAt: new Date(Date.now() + 600_000).toISOString(), csrfToken: 'A'.repeat(43),
    }),
    challenge: async () => { throw new Error('TEST ONLY unused Google challenge'); },
    exchange: async () => { throw new Error('TEST ONLY unused Google exchange'); },
    logout: async () => {},
  };
  const store = createWebAuthStore(client, { render: async () => {}, cancel() {}, signOut() {} });
  return { store, client, setUser(value: AuthUser) { user = value; } };
}
export function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
export async function settle() { for (let index = 0; index < 8; index++) await Promise.resolve(); }

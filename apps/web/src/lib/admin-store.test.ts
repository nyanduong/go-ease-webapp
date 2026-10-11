import { describe, expect, it, vi } from 'vitest';
import type { AdminPlacesResponse } from '@goease/contracts';
import { createAdminCatalogStore } from './admin-store';
import { AdminFailure } from './admin-client';
import { adminUser, authFixture, catalog, deferred, settle } from './admin-fixture.test-support';

describe('admin catalog store (server/session client doubles)', () => {
  it('does not call catalog for restoring/customer/signedOut; verified admin gets actual client output', async () => {
    const auth = authFixture({ ...adminUser, role: 'CUSTOMER' }), api = { catalog: vi.fn(async () => catalog) };
    const store = createAdminCatalogStore(api, auth.store), close = store.connect();
    try {
      await store.load(); await auth.store.restore(); await store.load(); expect(api.catalog).not.toHaveBeenCalled();
      auth.setUser(adminUser); await auth.store.restore(); await settle(); expect(store.snapshot().catalog).toEqual(catalog);
      await auth.store.logout(); expect(store.snapshot().catalog).toBeUndefined(); expect(store.snapshot().kind).toBe('locked');
    } finally { close(); auth.store.dispose(); }
  });
  it('logout aborts and a late response cannot republish catalog', async () => {
    const auth = authFixture(), pending = deferred<AdminPlacesResponse>(); let signal!: AbortSignal;
    await auth.store.restore();
    const store = createAdminCatalogStore({ catalog: async value => { signal = value; return pending.promise; } }, auth.store), close = store.connect();
    try {
      expect(store.snapshot().kind).toBe('loading'); await auth.store.logout(); expect(signal.aborted).toBe(true);
      pending.resolve(catalog); await settle(); expect(store.snapshot().catalog).toBeUndefined(); expect(store.snapshot().kind).toBe('locked');
    } finally { close(); auth.store.dispose(); }
  });
  it('account switch and current-role demotion discard prior results even when clients ignore abort', async () => {
    const auth = authFixture(), first = deferred<AdminPlacesResponse>(); let calls = 0;
    await auth.store.restore();
    const other = { ...catalog, places: [{ ...catalog.places[0]!, name: 'TEST ONLY account B catalog' }] };
    const store = createAdminCatalogStore({ catalog: async () => ++calls === 1 ? first.promise : other }, auth.store), close = store.connect();
    try {
      auth.setUser({ ...adminUser, id: '00000000-0000-4000-8000-000000000009' }); await auth.store.restore(); await settle();
      expect(store.snapshot().catalog).toEqual(other); first.resolve(catalog); await settle(); expect(store.snapshot().catalog).toEqual(other);
      auth.setUser({ ...adminUser, role: 'CUSTOMER' }); await auth.store.restore(); expect(store.snapshot().catalog).toBeUndefined();
    } finally { close(); auth.store.dispose(); }
  });
  it.each(['expired', 'forbidden'] as const)('HTTP %s clears data and checks auth once, then waits for explicit retry', async code => {
    const auth = authFixture(); await auth.store.restore();
    const current = vi.spyOn(auth.client, 'current'), api = { catalog: vi.fn().mockRejectedValueOnce(new AdminFailure(code)).mockResolvedValue(catalog) };
    const store = createAdminCatalogStore(api, auth.store), close = store.connect();
    try {
      await settle(); expect(current).toHaveBeenCalledTimes(1); expect(api.catalog).toHaveBeenCalledTimes(1);
      expect(store.snapshot().catalog).toBeUndefined(); expect(store.snapshot().kind).toBe('error');
      await store.load(); expect(api.catalog).toHaveBeenCalledTimes(2); expect(store.snapshot().catalog).toEqual(catalog);
    } finally { close(); auth.store.dispose(); }
  });
  it('explicit refresh replaces data, stale refresh cannot overwrite it, and disconnect aborts', async () => {
    const auth = authFixture(); await auth.store.restore();
    const first = deferred<AdminPlacesResponse>(), second = deferred<AdminPlacesResponse>(), signals: AbortSignal[] = []; let count = 0;
    const store = createAdminCatalogStore({ catalog: async signal => { signals.push(signal); return ++count === 1 ? first.promise : second.promise; } }, auth.store), close = store.connect();
    try {
      const retry = store.load(); expect(signals[0]!.aborted).toBe(true); second.resolve({ ...catalog, places: [] }); await retry;
      first.resolve(catalog); await settle(); expect(store.snapshot().catalog?.places).toEqual([]);
    } finally { close(); auth.store.dispose(); }
    expect(signals[1]!.aborted).toBe(true); expect(store.snapshot().catalog).toBeUndefined();
  });
});

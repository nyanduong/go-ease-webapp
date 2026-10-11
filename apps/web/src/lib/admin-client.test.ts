import { describe, expect, it, vi } from 'vitest';
import { isAdminPlacesResponse } from '@goease/contracts';
import { createAdminClient } from './admin-client';
import { catalog } from './admin-fixture.test-support';

const signal = () => new AbortController().signal;
describe('admin catalog client (fetch doubles, never live OAuth)', () => {
  it('uses only cookie GET, no role/owner/bearer or persistent storage', async () => {
    const storage = vi.spyOn(Storage.prototype, 'setItem'), fetcher = vi.fn(async () => Response.json(catalog));
    try {
      expect(await createAdminClient('https://admin.test/api', fetcher).catalog(signal())).toEqual(catalog);
      expect(fetcher).toHaveBeenCalledWith('https://admin.test/api/admin/places', expect.objectContaining({ method: 'GET', credentials: 'include', cache: 'no-store', redirect: 'error', headers: { Accept: 'application/json' } }));
      expect(storage).not.toHaveBeenCalled();
    } finally { storage.mockRestore(); }
  });
  it('refuses privacy fields, duplicate/sparse entries, unsafe Unicode and wrong sample/provenance', async () => {
    const place = catalog.places[0]!;
    const invalid = [{ ...catalog, trips: [{ title: 'PRIVATE_TEST_ONLY' }] }, { ...catalog, places: [{ ...place, ownerId: place.id }] },
      { ...catalog, places: [{ ...place, sessionToken: 'PRIVATE_TEST_ONLY' }] }, { ...catalog, isSample: false },
      { ...catalog, places: [place, { ...place, id: place.id.toUpperCase() }] }, { ...catalog, places: [place, { ...place, id: '00000000-0000-4000-8000-000000000003' }] },
      { ...catalog, places: Array(1) }, { ...catalog, places: [{ ...place, name: '\ud800' }] },
      { ...catalog, places: [{ ...place, attribution: 'unsafe\ncontrol' }] }, { ...catalog, places: [{ ...place, latitude: 91 }] },
      { ...catalog, places: [{ ...place, sourceUrl: 'https://www.wikidata.org.evil.test/?title=Q1&oldid=2' }] }];
    for (const value of invalid) {
      expect(isAdminPlacesResponse(value)).toBe(false);
      await expect(createAdminClient('https://admin.test/api', async () => Response.json(value)).catalog(signal())).rejects.toMatchObject({ code: 'contract' });
    }
    expect(isAdminPlacesResponse({ ...catalog, places: [] })).toBe(true);
    expect(isAdminPlacesResponse({ ...catalog, places: [{ ...place, name: 'Địa điểm 🌿', isActive: false }] })).toBe(true);
  });
  it.each([[401, 'expired'], [403, 'forbidden'], [429, 'unavailable'], [503, 'unavailable']])('sanitizes HTTP %s without parsing private diagnostics', async (status, code) => {
    const api = createAdminClient('https://admin.test/api', async () => new Response('PRIVATE_TEST_ONLY', { status: status as number }));
    try { await api.catalog(signal()); throw new Error('Expected refusal'); } catch (error) { expect(error).toMatchObject({ code }); expect(String(error)).not.toContain('PRIVATE_TEST_ONLY'); }
  });
  it('rejects declared/streamed UTF8 over 1MiB, invalid JSON/content type and malformed UTF8', async () => {
    for (const response of [new Response('{}', { headers: { 'Content-Type': 'text/html' } }), new Response('{', { headers: { 'Content-Type': 'application/json' } }),
      new Response('{}', { headers: { 'Content-Type': 'application/json', 'Content-Length': '1048577' } }),
      new Response('界'.repeat(350_000), { headers: { 'Content-Type': 'application/json' } }),
      new Response(new Uint8Array([0xc3, 0x28]), { headers: { 'Content-Type': 'application/json' } })]) {
      await expect(createAdminClient('https://admin.test/api', async () => response).catalog(signal())).rejects.toMatchObject({ code: 'contract' });
    }
  });
  it('bounds a stalled fetch and stalled body, and cancellation wins over a late fetch', async () => {
    await expect(createAdminClient('https://admin.test/api', () => new Promise<Response>(() => {}), 15).catalog(signal())).rejects.toMatchObject({ code: 'timeout' });
    const stream = new ReadableStream<Uint8Array>({ start() {} });
    await expect(createAdminClient('https://admin.test/api', async () => new Response(stream, { headers: { 'Content-Type': 'application/json' } }), 15).catalog(signal())).rejects.toMatchObject({ code: 'timeout' });
    const controller = new AbortController();
    const request = createAdminClient('https://admin.test/api', () => new Promise<Response>(() => {})).catalog(controller.signal);
    controller.abort(); await expect(request).rejects.toMatchObject({ code: 'cancelled' });
  });
  it.each([{ 'Content-Type': 'text/html' }, { 'Content-Type': 'application/json', 'Content-Length': '1048577' }])('cancels an unread body rejected by headers', async headers => {
    const cancel = vi.fn(), body = new ReadableStream<Uint8Array>({ cancel });
    await expect(createAdminClient('https://admin.test/api', async () => new Response(body, { headers })).catalog(signal())).rejects.toMatchObject({ code: 'contract' });
    expect(cancel).toHaveBeenCalledTimes(1);
  });
  it('rejects valid JSON arriving after a synchronous event-loop stall even before timer callbacks can run', async () => {
    const fetcher = async () => {
      const started = performance.now();
      while (performance.now() - started < 25) { /* TEST ONLY event-loop stall, no external I/O. */ }
      return Response.json(catalog);
    };
    await expect(createAdminClient('https://admin.test/api', fetcher, 10).catalog(signal())).rejects.toMatchObject({ code: 'timeout' });
  });
  it('bad configuration calls no fetch; raw network details never escape', async () => {
    const fetcher = vi.fn(async () => { throw new Error('PRIVATE_TEST_ONLY'); });
    await expect(createAdminClient('https://user:private@admin.test/api', fetcher).catalog(signal())).rejects.toMatchObject({ code: 'configuration' });
    expect(fetcher).not.toHaveBeenCalled();
    await expect(createAdminClient('https://admin.test/api', fetcher).catalog(signal())).rejects.toMatchObject({ code: 'network' });
  });
});

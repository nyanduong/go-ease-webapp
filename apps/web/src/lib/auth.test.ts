import { describe, expect, it, vi } from 'vitest';
import type { AuthChallengeResponse, AuthUser, WebSessionResponse } from '@goease/contracts';
import { createWebAuthClient, WebAuthFailure, webAuthConfig } from './auth-client';
import { createWebGoogleProvider, loadGoogleIdentityServices, type GoogleIdentityServices } from './auth-google';
import { createWebAuthStore } from './auth-store';

// Doubles only. These fixtures never authenticate against Google or a running API.
const opaque = 'A'.repeat(43), nonce = 'B'.repeat(43), proof = 'C'.repeat(43), jwt = 'TEST_ONLY.ID_TOKEN.SIGNATURE';
const future = () => new Date(Date.now() + 60_000).toISOString();
const user: AuthUser = { id: '00000000-0000-4000-8000-000000000001', displayName: 'TEST_ONLY', role: 'CUSTOMER' };
const challenge = (): AuthChallengeResponse => ({ challengeId: user.id, transport: 'web', nonce, proof, expiresAt: future() });
const session = (): WebSessionResponse => ({ transport: 'web', user, expiresAt: future(), csrfToken: opaque });
const signal = () => new AbortController().signal;
function client(overrides: Partial<ReturnType<typeof createWebAuthClient>> = {}) {
  return { challenge: async () => challenge(), exchange: async () => session(), current: async () => session(), logout: async () => {}, ...overrides };
}
function google(): ReturnType<typeof createWebGoogleProvider> { return { render: vi.fn(async () => {}), cancel: vi.fn(), signOut: vi.fn() }; }
async function settle() { for (let index = 0; index < 5; index++) await Promise.resolve(); }

describe('web auth client and store (transport/GIS doubles)', () => {
  it('requires real-format public client ID and HTTPS API/page; does not invent credentials', () => {
    expect(() => webAuthConfig(undefined, 'https://api.test/api', 'https://admin.test')).toThrow(WebAuthFailure);
    expect(() => webAuthConfig('autoDetect', 'https://api.test/api', 'https://admin.test')).toThrow(WebAuthFailure);
    expect(() => webAuthConfig('123-test.apps.googleusercontent.com', 'http://api.test/api', 'https://admin.test')).toThrow(WebAuthFailure);
    expect(() => webAuthConfig('123-test.apps.googleusercontent.com', 'https://user:secret@api.test/api', 'https://admin.test')).toThrow(WebAuthFailure);
    expect(() => webAuthConfig('123-test.apps.googleusercontent.com', 'https://api.test/api', 'https://admin.test')).toThrow(WebAuthFailure);
    expect(webAuthConfig('123-test.apps.googleusercontent.com', 'https://admin.test/api/', 'https://admin.test').apiBase).toBe('https://admin.test/api');
  });

  it('sends cookie credentials/proof/CSRF, no bearer or role/identity fields', async () => {
    const requests: RequestInit[] = [];
    const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      requests.push(init!); const path = String(url);
      return path.endsWith('challenges/web') ? Response.json(challenge()) : path.endsWith('/logout') ? new Response(null, { status: 204 }) : Response.json(session());
    });
    const api = createWebAuthClient('https://api.test/api', fetcher);
    const issued = await api.challenge(signal()); await api.exchange(issued, jwt, signal()); await api.current(signal()); await api.logout(signal(), opaque);
    expect(requests).toHaveLength(4);
    for (const request of requests) { expect(request.credentials).toBe('include'); expect(request.redirect).toBe('error'); expect(request.cache).toBe('no-store'); expect(request.headers).not.toHaveProperty('Authorization'); }
    expect(JSON.parse(requests[1]!.body as string)).toEqual({ challengeId: user.id, idToken: jwt });
    expect(requests[1]!.headers).toHaveProperty('X-GoEase-Auth-Proof', proof);
    expect(requests[3]!.headers).toHaveProperty('X-CSRF-Token', opaque);
  });

  it('rejects wrong transport, invalid JSON/extra token fields and oversized response without private error text', async () => {
    for (const response of [Response.json({ ...session(), transport: 'native' }), Response.json({ ...session(), accessToken: opaque }), new Response('invalid'), new Response('x'.repeat(65_537)), new Response('ă'.repeat(32_769))]) {
      await expect(createWebAuthClient('https://api.test', vi.fn(async () => response)).current(signal())).rejects.toMatchObject({ code: 'contract' });
    }
    await expect(createWebAuthClient('https://api.test', vi.fn(async () => { throw new Error('PRIVATE_TOKEN'); })).current(signal())).rejects.not.toThrow('PRIVATE_TOKEN');
  });

  it('bounds fetch and body reads; cancelled requests make no extra call or automatic retry', async () => {
    const hanging = vi.fn(() => new Promise<Response>(() => {}));
    await expect(createWebAuthClient('https://api.test', hanging, 15).current(signal())).rejects.toMatchObject({ code: 'timeout' });
    expect(hanging).toHaveBeenCalledTimes(1);
    const response = Response.json(session()); response.text = () => new Promise(() => {});
    await expect(createWebAuthClient('https://api.test', vi.fn(async () => response), 15).current(signal())).rejects.toMatchObject({ code: 'timeout' });
    const cancelled = new AbortController(); cancelled.abort();
    await expect(createWebAuthClient('https://api.test', hanging).current(cancelled.signal)).rejects.toMatchObject({ code: 'cancelled' });
    expect(hanging).toHaveBeenCalledTimes(1);
  });

  it('uses GIS initialize/renderButton with raw per-challenge nonce, official branding and no automatic prompt', async () => {
    const sdk: GoogleIdentityServices = { initialize: vi.fn(), renderButton: vi.fn(), cancel: vi.fn(), disableAutoSelect: vi.fn() };
    const provider = createWebGoogleProvider('123-test.apps.googleusercontent.com', async () => sdk), receive = vi.fn();
    const element = document.createElement('div');
    await provider.render(challenge(), element, signal(), receive);
    expect(sdk.initialize).toHaveBeenCalledWith(expect.objectContaining({ client_id: '123-test.apps.googleusercontent.com', nonce, auto_select: false, ux_mode: 'popup' }));
    expect(sdk.renderButton).toHaveBeenCalledWith(element, { type: 'standard', theme: 'outline', size: 'large', text: 'signin_with' });
    const configuration = vi.mocked(sdk.initialize).mock.calls[0]![0]; configuration.callback({ credential: jwt }); expect(receive).toHaveBeenCalledWith(jwt);
    await provider.render({ ...challenge(), nonce: proof }, element, signal(), receive);
    expect(vi.mocked(sdk.initialize).mock.calls[1]![0].nonce).toBe(proof);
  });

  it('loads only the official GIS script and abort removes it without accepting a late credential', async () => {
    const controller = new AbortController(), pending = loadGoogleIdentityServices(controller.signal);
    const script = document.head.querySelector('script[src="https://accounts.google.com/gsi/client"]'); expect(script).not.toBeNull();
    controller.abort(); await expect(pending).rejects.toMatchObject({ code: 'cancelled' }); expect(script?.isConnected).toBe(false);
  });

  it('restores fresh server role and CSRF, never writes browser persistent storage', async () => {
    const storage = vi.spyOn(Storage.prototype, 'setItem'), sdk = google();
    const api = client({ current: async () => ({ ...session(), user: { ...user, role: 'ADMIN' } }) });
    const store = createWebAuthStore(api, sdk);
    try { await store.restore(); expect(store.snapshot().user?.role).toBe('ADMIN'); expect(JSON.stringify(store.snapshot())).not.toContain(opaque); expect(storage).not.toHaveBeenCalled(); }
    finally { store.dispose(); storage.mockRestore(); }
  });

  it('expired cookie must be cleared by acknowledged Origin-bound POST before a new challenge', async () => {
    const calls: string[] = [], sdk = google();
    const store = createWebAuthStore(client({ current: async () => { calls.push('me'); throw new WebAuthFailure('expired'); }, logout: async () => { calls.push('logout'); }, challenge: async () => { calls.push('challenge'); return challenge(); } }), sdk);
    try { await store.restore(); expect(store.snapshot().kind).toBe('signedOut'); await store.prepare(document.createElement('div')); expect(calls).toEqual(['me', 'logout', 'challenge']); }
    finally { store.dispose(); }
  });

  it('failed expired-cookie cleanup blocks login until explicit successful restore', async () => {
    let offline = true; const sdk = google(), challengeCall = vi.fn(async () => challenge());
    const store = createWebAuthStore(client({ current: async () => { throw new WebAuthFailure('expired'); }, logout: async () => { if (offline) throw new WebAuthFailure('network'); }, challenge: challengeCall }), sdk);
    try { await store.restore(); expect(store.snapshot().kind).toBe('error'); await store.prepare(document.createElement('div')); expect(challengeCall).not.toHaveBeenCalled(); offline = false; await store.restore(); expect(store.snapshot().kind).toBe('signedOut'); }
    finally { store.dispose(); }
  });

  it('one callback exchanges once; cancelled late callback cannot authenticate or issue another request', async () => {
    let receive!: (credential: string) => void;
    const sdk = google(); sdk.render = vi.fn<ReturnType<typeof createWebGoogleProvider>['render']>(async (_challenge, _element, _signal, callback) => { receive = callback; });
    const exchange = vi.fn(async () => session());
    const store = createWebAuthStore(client({ current: async () => { throw new WebAuthFailure('expired'); }, exchange }), sdk);
    try {
      await store.restore(); await store.prepare(document.createElement('div')); store.cancel(); receive(jwt); await settle(); expect(exchange).not.toHaveBeenCalled();
      await store.prepare(document.createElement('div')); receive(jwt); receive(jwt); await settle(); expect(exchange).toHaveBeenCalledTimes(1); expect(store.snapshot().kind).toBe('signedIn');
    } finally { store.dispose(); }
  });

  it('offline logout retains the server session and CSRF for explicit retry, never reports revocation', async () => {
    let offline = true; const logout = vi.fn(async () => { if (offline) throw new WebAuthFailure('network'); });
    const store = createWebAuthStore(client({ logout }), google());
    try { await store.restore(); await store.logout(); expect(store.snapshot().kind).toBe('signedIn'); expect(store.snapshot().message).toContain('Chưa thu hồi'); offline = false; await store.logout(); expect(store.snapshot().kind).toBe('signedOut'); expect(logout).toHaveBeenLastCalledWith(expect.any(AbortSignal), opaque); }
    finally { store.dispose(); }
  });

  it('offline logout re-arms absolute expiry; an old ADMIN role cannot stay authenticated past that deadline', async () => {
    vi.useFakeTimers();
    const current = vi.fn().mockResolvedValueOnce({ ...session(), user: { ...user, role: 'ADMIN' }, expiresAt: new Date(Date.now() + 50).toISOString() }).mockRejectedValue(new WebAuthFailure('network'));
    const store = createWebAuthStore(client({ current, logout: async () => { throw new WebAuthFailure('network'); } }), google());
    try {
      await store.restore(); await store.logout(); expect(store.snapshot().kind).toBe('signedIn');
      await vi.advanceTimersByTimeAsync(75);
      expect(current).toHaveBeenCalledTimes(2); expect(store.snapshot().kind).toBe('error'); expect(store.snapshot().user).toBeUndefined();
    } finally { store.dispose(); vi.useRealTimers(); }
  });

  it('local GIS cleanup failure cannot turn an acknowledged server logout into a revocation failure', async () => {
    const sdk = google(); sdk.signOut = () => { throw new Error('PRIVATE_PROVIDER_DIAGNOSTIC'); };
    const store = createWebAuthStore(client(), sdk);
    try { await store.restore(); await store.logout(); expect(store.snapshot().kind).toBe('signedOut'); expect(store.snapshot().message).toContain('Máy chủ đã xác nhận'); }
    finally { store.dispose(); }
  });

  it('lost exchange response requires server restore before fresh login; blocked config calls no dependency', async () => {
    let receive!: (credential: string) => void;
    const sdk = google(); sdk.render = vi.fn<ReturnType<typeof createWebGoogleProvider>['render']>(async (_challenge, _element, _signal, callback) => { receive = callback; });
    const exchange = vi.fn(async () => { throw new WebAuthFailure('network'); });
    const store = createWebAuthStore(client({ current: async () => { throw new WebAuthFailure('expired'); }, exchange }), sdk);
    try { await store.restore(); await store.prepare(document.createElement('div')); receive(jwt); await settle(); expect(store.snapshot().kind).toBe('error'); await store.prepare(document.createElement('div')); expect(exchange).toHaveBeenCalledTimes(1); }
    finally { store.dispose(); }
    const blockedClient = client({ current: vi.fn(), challenge: vi.fn() }), blocked = createWebAuthStore(blockedClient, google(), true);
    await blocked.restore(); await blocked.prepare(document.createElement('div')); expect(blockedClient.current).not.toHaveBeenCalled(); expect(blockedClient.challenge).not.toHaveBeenCalled(); expect(blocked.snapshot().kind).toBe('blocked'); blocked.dispose();
  });
});

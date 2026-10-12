import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import type { Server } from 'node:http';
import { once } from 'node:events';
import { test } from 'node:test';
import express, { json } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { boundNativeTrialServer, nativeTrialIngress, NATIVE_TRIAL_LIMITS } from '../src/native-trial.js';

async function fixture(limits = { active: 8, requestsPerMinute: 120, durationMs: 20_000 }) {
  const app = express();
  app.set('trust proxy', false);
  app.use(nativeTrialIngress(limits));
  app.use('/api/trips', json({ limit: NATIVE_TRIAL_LIMITS.tripBodyBytes, inflate: false }));
  app.use(json({ limit: NATIVE_TRIAL_LIMITS.authBodyBytes, inflate: false }));
  let calls = 0;
  let hold: ((response: Response) => void) | undefined;
  app.all(/.*/, (request, response) => {
    calls++;
    if (hold) { hold(response); return; }
    response.json({ ip: request.ip, forwarded: request.headers['x-forwarded-for'] ?? null, proof: request.headers['x-goease-auth-proof'], key: request.headers['idempotency-key'] });
  });
  app.use((_error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    if (!response.headersSent && !response.destroyed) response.status(413).json({ error: 'bounded parser rejection' });
  });
  const server: Server = app.listen(0, '127.0.0.1'); boundNativeTrialServer(server);
  await once(server, 'listening');
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const url = `http://127.0.0.1:${address.port}`;
  return { url, server, calls: () => calls, setHold: (callback?: (response: Response) => void) => { hold = callback; },
    close: async () => { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); } };
}
async function declared(url: string, headers: Record<string, string>) {
  return new Promise<number>((resolve, reject) => {
    const request = httpRequest(`${url}/api/auth/google/native`, { method: 'POST', headers }, response => {
      response.resume(); response.once('end', () => resolve(response.statusCode!));
    });
    request.once('error', reject); request.end();
  });
}

test('trial ingress allows native paths only, rejects browser/paid/unknown before handlers, strips spoofing and preserves auth proof', async () => {
  const f = await fixture();
  try {
    for (const [method, route] of [['GET', '/api/admin/access'], ['POST', '/api/auth/google/web'], ['POST', '/api/maps/sample-route'],
      ['GET', '/.env'], ['GET', '/api/trips/%2e%2e/admin'], ['OPTIONS', '/api/trips']] as const) {
      const result = await fetch(f.url + route, { method }); assert.equal(result.status, 403); await result.text();
    }
    assert.equal(f.calls(), 0);
    for (const headers of [{ Origin: 'https://trial.test.example' }, { Cookie: 'private=TEST_ONLY' }]) {
      assert.equal((await fetch(f.url + '/api/health', { headers })).status, 403);
    }
    const result = await fetch(f.url + '/api/health', { headers: { 'X-Forwarded-For': '203.0.113.2',
      'X-GoEase-Auth-Proof': 'TEST_ONLY_PROOF', 'Idempotency-Key': 'TEST_ONLY_KEY' } });
    assert.deepEqual(await result.json(), { ip: '127.0.0.1', forwarded: null, proof: 'TEST_ONLY_PROOF', key: 'TEST_ONLY_KEY' });
    assert.equal(result.headers.get('cache-control'), 'no-store');
    assert.equal(f.server.requestTimeout, 20_000); assert.equal(f.server.maxConnections, 16);
  } finally { await f.close(); }
});

test('trial ingress rejects declared, streamed, compressed, wrong-content and excessive-header bodies without invoking handlers', async () => {
  const f = await fixture();
  try {
    assert.equal(await declared(f.url, { 'Content-Type': 'application/json', 'Content-Length': '24577' }), 413);
    for (const headers of [{ 'Content-Type': 'text/plain' }, { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' }]) {
      assert.equal((await fetch(f.url + '/api/auth/google/native', { method: 'POST', headers, body: '{}' })).status, 415);
    }
    assert.equal((await fetch(f.url + '/api/health', { headers: { 'X-Extra': 'x'.repeat(8500) } })).status, 431);
    for (const forbidden of ['Origin', 'Cookie']) {
      // Raw array guarantees forbidden fields are beyond Node's parsed-header
      // cutoff; Fetch's Headers normalization is free to reorder names.
      const headers = ['Host', new URL(f.url).host, ...Array.from({ length: 65 }, (_, index) => [`X-Header-${index}`, 'x']).flat(), forbidden, 'TEST_ONLY'];
      const status = await new Promise<number>((resolve, reject) => {
        const request = httpRequest(f.url + '/api/health', { headers }, response => {
          response.resume(); response.once('end', () => resolve(response.statusCode!));
        });
        request.once('error', reject); request.end();
      });
      assert.equal(status, 431);
    }
    const streamed = await new Promise<number>((resolve, reject) => {
      const request = httpRequest(f.url + '/api/trips', { method: 'POST', headers: { 'Content-Type': 'application/json' } }, response => {
        response.resume(); response.once('end', () => resolve(response.statusCode!));
      });
      request.once('error', reject);
      request.write('{"text":"'); request.write('x'.repeat(NATIVE_TRIAL_LIMITS.tripBodyBytes)); request.end('"}');
    });
    assert.equal(streamed, 413); assert.equal(f.calls(), 0);
  } finally { await f.close(); }
});

test('trial concurrency slots release after completion, abort and bounded timeout; total request quota is independent', async () => {
  const f = await fixture({ active: 1, requestsPerMinute: 120, durationMs: 150 });
  try {
    let accepted!: () => void;
    let held!: Response;
    let ready = new Promise<void>(resolve => { accepted = resolve; });
    f.setHold(response => { held = response; accepted(); });
    const first = fetch(f.url + '/api/health'); await ready;
    assert.equal((await fetch(f.url + '/api/health')).status, 429);
    held.end(); await (await first).text(); f.setHold();
    assert.equal((await fetch(f.url + '/api/health')).status, 200);
    ready = new Promise<void>(resolve => { accepted = resolve; });
    f.setHold(() => accepted());
    const abort = new AbortController(); const aborted = fetch(f.url + '/api/health', { signal: abort.signal });
    await ready; abort.abort(); await assert.rejects(aborted);
    // Observe socket close, not an arbitrary delay, before checking capacity.
    await new Promise<void>(resolve => setImmediate(resolve));
    f.setHold();
    let afterAbort = await fetch(f.url + '/api/health');
    if (afterAbort.status === 429) { await afterAbort.text(); await new Promise<void>(resolve => setTimeout(resolve, 20)); afterAbort = await fetch(f.url + '/api/health'); }
    assert.equal(afterAbort.status, 200); await afterAbort.text();
    f.setHold(() => undefined);
    const timeout = await fetch(f.url + '/api/health'); assert.equal(timeout.status, 408); await timeout.text();
    f.setHold(); assert.equal((await fetch(f.url + '/api/health')).status, 200);
  } finally { await f.close(); }
  const rate = await fixture({ active: 8, requestsPerMinute: 1, durationMs: 1000 });
  try { assert.equal((await fetch(rate.url + '/api/health')).status, 200); assert.equal((await fetch(rate.url + '/api/health')).status, 429); }
  finally { await rate.close(); }
});

test('slow incomplete JSON times out before parser/handler and a subsequent request succeeds', async () => {
  const f = await fixture({ active: 1, requestsPerMinute: 120, durationMs: 60 });
  try {
    const status = await new Promise<number>((resolve, reject) => {
      const request = httpRequest(f.url + '/api/auth/google/native', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': '2' } }, response => {
        response.resume(); response.once('end', () => resolve(response.statusCode!));
      });
      request.once('error', reject); request.write('{');
    });
    assert.equal(status, 408); assert.equal(f.calls(), 0);
    assert.equal((await fetch(f.url + '/api/health')).status, 200);
  } finally { await f.close(); }
});

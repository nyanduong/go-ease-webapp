import { test } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { spawnSync } from 'node:child_process';
import { createApi } from '../dist/app.js';
import { readConfig } from '../dist/config.js';
import { apiErrorResponseSchema, catalogResponseSchema, healthResponseSchema } from '@goease/contracts';
import { CATALOG_INFO, getDalatCatalog } from '@goease/catalog';

async function withApi(run, env = {}, load) {
  const { app } = await createApi(env, load);
  try {
    await app.listen(0, '127.0.0.1');
    await run(await app.getUrl());
  } finally { await app.close(); }
}
async function errorResponse(response, status, code) {
  assert.equal(response.status, status);
  const body = apiErrorResponseSchema.parse(await response.json());
  assert.equal(body.statusCode, status); assert.equal(body.error.code, code);
  assert.equal(body.error.requestId, response.headers.get('x-request-id'));
  return body;
}
function chunked(url, body) {
  return new Promise((resolve, reject) => {
    const req = request(url, { method: 'POST', headers: { 'content-type': 'application/json' } }, (res) => {
      let text = ''; res.setEncoding('utf8'); res.on('data', (part) => { text += part; });
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(text) })); res.on('error', reject);
    });
    req.on('error', reject); req.write(body); req.end();
  });
}
test('real HTTP health is process-only, versioned, with safe headers and server-generated request IDs', () => withApi(async (base) => {
  const response = await fetch(`${base}/v1/health`, { headers: { 'x-request-id': 'untrusted-client-value' } });
  assert.equal(response.status, 200); const body = healthResponseSchema.parse(await response.json());
  assert.deepEqual(body.dependencies, { database: 'not-configured', gemini: 'not-configured' });
  assert.equal(body.scope, 'process'); assert.equal(response.headers.get('x-powered-by'), null);
  assert.equal(response.headers.get('cache-control'), 'no-store'); assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.match(response.headers.get('x-request-id'), /^[\da-f-]{36}$/);
  const next = await fetch(`${base}/v1/health`); await next.json();
  assert.notEqual(next.headers.get('x-request-id'), response.headers.get('x-request-id'));
}));
test('real HTTP catalog uses exactly the app dataset and sources; DTO validates on the wire', () => withApi(async (base) => {
  for (const query of ['', '?destinationId=da-lat']) {
    const response = await fetch(`${base}/v1/catalog${query}`); assert.equal(response.status, 200);
    const body = catalogResponseSchema.parse(await response.json());
    assert.deepEqual(body.catalog, { ...CATALOG_INFO, entries: getDalatCatalog() });
    assert.equal(body.catalog.entries.length, 15);
  }
}));
test('real HTTP rejects unsupported/unknown/duplicate/nested queries and health query', () => withApi(async (base) => {
  for (const suffix of ['?destinationId=ha-noi', '?destinationId=', '?destinationId=da-lat&destinationId=da-lat', '?extra=1', '?destinationId[x]=da-lat']) {
    await errorResponse(await fetch(`${base}/v1/catalog${suffix}`), 400, 'BAD_REQUEST');
  }
  await errorResponse(await fetch(`${base}/v1/health?verbose=true`), 400, 'BAD_REQUEST');
}));
test('real HTTP unknown route/method errors never reflect a raw URL or secret', () => withApi(async (base) => {
  const body = await errorResponse(await fetch(`${base}/missing?token=DO_NOT_LEAK`), 404, 'NOT_FOUND');
  assert.equal(JSON.stringify(body).includes('DO_NOT_LEAK'), false);
  await errorResponse(await fetch(`${base}/v1/catalog`, { method: 'POST' }), 404, 'NOT_FOUND');
}));
test('real HTTP parser errors and oversize content-length/chunked bodies use the same envelope', () => withApi(async (base) => {
  await errorResponse(await fetch(`${base}/v1/catalog`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{broken' }), 400, 'BAD_JSON');
  const body = JSON.stringify({ value: 'a'.repeat(9000) });
  await errorResponse(await fetch(`${base}/v1/catalog`, { method: 'POST', headers: { 'content-type': 'application/json' }, body }), 413, 'PAYLOAD_TOO_LARGE');
  const response = await chunked(`${base}/v1/catalog`, body);
  assert.equal(response.status, 413); assert.equal(apiErrorResponseSchema.parse(response.body).error.code, 'PAYLOAD_TOO_LARGE');
  await errorResponse(await fetch(`${base}/v1/catalog?x=${'a'.repeat(2100)}`), 414, 'URI_TOO_LONG');
}));
test('real HTTP rejects non-JSON/compressed bodies', () => withApi(async (base) => {
  await errorResponse(await fetch(`${base}/v1/catalog`, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: 'hello' }), 415, 'UNSUPPORTED_MEDIA_TYPE');
  await errorResponse(await fetch(`${base}/v1/catalog`, { method: 'POST', headers: { 'content-type': 'application/json', 'content-encoding': 'gzip' }, body: '{}' }), 415, 'UNSUPPORTED_MEDIA_TYPE');
}));
test('real HTTP CORS allows configured exact origin/native, denies arbitrary browser origin and handles preflight', () => withApi(async (base) => {
  const response = await fetch(`${base}/v1/catalog`, { headers: { origin: 'http://localhost:8081' } }); await response.json();
  assert.equal(response.status, 200); assert.equal(response.headers.get('access-control-allow-origin'), 'http://localhost:8081');
  assert.equal(response.headers.get('access-control-allow-credentials'), null);
  await errorResponse(await fetch(`${base}/v1/health`, { headers: { origin: 'https://evil.example' } }), 403, 'ORIGIN_NOT_ALLOWED');
  const preflight = await fetch(`${base}/v1/catalog`, { method: 'OPTIONS', headers: { origin: 'http://localhost:8081', 'access-control-request-method': 'GET' } });
  assert.equal(preflight.status, 204); assert.equal(preflight.headers.get('access-control-allow-methods'), 'GET');
}, { API_CORS_ORIGINS: 'http://localhost:8081' }));
test('real HTTP validates outbound catalog and masks internal errors (fault providers only)', async () => {
  await withApi(async (base) => errorResponse(await fetch(`${base}/v1/catalog`), 500, 'RESPONSE_INVALID'), {}, () => []);
  await withApi(async (base) => {
    const body = await errorResponse(await fetch(`${base}/v1/catalog`), 500, 'INTERNAL_ERROR');
    assert.equal(JSON.stringify(body).includes('DO_NOT_LEAK'), false);
  }, {}, () => { throw new Error('DO_NOT_LEAK'); });
});
test('real HTTP handler deadline returns 504 JSON rather than false success (never-ending fault provider)', () => withApi(async (base) => {
  await errorResponse(await fetch(`${base}/v1/catalog`, { signal: AbortSignal.timeout(2000) }), 504, 'REQUEST_TIMEOUT');
}, { API_REQUEST_TIMEOUT_MS: '100' }, () => new Promise(() => {})));
test('invalid config fails before HTTP starts and does not print supplied values', async () => {
  for (const env of [
    { API_PORT: '0' }, { API_PORT: '65536' }, { API_PORT: '3.5' }, { API_HOST: 'example.com' },
    { API_REQUEST_TIMEOUT_MS: '99' }, { API_RECEIVE_TIMEOUT_MS: '0' },
    { API_CORS_ORIGINS: '*' }, { API_CORS_ORIGINS: 'http://localhost:8081/' },
    { API_CORS_ORIGINS: 'https://user:secret@example.com' },
  ]) { assert.throws(() => readConfig(env)); await assert.rejects(createApi(env)); }
  const result = spawnSync(process.execPath, ['dist/main.js'], { cwd: new URL('..', import.meta.url), env: { ...process.env, API_PORT: 'DO_NOT_LEAK' }, encoding: 'utf8', timeout: 5000 });
  assert.equal(result.status, 1); assert.equal(`${result.stdout}${result.stderr}`.includes('DO_NOT_LEAK'), false);
  assert.equal(`${result.stdout}${result.stderr}`.includes('listening'), false);
});

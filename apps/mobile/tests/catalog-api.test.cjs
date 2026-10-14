const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fetchApiCatalog, apiOrigin } = require('../.logic-tests/catalog-api-controller.js');
const { getDalatCatalog, CATALOG_INFO } = require('@goease/catalog');
const dto = () => ({ apiVersion: '1', catalog: { ...CATALOG_INFO, entries: getDalatCatalog() } });
test('API client validates real DTO shape and requests the versioned catalog', async () => {
  let called;
  const data = await fetchApiCatalog('http://127.0.0.1:3000', { fetcher: async (url, options) => { called = { url, options }; return new Response(JSON.stringify(dto())); } });
  assert.deepEqual(data, dto()); assert.equal(called.url, 'http://127.0.0.1:3000/v1/catalog?destinationId=da-lat');
  assert.equal(called.options.signal.aborted, false);
});
test('API client config rejects missing URL, credentials, path, query, trailing slash and non-http scheme before fetch', async () => {
  for (const url of [undefined, '', 'ftp://example.com', 'https://user:secret@example.com', 'http://localhost:3000/', 'http://localhost:3000/v1', 'http://localhost:3000?x=1', 'http://localhost:3000#x']) {
    assert.throws(() => apiOrigin(url), { code: 'CONFIG' });
    await assert.rejects(fetchApiCatalog(url, { fetcher: async () => { assert.fail('must not fetch'); } }), { code: 'CONFIG' });
  }
  await assert.rejects(fetchApiCatalog('http://localhost:3000', { timeoutMs: 0 }), { code: 'CONFIG' });
});
test('API client rejects malformed/oversize/wrong version/invalid coordinates rather than accepting fallback catalog', async () => {
  const invalid = dto(); invalid.catalog.entries[0].coordinates.latitude = 0;
  for (const raw of ['<html>bad gateway</html>', 'x'.repeat(150001), JSON.stringify({ ...dto(), apiVersion: '2' }), JSON.stringify(invalid)]) {
    await assert.rejects(fetchApiCatalog('http://localhost:3000', { fetcher: async () => new Response(raw) }), { code: 'INVALID_RESPONSE' });
  }
});
test('API client gives safe status/code/request ID for server error and does not echo remote message', async () => {
  const body = { apiVersion: '1', statusCode: 504, error: { code: 'REQUEST_TIMEOUT', message: 'DO_NOT_LEAK', requestId: 'b5aa7f8a-1711-4c09-b432-bcf075c57b5f' } };
  await assert.rejects(fetchApiCatalog('http://localhost:3000', { fetcher: async () => new Response(JSON.stringify(body), { status: 504 }) }), (error) => error.code === 'HTTP' && error.message.includes('REQUEST_TIMEOUT') && !error.message.includes('DO_NOT_LEAK'));
  await assert.rejects(fetchApiCatalog('http://localhost:3000', { fetcher: async () => new Response(JSON.stringify({ ...body, statusCode: 500 }), { status: 504 }) }), { code: 'INVALID_RESPONSE' });
});
test('API client network error is safe and next call can retry successfully', async () => {
  let attempts = 0;
  const fetcher = async () => { if (++attempts === 1) throw new Error('DO_NOT_LEAK'); return new Response(JSON.stringify(dto())); };
  await assert.rejects(fetchApiCatalog('http://localhost:3000', { fetcher }), (error) => error.code === 'NETWORK' && !error.message.includes('DO_NOT_LEAK'));
  assert.deepEqual(await fetchApiCatalog('http://localhost:3000', { fetcher }), dto());
});
test('API client deadline bounds hanging fetch and body read, and aborts transport', async () => {
  let signal;
  await assert.rejects(fetchApiCatalog('http://localhost:3000', { timeoutMs: 100, fetcher: async (_url, options) => { signal = options.signal; return new Promise(() => {}); } }), { code: 'TIMEOUT' });
  assert.equal(signal.aborted, true);
  await assert.rejects(fetchApiCatalog('http://localhost:3000', { timeoutMs: 100, fetcher: async () => ({ ok: true, text: () => new Promise(() => {}) }) }), { code: 'TIMEOUT' });
});

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { callDemoApi } = require('../.logic-tests/demo-api-controller.js');
const token = 'temporary-demo-code-00000000';
const health = { apiVersion: '1', service: 'goease-api', status: 'ok', scope: 'process', dependencies: { database: 'not-configured', gemini: 'configured-unverified' } };
test('demo client requires HTTPS and runtime session, never puts credential in URL/body', async () => {
  for (const url of ['http://example.com', 'https://user:pass@example.com', 'https://example.com/path', undefined]) await assert.rejects(callDemoApi(url, token, 'health'), { code: 'CONFIG' });
  await assert.rejects(callDemoApi('https://api.example', 'bad', 'health'), { code: 'CONFIG' });
  const result = await callDemoApi('https://api.example', token, 'health', { fetcher: async (url, options) => {
    assert.equal(url, 'https://api.example/v1/health'); assert.equal(url.includes(token), false); assert.equal(options.headers.authorization, `Bearer ${token}`); assert.equal(options.redirect, 'error');
    return new Response(JSON.stringify(health));
  } }); assert.deepEqual(result.data, health);
});
test('demo client rejects malformed/wrong DTO and redacts network/provider messages', async () => {
  for (const raw of ['<html>tunnel down</html>', '{}', 'x'.repeat(150001)]) await assert.rejects(callDemoApi('https://api.example', token, 'health', { fetcher: async () => new Response(raw) }), { code: 'INVALID_RESPONSE' });
  const error = { apiVersion: '1', statusCode: 401, error: { code: 'AI_ACCESS_DENIED', message: token, requestId: 'b5aa7f8a-1711-4c09-b432-bcf075c57b5f' } };
  await assert.rejects(callDemoApi('https://api.example', token, 'health', { fetcher: async () => new Response(JSON.stringify(error), { status: 401 }) }), (e) => e.code === 'HTTP' && !e.message.includes(token));
  await assert.rejects(callDemoApi('https://api.example', token, 'health', { fetcher: async () => { throw new Error(token); } }), (e) => e.code === 'NETWORK' && !e.message.includes(token));
});
test('demo client aborts hanging fetch/body and respects pre-cancel without retry', async () => {
  let attempts = 0, signal;
  await assert.rejects(callDemoApi('https://api.example', token, 'health', { timeoutMs: 100, fetcher: async (_url, options) => { attempts++; signal = options.signal; return new Promise(() => {}); } }), { code: 'TIMEOUT' });
  assert.equal(attempts, 1); assert.equal(signal.aborted, true);
  await assert.rejects(callDemoApi('https://api.example', token, 'health', { timeoutMs: 100, fetcher: async () => ({ ok: true, text: () => new Promise(() => {}) }) }), { code: 'TIMEOUT' });
  const cancelled = new AbortController(); cancelled.abort();
  await assert.rejects(callDemoApi('https://api.example', token, 'health', { signal: cancelled.signal, fetcher: async () => assert.fail('no outbound') }), { code: 'CANCELLED' });
});
test('demo AI sends one fixed QA request and validates the AI response, never accepting sample fallback', async () => {
  let attempts = 0;
  await assert.rejects(callDemoApi('https://api.example', token, 'ai', { fetcher: async (url, options) => {
    attempts++; assert.equal(url, 'https://api.example/v1/ai/itineraries'); assert.equal(options.method, 'POST');
    const body = JSON.parse(options.body); assert.equal(body.durationDays, 1); assert.equal(body.people, 2); assert.equal(body.budgetVnd, null);
    assert.equal(options.body.includes(token), false); assert.equal('prompt' in body, false);
    return new Response(JSON.stringify({ kind: 'sample' }));
  } }), { code: 'INVALID_RESPONSE' });
  assert.equal(attempts, 1);
  const controller = new AbortController();
  const pending = callDemoApi('https://api.example', token, 'ai', { signal: controller.signal, fetcher: async () => new Promise(() => {}) });
  controller.abort(); await assert.rejects(pending, { code: 'CANCELLED' });
});

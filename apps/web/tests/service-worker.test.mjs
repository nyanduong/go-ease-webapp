import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { serviceWorkerSource } from '../scripts/service-worker.mjs';

function worker() {
  const handlers = new Map(),
    entries = new Map([
      ['/index.html', 'offline-shell'],
      ['/assets/app.js', 'app'],
    ]);
  const deleted = [],
    fetched = [],
    stored = [];
  const self = {
    location: { origin: 'https://goease.test' },
    addEventListener: (name, handler) => handlers.set(name, handler),
    skipWaiting() {
      stored.push('skip-waiting');
    },
    clients: { claim: async () => stored.push('claim') },
  };
  const cache = {
    addAll: async (assets) => stored.push(...assets),
    match: async (path) => entries.get(path),
  };
  const caches = {
    open: async () => cache,
    keys: async () => ['goease-pwa-old', 'other-app', 'goease-pwa-new'],
    delete: async (name) => deleted.push(name),
  };
  const context = {
    self,
    caches,
    URL,
    Response,
    fetch: async (request) => {
      fetched.push(request.url);
      if (request.fail) throw Error('offline');
      return 'network';
    },
  };
  runInNewContext(serviceWorkerSource('new', ['/index.html', '/assets/app.js']), context);
  const request = (url, options = {}) => {
    let response;
    handlers.get('fetch')({
      request: {
        url,
        method: 'GET',
        mode: 'cors',
        headers: new Headers(),
        ...options,
      },
      respondWith(value) {
        response = value;
      },
    });
    return response;
  };
  return { handlers, request, deleted, fetched, stored };
}
test('offline shell and assets are cached; API, authorization, map/provider calls and mutations bypass worker', async () => {
  const w = worker();
  assert.equal(
    await w.request('https://goease.test/trips/one', {
      mode: 'navigate',
      fail: true,
    }),
    'offline-shell',
  );
  assert.equal(await w.request('https://goease.test/assets/app.js'), 'app');
  for (const [url, options] of [
    ['https://goease.test/v1/trips', {}],
    ['https://goease.test/auth/session', {}],
    ['https://maps.googleapis.com/tiles', {}],
    ['https://goease.test/unknown.json', {}],
    [
      'https://goease.test/assets/app.js',
      { headers: new Headers({ authorization: 'Bearer fixture' }) },
    ],
    ['https://goease.test/assets/app.js?private=1', {}],
    ['https://goease.test/v1/trips', { method: 'POST' }],
  ])
    assert.equal(w.request(url, options), undefined);
  assert.deepEqual(w.fetched, ['https://goease.test/trips/one']);
});
test('new worker waits for explicit update; activation cleans only GoEase shell caches', async () => {
  const w = worker();
  let job;
  w.handlers.get('install')({
    waitUntil(value) {
      job = value;
    },
  });
  await job;
  assert.deepEqual(w.stored, ['/index.html', '/assets/app.js']);
  w.handlers.get('message')({ data: 'something-else' });
  assert.equal(w.stored.includes('skip-waiting'), false);
  w.handlers.get('message')({ data: 'ACTIVATE_UPDATE' });
  assert.equal(w.stored.includes('skip-waiting'), true);
  w.handlers.get('activate')({
    waitUntil(value) {
      job = value;
    },
  });
  await job;
  assert.deepEqual(w.deleted, ['goease-pwa-old']);
});

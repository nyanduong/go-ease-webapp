// Only the customer shell is cached. Credentials, API responses and map tiles never enter CacheStorage.
export function serviceWorkerSource(version, assets) {
  return `const CACHE = ${JSON.stringify('goease-pwa-' + version)};
const ASSETS = ${JSON.stringify(assets)};
const PATHS = new Set(ASSETS.map(path => new URL(path, self.location.origin).pathname));
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
});
self.addEventListener('message', event => {
  if (event.data === 'ACTIVATE_UPDATE') self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name.startsWith('goease-pwa-') && name !== CACHE) await caches.delete(name);
    }
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || request.headers.has('authorization') || url.pathname.startsWith('/v1/') || url.pathname.startsWith('/auth/')) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(async () => {
      const shell = await (await caches.open(CACHE)).match('/index.html');
      return shell || Response.error();
    }));
  } else if (PATHS.has(url.pathname) && !url.search) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      return (await cache.match(url.pathname)) || fetch(request);
    })());
  }
});`;
}

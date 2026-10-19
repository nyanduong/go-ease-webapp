// Temporary QA gateway, never a production ingress. It exposes no filesystem, DB, AI or demo endpoints.
import { createServer, request as upstreamRequest } from 'node:http';
const origins = new Set([
  'http://127.0.0.1:5174',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:4174',
]);
const port = 3103;
let count = 0,
  bucket = 0;
const server = createServer((req, res) => {
  const origin = req.headers.origin;
  const reply = (status, body = '') => {
    res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(body);
  };
  if (origin && !origins.has(origin)) return reply(403);
  const minute = Math.floor(Date.now() / 60000);
  if (minute !== bucket) {
    bucket = minute;
    count = 0;
  }
  if (++count > 60) return reply(429);
  const url = new URL(req.url, 'http://127.0.0.1:' + port),
    method = req.method;
  const publicRoute =
    method === 'GET' && ['/v1/health', '/v1/catalog/places'].includes(url.pathname);
  const privateRoute =
    (method === 'GET' && url.pathname === '/v1/auth/me') ||
    (['GET', 'POST'].includes(method) && url.pathname === '/v1/trips') ||
    (['GET', 'PUT', 'DELETE'].includes(method) &&
      /^\/v1\/trips\/[A-Za-z0-9_-]{1,80}$/.test(url.pathname)) ||
    (['GET', 'POST'].includes(method) && url.pathname === '/v1/admin/catalog') ||
    (method === 'PUT' && /^\/v1\/admin\/catalog\/[A-Za-z0-9_-]{1,80}$/.test(url.pathname));
  if (method === 'OPTIONS' && origin) {
    res.writeHead(204, {
      'access-control-allow-origin': origin,
      'access-control-allow-headers': 'authorization,content-type',
      'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS',
      'cache-control': 'no-store',
      vary: 'Origin',
    });
    return res.end();
  }
  if (!publicRoute && !privateRoute) return reply(404);
  if (
    privateRoute &&
    !/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(req.headers.authorization ?? '')
  )
    return reply(401);
  let size = 0;
  const chunks = [];
  req.on('data', (chunk) => {
    size += chunk.length;
    if (size <= 65536) chunks.push(chunk);
  });
  req.on('end', () => {
    if (size > 65536) return reply(413);
    const headers = {
      accept: 'application/json',
      ...(origin ? { origin } : {}),
      ...(req.headers.authorization ? { authorization: req.headers.authorization } : {}),
      ...(req.headers['content-type'] ? { 'content-type': req.headers['content-type'] } : {}),
    };
    const request = upstreamRequest(
      {
        hostname: '127.0.0.1',
        port: 3000,
        path: url.pathname + url.search,
        method,
        headers,
        timeout: 20000,
      },
      (upstream) => {
        res.writeHead(upstream.statusCode, { ...upstream.headers, 'cache-control': 'no-store' });
        upstream.pipe(res);
      },
    );
    request.on('timeout', () => request.destroy());
    request.on('error', () => {
      if (!res.headersSent) reply(502);
      else res.destroy();
    });
    res.on('close', () => request.destroy());
    request.end(Buffer.concat(chunks));
  });
});
server.listen(port, '127.0.0.1', () =>
  console.info(
    'GoEase account QA gateway: loopback:3103, 30-minute lifetime. No credentials logged.',
  ),
);
const timer = setTimeout(() => {
  server.close();
  server.closeAllConnections();
  console.info('QA gateway expired.');
}, 30 * 60000);
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    clearTimeout(timer);
    server.close();
    server.closeAllConnections();
  });

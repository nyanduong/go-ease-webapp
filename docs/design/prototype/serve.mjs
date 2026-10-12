import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const portArgument = globalThis.process.argv[2] ?? '4184';
if (!/^\d+$/.test(portArgument) || Number(portArgument) < 1024 || Number(portArgument) > 65535 || globalThis.process.argv.length > 3) {
  throw new Error('Usage: node serve.mjs [port 1024–65535]. Host is always 127.0.0.1.');
}
const port = Number(portArgument);
const files = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/prototype.js', ['prototype.js', 'text/javascript; charset=utf-8']],
  ['/assets/goease-logo.jpg', ['assets/goease-logo.jpg', 'image/jpeg']],
  ['/assets/halong-sunset.jpg', ['assets/halong-sunset.jpg', 'image/jpeg']],
]);
const server = createServer(async (request, response) => {
  const path = new globalThis.URL(request.url, `http://127.0.0.1:${port}`).pathname;
  const file = files.get(path);
  if (!file || request.method !== 'GET') { response.writeHead(404); response.end('Not found'); return; }
  try {
    const content = await readFile(new globalThis.URL(file[0], import.meta.url));
    response.writeHead(200, { 'Content-Type': file[1], 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    response.end(content);
  } catch { response.writeHead(500); response.end('Prototype file unavailable'); }
});
server.listen(port, '127.0.0.1', () => globalThis.console.log(`Prototype nội bộ: http://127.0.0.1:${port} · Ctrl+C để dừng. Không có API/live.`));

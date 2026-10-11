import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const files = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/prototype.js', ['prototype.js', 'text/javascript; charset=utf-8']],
]);
const server = createServer(async (request, response) => {
  const path = new globalThis.URL(request.url, 'http://127.0.0.1:4184').pathname;
  const file = files.get(path);
  if (!file || request.method !== 'GET') { response.writeHead(404); response.end('Not found'); return; }
  try {
    const content = await readFile(new globalThis.URL(file[0], import.meta.url));
    response.writeHead(200, { 'Content-Type': file[1], 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    response.end(content);
  } catch { response.writeHead(500); response.end('Prototype file unavailable'); }
});
server.listen(4184, '127.0.0.1', () => globalThis.console.log('Prototype nội bộ: http://127.0.0.1:4184 · Ctrl+C để dừng. Không có API/live.'));

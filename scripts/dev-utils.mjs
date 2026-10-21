import { createServer } from 'node:net';

// Replace only this public setting, preserving comments and all other configuration.
export function updateApiOrigin(content, origin) {
  if (!['http://localhost:3000', 'http://127.0.0.1:3000'].includes(origin))
    throw Error('Invalid local API origin');
  const newline = content.includes('\r\n') ? '\r\n' : '\n';
  let found = false;
  const lines = content.split(/\r?\n/).map((line) => {
    if (!/^\s*(?:export\s+)?VITE_API_BASE_URL\s*=/.test(line)) return line;
    found = true;
    return `VITE_API_BASE_URL=${origin}`;
  });
  if (!found) {
    if (lines.at(-1) === '') lines.pop();
    lines.push(`VITE_API_BASE_URL=${origin}`, '');
  }
  return lines.join(newline);
}

export async function assertPortFree(port) {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', () =>
      reject(
        Error(
          `Port ${port} đang được dùng. Dừng terminal cũ đang chạy API/gateway/web rồi chạy lại pnpm dev.`,
        ),
      ),
    );
    server.listen(port, '127.0.0.1', resolve);
  });
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}

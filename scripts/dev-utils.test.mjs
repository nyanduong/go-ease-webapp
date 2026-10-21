import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import test from 'node:test';
import { assertPortFree, updateApiOrigin } from './dev-utils.mjs';

test('updates all active URL definitions, preserving other env settings and CRLF', () => {
  const original =
    '# VITE_API_BASE_URL=comment\r\nVITE_SUPABASE_PUBLISHABLE_KEY=keep\r\nexport VITE_API_BASE_URL = "https://old.example"\r\nVITE_API_BASE_URL=https://duplicate.example\r\n';
  const url = 'http://localhost:3000';
  const updated = updateApiOrigin(original, url);
  assert.equal(
    updated,
    '# VITE_API_BASE_URL=comment\r\nVITE_SUPABASE_PUBLISHABLE_KEY=keep\r\nVITE_API_BASE_URL=' +
      url +
      '\r\nVITE_API_BASE_URL=' +
      url +
      '\r\n',
  );
  assert.equal(updateApiOrigin(updated, url), updated);
  assert.throws(() => updateApiOrigin(original, 'https://untrusted.example'));
  assert.throws(() => updateApiOrigin(original, 'http://192.168.1.5:3000'));
  assert.equal(
    updateApiOrigin('', 'http://127.0.0.1:3000'),
    'VITE_API_BASE_URL=http://127.0.0.1:3000\n',
  );
});

test('appends missing setting without joining it to an existing line', () => {
  const url = 'http://127.0.0.1:3000';
  assert.equal(updateApiOrigin('OTHER=value', url), `OTHER=value\nVITE_API_BASE_URL=${url}\n`);
  assert.equal(updateApiOrigin('', url), `VITE_API_BASE_URL=${url}\n`);
});

test('rejects an occupied port without disrupting its server, accepts it after close', async () => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  try {
    await assert.rejects(assertPortFree(port), /Dừng terminal cũ/);
    assert.equal(server.listening, true);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
  await assertPortFree(port);
});

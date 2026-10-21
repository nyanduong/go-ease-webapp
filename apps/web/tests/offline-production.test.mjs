import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'vite';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

test('production build removes the offline auth bypass even when VITE_DEV_OFFLINE=true', async () => {
  const before = process.env.VITE_DEV_OFFLINE;
  const root = fileURLToPath(new URL('..', import.meta.url));
  const outDir = join(root, 'dist-test/offline-production');
  try {
    process.env.VITE_DEV_OFFLINE = 'true';
    await build({
      root,
      envDir: join(root, 'dist-test/no-env'),
      build: { outDir },
      logLevel: 'warn',
    });
    const files = await readdir(join(outDir, 'assets'));
    const code = (
      await Promise.all(
        files
          .filter((file) => file.endsWith('.js'))
          .map((file) => readFile(join(outDir, 'assets', file), 'utf8')),
      )
    ).join('\n');
    assert.equal(code.includes('DEV OFFLINE'), false);
    assert.equal(code.includes('goease.dev-offline.trips.v1'), false);
    assert.equal(code.includes('Tiếp tục với Google'), true);
  } finally {
    if (before === undefined) delete process.env.VITE_DEV_OFFLINE;
    else process.env.VITE_DEV_OFFLINE = before;
  }
});

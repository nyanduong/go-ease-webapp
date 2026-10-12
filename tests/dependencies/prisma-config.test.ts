import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const apiRoot = fileURLToPath(new URL('../../apps/api/', import.meta.url));
const apiRequire = createRequire(new URL('../../apps/api/package.json', import.meta.url));
const prismaRequire = createRequire(apiRequire.resolve('prisma/config'));
const configRequire = createRequire(prismaRequire.resolve('@prisma/config'));

test('Prisma config merger handles recursive records without exhausting the stack', () => {
  const { deepmerge } = configRequire('deepmerge-ts') as { deepmerge: (...values: unknown[]) => unknown };
  const first: { owner: string; self?: unknown } = { owner: 'TEST_ONLY' }; first.self = first;
  const second: { enabled: boolean; self?: unknown } = { enabled: true }; second.self = second;
  const merged = deepmerge(first, second) as { owner: string; enabled: boolean; self: unknown };
  assert.equal(merged.owner, 'TEST_ONLY');
  assert.equal(merged.enabled, true);
  assert.equal(merged.self, merged);
});

test('Actual Prisma config loader preserves GoEase schema and migration paths with the patched merger', async () => {
  const { loadConfigFromFile } = prismaRequire('@prisma/config') as {
    loadConfigFromFile: (options: { configFile: string; configRoot: string }) => Promise<{
      error?: unknown; config?: { schema?: string; migrations?: { path?: string } };
    }>;
  };
  const result = await loadConfigFromFile({ configFile: 'prisma7.config.ts', configRoot: apiRoot });
  assert.equal(result.error, undefined);
  assert.equal(result.config?.schema, path.join(apiRoot, 'prisma/schema.prisma'));
  assert.equal(result.config?.migrations?.path, path.join(apiRoot, 'prisma/migrations'));
});

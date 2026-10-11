import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { checkArchitecture } from '../../scripts/check-architecture.ts';

const checker = resolve(dirname(fileURLToPath(import.meta.url)), '../../scripts/check-architecture.ts');
function fixture(files: Record<string, string>, check: (root: string) => void) {
  const root = mkdtempSync(join(tmpdir(), 'goease-architecture-'));
  try {
    for (const [name, content] of Object.entries(files)) {
      const target = join(root, name);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, content);
    }
    check(root);
  } finally {
    assert.ok(root.startsWith(join(tmpdir(), 'goease-architecture-')));
    rmSync(root, { recursive: true, force: true });
  }
}

test('Cho phép app/API dùng contracts thuần và alias nội bộ, bỏ qua test/config Node', () => {
  fixture({
    'packages/contracts/src/index.ts': 'export type Health = { status: string };',
    'apps/api/src/main.ts': "import { readFile } from 'node:fs'; import type { Health } from '@goease/contracts';",
    'apps/web/tsconfig.json': JSON.stringify({ compilerOptions: { paths: { '@/*': ['./src/*'] } } }),
    'apps/web/src/main.ts': "import type { Health } from '@goease/contracts'; import { value } from '@/lib/value'; import './style.css';",
    'apps/web/src/lib/value.ts': 'export const value = 1;',
    'apps/web/src/style.css': 'body {}',
    'apps/web/src/main.test.ts': "import 'node:fs';",
    'apps/web/vite.config.ts': "import 'node:fs';",
    'apps/mobile/App.tsx': "import type { Health } from '@goease/contracts'; import 'react-native';",
  }, root => {
    assert.deepEqual(checkArchitecture(root).violations, []);
    const output = execFileSync(process.execPath, [checker, root], { encoding: 'utf8' });
    assert.match(output, /0 violations/);
  });
});

for (const [label, file, source, expected] of [
  ['web → API qua workspace', 'apps/web/src/main.ts', "import '@goease/api';", /vượt ranh giới/],
  ['mobile → API qua relative', 'apps/mobile/src/main.ts', "export * from '../../api/src/main.js';", /vượt ranh giới/],
  ['API → web', 'apps/api/src/main.ts', "import '../../web/src/main.js';", /vượt ranh giới/],
  ['contracts → app', 'packages/contracts/src/index.ts', "export * from '../../../apps/web/src/main.js';", /vượt ranh giới/],
  ['Prisma dynamic import', 'apps/web/src/main.ts', "const db = import('@prisma/client');", /server\/Node\/DB/],
  ['Node bare import', 'apps/mobile/src/main.ts', "import 'fs/promises';", /server\/Node\/DB/],
  ['Node require', 'apps/web/src/main.ts', "const fs = require('node:fs');", /server\/Node\/DB/],
  ['Node re-export', 'packages/contracts/src/index.ts', "export * from 'node:crypto';", /server\/Node\/DB/],
  ['Nest type import', 'packages/contracts/src/index.ts', "type App = import('@nestjs/core').NestApplication;", /server\/Node\/DB/],
  ['React contracts', 'packages/contracts/src/index.ts', "import type { ReactNode } from 'react';", /độc lập UI/],
  ['DOM trong mobile', 'apps/mobile/src/main.ts', "import '@radix-ui/react-slot';", /UI DOM/],
  ['Native trong web', 'apps/web/src/main.ts', "import 'expo-router';", /UI native/],
  ['import động không phân tích được', 'apps/web/src/main.ts', 'const name = "x"; import(name);', /chuỗi cố định/],
  ['relative không tồn tại', 'apps/web/src/main.ts', "import './missing.js';", /Không phân giải/],
  ['asset nội bộ không tồn tại', 'apps/web/src/main.ts', "import './missing.json';", /Không phân giải/],
  ['workspace chưa có', 'apps/web/src/main.ts', "import '@goease/mobile';", /vượt ranh giới/],
  ['file ngoài workspace', 'apps/web/src/main.ts', "import '../../../shared.js';", /ngoài workspace/],
  ['Vite glob vượt ranh giới', 'apps/web/src/main.ts', "const files = import.meta.glob('../../api/src/*.ts', { eager: true });", /chuỗi cố định/],
] as const) {
  test(`Chặn ${label}`, () => {
    fixture({
      'apps/api/src/main.ts': 'export const api = true;',
      'apps/web/src/main.ts': 'export const web = true;',
      'shared.ts': 'export const shared = true;',
      [file]: source,
    }, root => assert.ok(checkArchitecture(root).violations.some(violation => expected.test(violation.message))));
  });
}

test('Alias tsconfig không che import API hoặc alias nội bộ chưa phân giải', () => {
  fixture({
    'apps/api/src/secret.ts': 'export const server = true;',
    'apps/web/tsconfig.json': JSON.stringify({ compilerOptions: { paths: { '@server/*': ['../api/src/*'], '@/*': ['./src/*'] } } }),
    'apps/web/src/main.ts': "export * from '@server/secret'; import '@/missing'; import '@server/missing.json';",
  }, root => {
    const messages = checkArchitecture(root).violations.map(violation => violation.message);
    assert.ok(messages.some(message => /vượt ranh giới/.test(message)));
    assert.ok(messages.some(message => /Không phân giải/.test(message)));
    assert.ok(messages.some(message => /vượt ranh giới.*@server\/missing\.json/.test(message)));
  });
});

test('Phát hiện vòng local qua re-export + dynamic import + relative .js và CLI trả exit 1', () => {
  fixture({
    'apps/api/src/a.ts': "export * from './b.js';",
    'apps/api/src/b.ts': "export const other = import('./c.js');",
    'apps/api/src/c.ts': "import './a.js';",
  }, root => {
    const result = checkArchitecture(root);
    assert.equal(result.violations.filter(violation => /Vòng import/.test(violation.message)).length, 1);
    const cli = spawnSync(process.execPath, [checker, root], { encoding: 'utf8' });
    assert.equal(cli.status, 1);
    assert.match(cli.stderr, /a\.ts.*b\.ts.*c\.ts.*a\.ts/);
  });
});

test('CLI thất bại với vi phạm ranh giới kể cả khi module chưa tồn tại', () => {
  fixture({ 'apps/web/src/main.ts': "import '@goease/api';" }, root => {
    // A workspace name remains protected before the app has source files.
    mkdirSync(join(root, 'apps/api'), { recursive: true });
    const cli = spawnSync(process.execPath, [checker, root], { encoding: 'utf8' });
    assert.equal(cli.status, 1);
    assert.match(cli.stderr, /vượt ranh giới/);
  });
});

test('Checkout nằm dưới thư mục tên tests vẫn quét source sản phẩm', () => {
  fixture({ 'tests/repo/apps/web/src/main.ts': "import 'node:fs';" }, root => {
    const result = checkArchitecture(join(root, 'tests/repo'));
    assert.equal(result.files, 1);
    assert.ok(result.violations.some(violation => /server\/Node\/DB/.test(violation.message)));
  });
});

test('Alias trỏ vào package server/DB trong node_modules vẫn bị chặn', () => {
  fixture({
    'node_modules/pg/index.d.ts': 'export const database: string;',
    'apps/web/tsconfig.json': JSON.stringify({ compilerOptions: { paths: { '@db': ['../../node_modules/pg/index.d.ts'] } } }),
    'apps/web/src/main.ts': "import { database } from '@db';",
  }, root => assert.ok(checkArchitecture(root).violations.some(violation => /server\/Node\/DB.*@db.*pg/.test(violation.message))));
});

test('JSON/asset không che import credential ngoài workspace', () => {
  fixture({
    'server-config.json': '{}',
    'apps/web/tsconfig.json': JSON.stringify({ compilerOptions: { resolveJsonModule: true } }),
    'apps/web/src/main.ts': "import config from '../../../server-config.json';",
  }, root => assert.ok(checkArchitecture(root).violations.some(violation => /ngoài workspace/.test(violation.message))));
});

import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { parseEnv } from 'node:util';
import { assertPortFree, updateApiOrigin } from './dev-utils.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const api = join(root, 'apps/api');
const web = join(root, 'apps/web');
const children = new Set();
const abort = new AbortController();
let stopping = false;
let databaseManaged = false;
let finish;
const finished = new Promise((resolve) => {
  finish = resolve;
});

function launch(name, executable, args, options = {}) {
  abort.signal.throwIfAborted();
  const child = spawn(executable, args, {
    cwd: root,
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : ['ignore', 'inherit', 'inherit'],
    windowsHide: true,
    detached: process.platform !== 'win32',
    ...options,
  });
  children.add(child);
  // Attach immediately so spawn failures never become unhandled rejections.
  child.done = new Promise((resolve, reject) => {
    child.once('error', () =>
      reject(Error(`Không chạy được ${name}. Kiểm tra chương trình đã cài.`)),
    );
    child.once('exit', (code) => {
      if (code === 0) resolve();
      else reject(Error(`${name} đã dừng (mã ${code ?? 'signal'}).`));
    });
  });
  child.done.catch(() => {});
  child.once('close', () => children.delete(child));
  if (options.service) {
    child.done.then(
      () => {
        if (!stopping) void stop(Error(`${name} đã dừng.`));
      },
      (error) => {
        if (!stopping) void stop(error);
      },
    );
  }
  return child;
}

async function stop(error) {
  if (stopping) return;
  stopping = true;
  abort.abort();
  if (error) {
    console.error(`[dev] ${error.message}`);
    process.exitCode = 1;
  }
  if (children.size) console.info('[dev] Đang dừng API và web...');
  await Promise.all(
    [...children].reverse().map(async (child) => {
      if (!child.pid) return;
      if (process.platform === 'win32') {
        await new Promise((resolve) => {
          const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
            stdio: 'ignore',
            windowsHide: true,
          });
          killer.once('error', resolve);
          killer.once('close', resolve);
        });
      } else {
        try {
          process.kill(-child.pid, 'SIGTERM');
        } catch {
          return;
        }
        await delay(500);
        try {
          process.kill(-child.pid, 'SIGKILL');
        } catch {
          /* Already stopped. */
        }
      }
    }),
  );
  // Stop PostgreSQL gracefully only after API connections and startup processes have closed.
  if (databaseManaged) {
    console.info('[dev] Đang dừng database...');
    const stopped = await new Promise((resolve) => {
      const child = spawn(process.execPath, ['scripts/db-local.mjs', 'stop'], {
        cwd: api,
        stdio: ['ignore', 'inherit', 'inherit'],
        windowsHide: true,
      });
      child.once('error', () => resolve(false));
      child.once('close', (code) => resolve(code === 0));
    });
    if (!stopped) {
      console.error('[dev] Chưa dừng được database. Thử lại bằng pnpm db:stop.');
      process.exitCode = 1;
    } else console.info('[dev] Đã dừng database; dữ liệu được giữ nguyên.');
  }
  finish();
}

async function waitForHttp(url, validate, timeoutMs = 60000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    abort.signal.throwIfAborted();
    try {
      const response = await fetch(url, {
        signal: AbortSignal.any([abort.signal, AbortSignal.timeout(3000)]),
        redirect: 'error',
      });
      if (response.ok && (await validate(response))) return;
    } catch {
      /* Services may still be starting. */
    }
    await delay(1000, undefined, { signal: abort.signal });
  }
  throw Error('Hết thời gian chờ dịch vụ sẵn sàng. Kiểm tra log tiến trình và kết nối mạng.');
}

async function main() {
  const pnpm = process.env.npm_execpath;
  if (!pnpm) throw Error('Chạy bằng pnpm dev từ thư mục gốc dự án.');
  if (process.argv.includes('--offline')) {
    await assertPortFree(5175);
    console.info('[dev] Chuẩn bị dev offline: không dùng database/API hoặc đăng nhập.');
    await launch('Build packages', process.execPath, [pnpm, 'build:packages']).done;
    launch(
      'Web offline',
      process.execPath,
      ['node_modules/vite/bin/vite.js', '--port', '5175', '--open', 'http://localhost:5175'],
      {
        cwd: web,
        service: true,
        env: { ...process.env, VITE_DEV_OFFLINE: 'true' },
      },
    );
    await waitForHttp('http://localhost:5175', async () => true);
    console.info(
      '[dev] Offline sẵn sàng: http://localhost:5175 (cũng hỗ trợ http://127.0.0.1:5175) — Ctrl+C để dừng.',
    );
    await finished;
    return;
  }
  const origin = 'http://localhost:3000';
  const envPath = join(web, '.env.local');
  let content;
  try {
    content = await readFile(envPath, 'utf8');
  } catch {
    throw Error('Cần apps/web/.env.local với cấu hình Supabase trước khi chạy.');
  }
  const config = parseEnv(content);
  if (!config.VITE_SUPABASE_URL || !config.VITE_SUPABASE_PUBLISHABLE_KEY)
    throw Error('Thiếu cấu hình Supabase trong apps/web/.env.local.');
  for (const port of [3000, 5174]) await assertPortFree(port);

  console.info('[dev] Chuẩn bị database và build API...');
  databaseManaged = true;
  await launch('Database', process.execPath, [pnpm, 'db:local']).done;
  await launch('Build API', process.execPath, [pnpm, '--filter', '@goease/api', 'build']).done;
  // Same-machine development: bind the API only to loopback.
  launch('API', process.execPath, ['--env-file-if-exists=.env', '--watch', 'dist/main.js'], {
    cwd: api,
    service: true,
    env: { ...process.env, API_HOST: '127.0.0.1', API_PORT: '3000' },
  });
  const health = async (response) => {
    const body = await response.json();
    return body.service === 'goease-api' && body.status === 'ok';
  };
  await waitForHttp(origin + '/v1/health', health);
  launch(
    'TypeScript watch',
    process.execPath,
    ['node_modules/typescript/bin/tsc', '--watch', '--preserveWatchOutput'],
    {
      cwd: api,
      service: true,
    },
  );
  abort.signal.throwIfAborted();
  // Read again to preserve edits made while services were starting.
  content = await readFile(envPath, 'utf8');
  await writeFile(envPath, updateApiOrigin(content, origin));
  console.info('[dev] Đã cập nhật VITE_API_BASE_URL trong apps/web/.env.local.');
  launch('Web', process.execPath, ['node_modules/vite/bin/vite.js'], {
    cwd: web,
    service: true,
    env: { ...process.env, VITE_API_BASE_URL: origin, VITE_DEV_OFFLINE: 'false' },
  });
  await waitForHttp('http://localhost:5174', async () => true);
  console.info(
    '[dev] Sẵn sàng: http://localhost:5174 (cũng hỗ trợ http://127.0.0.1:5174) — Ctrl+C để dừng.',
  );
  await finished;
}

process.on('SIGINT', () => void stop());
process.on('SIGTERM', () => void stop());
try {
  await main();
} catch (error) {
  if (!stopping) await stop(error);
}
await finished;

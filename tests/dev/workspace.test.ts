import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFile } from 'node:child_process';
import { access, cp, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import { createConnection, type Socket } from 'node:net';
import { chromium, expect, type Browser, type Locator, type Page } from '@playwright/test';

const run = promisify(execFile);
const repository = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const tempRoot = resolve(tmpdir());
const apiUrl = 'http://127.0.0.1:3031/api/health';
const webUrl = 'http://127.0.0.1:5181';

async function eventually(check: () => Promise<boolean>, message: string, timeout = 30000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await check()) return;
    await delay(200);
  }
  assert.fail(message);
}

async function listening(url: string) {
  try { return (await fetch(url, { signal: AbortSignal.timeout(700) })).ok; } catch { return false; }
}

async function retryHealthUntil(page: Page, expected: Locator, message: string) {
  // A successful API probe can precede another tsc/Node-watch restart. The UI
  // deliberately needs user retry after a connection failure; wait via that UI.
  await eventually(async () => {
    if (await expected.isVisible()) return true;
    const retry = page.getByRole('button', { name: /^(Kiểm tra lại|Thử lại)$/ });
    if (await retry.isVisible() && await retry.isEnabled()) await retry.click();
    return false;
  }, message);
  await expect(expected).toBeVisible();
}

async function createFixture() {
  const cwd = await mkdtemp(join(tempRoot, 'goease-dev-test-'));
  for (const file of ['package.json', 'pnpm-workspace.yaml', 'tsconfig.base.json']) {
    await cp(join(repository, file), join(cwd, file));
  }
  for (const folder of ['apps/api', 'apps/web', 'packages/contracts']) {
    const source = join(repository, folder);
    await cp(source, join(cwd, folder), {
      recursive: true,
      filter: (path) => !relative(source, path).split(/[\\/]/).some(part =>
        part === 'node_modules' || part === 'dist' || part === '.local' || part === '.database-upgrade-test' || part.startsWith('.env')),
    });
  }
  // Reuse installed external packages; contracts always resolves to the fixture.
  await symlink(join(repository, 'node_modules'), join(cwd, 'node_modules'), 'junction');
  for (const app of ['api', 'web']) {
    const source = join(repository, 'apps', app, 'node_modules');
    const target = join(cwd, 'apps', app, 'node_modules');
    await mkdir(join(target, '@goease'), { recursive: true });
    for (const entry of await readdir(source)) {
      if (entry !== '@goease') await symlink(join(source, entry), join(target, entry), 'junction');
    }
    await symlink(join(cwd, 'packages/contracts'), join(target, '@goease/contracts'), 'junction');
  }
  const webPackage = join(cwd, 'apps/web/package.json');
  await writeFile(webPackage, (await readFile(webPackage, 'utf8')).replace('--port 5173', '--port 5181'));
  // A fixture-only startup barrier survives concurrent tsc emits. Hold it only
  // for the forced restart so browser downtime does not depend on CI speed.
  const apiMain = join(cwd, 'apps/api/src/main.ts');
  const startupBarrier = `import { existsSync as fixtureGateExists } from 'node:fs';
const fixtureGate = ${JSON.stringify(join(cwd, '.restart-gate'))};
const fixtureDeadline = Date.now() + 60000;
while (fixtureGateExists(fixtureGate)) {
  if (Date.now() > fixtureDeadline) throw new Error('Fixture restart gate was not released.');
  await new Promise(resolve => setTimeout(resolve, 50));
}
`;
  await writeFile(apiMain, startupBarrier + await readFile(apiMain, 'utf8'));
  return cwd;
}

function alive(pid: number) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

async function descendants(pid: number): Promise<number[]> {
  if (process.platform === 'win32') return [];
  const { stdout } = await run('ps', ['-eo', 'pid=,ppid=']);
  const rows = stdout.trim().split('\n').map(line => line.trim().split(/\s+/).map(Number));
  const result = [pid];
  for (let index = 0; index < result.length; index++) {
    for (const [child, parent] of rows) if (parent === result[index] && child) result.push(child);
  }
  return result;
}

test('dev từ fixture sạch: contracts → API/web, compile recovery và dừng tiến trình', { timeout: 120000 }, async () => {
  assert.equal(await listening(apiUrl), false, 'Port 3031 phải trống; không tái sử dụng API khác.');
  assert.equal(await listening(webUrl), false, 'Port 5181 phải trống; không tái sử dụng web khác.');
  const cwd = await createFixture();
  const source = join(cwd, 'packages/contracts/src/index.ts');
  const original = await readFile(source);
  const dist = join(cwd, 'packages/contracts/dist/index.js');
  const restartGate = join(cwd, '.restart-gate');
  await assert.rejects(access(dist));
  const pnpm = process.env.npm_execpath;
  assert.ok(pnpm, 'Chạy bằng pnpm test:dev để dùng CLI cùng toolchain.');
  let logs = '';
  const env = { ...process.env, NODE_ENV: 'development', PORT: '3031', WEB_ORIGINS: webUrl, VITE_API_BASE_URL: 'http://127.0.0.1:3031/api' };
  const dev = spawn(process.execPath, [pnpm, 'dev'], { cwd, env, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
  dev.stdout.on('data', data => { logs += String(data); });
  dev.stderr.on('data', data => { logs += String(data); });
  const stopped = new Promise<void>((resolve, reject) => { dev.once('close', () => resolve()); dev.once('error', reject); });
  let browser: Browser | undefined;
  let preconnect: Socket | undefined;
  try {
    browser = await chromium.launch();
    await eventually(async () => await listening(apiUrl) && await listening(webUrl), 'Dev không khởi động.');
    const page = await browser.newPage();
    await page.goto(webUrl);
    await retryHealthUntil(page, page.getByRole('heading', { name: 'API đang hoạt động', exact: true }), 'Web không nhận API sau khi dev khởi động.');
    // A real socket with no HTTP request reproduces browser speculative
    // preconnect: httpServer.close alone can wait forever for this connection.
    preconnect = createConnection({ host: '127.0.0.1', port: 3031 });
    preconnect.resume();
    await new Promise<void>((resolve, reject) => {
      preconnect!.once('connect', resolve);
      preconnect!.once('error', reject);
    });
    const probe = original.toString().replace("'goease-api' as const", "'goease-api-dev-probe' as const")
      .replace("health.scope === 'api-only'", "health.scope === 'dev-probe'");
    assert.notEqual(probe, original.toString());
    await writeFile(source, probe);
    await eventually(async () => {
      try { return (await (await fetch(apiUrl)).json() as { service: string }).service === 'goease-api-dev-probe'; } catch { return false; }
    }, 'API không nhận runtime contracts mới.');
    await eventually(async () => preconnect!.destroyed, 'Watch restart không đóng kết nối preconnect cũ.');
    // Reproduce a later watcher restart after the readiness sample, using the
    // real fixture process (no network mock). Hold startup until the browser has
    // demonstrably observed downtime before exercising explicit retry.
    const mainDist = join(cwd, 'apps/api/dist/src/main.js');
    const compiledMain = await readFile(mainDist, 'utf8');
    await writeFile(restartGate, 'Hold fixture startup until network failure is verified.');
    await writeFile(mainDist, `${compiledMain}\n// Force a watcher restart after a successful readiness probe.\n`);
    await eventually(async () => !await listening(apiUrl), 'Không thấy API dừng trong watcher restart.');
    const failedRequest = page.waitForEvent('requestfailed', { predicate: request => request.url() === apiUrl });
    await page.getByRole('button', { name: /^(Kiểm tra lại|Thử lại)$/ }).click();
    await failedRequest;
    await expect(page.getByText('Chưa nhận được phản hồi. Kiểm tra API và kết nối mạng, rồi thử lại.', { exact: true })).toBeVisible();
    await rm(restartGate, { force: true });
    await retryHealthUntil(page, page.getByText('Phản hồi API chưa đúng định dạng health.', { exact: true }), 'Web không nhận guard contracts mới sau khi API khởi động lại.');
    const validDist = await readFile(dist);
    const checkpoint = logs.length;
    await writeFile(source, probe + '\nconst compileProbe: string = 42;\n');
    await eventually(async () => logs.slice(checkpoint).includes('error TS2322'), 'Không thấy lỗi compile contracts.');
    assert.deepEqual(await readFile(dist), validDist, 'Bản compile lỗi không được ghi đè dist hợp lệ.');
    await writeFile(source, original);
    await eventually(async () => {
      try { return (await (await fetch(apiUrl)).json() as { service: string }).service === 'goease-api'; } catch { return false; }
    }, 'API không phục hồi sau khi sửa compile error.');
    await retryHealthUntil(page, page.getByRole('heading', { name: 'API đang hoạt động', exact: true }), 'Web không phục hồi sau khi contracts hợp lệ và API khởi động lại.');
    assert.deepEqual(await readFile(source), original);
  } catch (error) {
    throw new Error(`Dev regression thất bại.\n${logs}`, { cause: error });
  } finally {
    preconnect?.destroy();
    await rm(restartGate, { force: true });
    await browser?.close();
    await writeFile(source, original);
    assert.ok(dev.pid);
    const pids = await descendants(dev.pid);
    if (process.platform === 'win32') {
      // Native Ctrl+C is checked separately in a Windows terminal; no signal groups here.
      if (alive(dev.pid)) await run('taskkill', ['/PID', String(dev.pid), '/T', '/F']);
    } else if (alive(dev.pid)) process.kill(-dev.pid, 'SIGINT');
    await Promise.race([stopped, delay(10000, undefined, { ref: false }).then(() => { throw new Error('Dev không dừng sau signal.'); })]);
    await eventually(async () => !await listening(apiUrl) && !await listening(webUrl) && pids.every(pid => !alive(pid)), 'Còn port hoặc tiến trình con sau khi dừng.', 10000);
    const location = relative(tempRoot, resolve(cwd));
    assert.ok(location.startsWith('goease-dev-test-') && !location.includes('..'));
    await rm(cwd, { recursive: true, force: true });
  }
});

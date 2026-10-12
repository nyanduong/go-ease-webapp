/* global process, console, setTimeout, clearTimeout */
// CI-only actual container test. Never starts a Docker daemon or contacts providers.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { chromium } from '@playwright/test';
import { redactedContainerFailure, redactedStartupStatus } from './container-error.mjs';
import { localHttpProbe } from './local-http.mjs';
import { scanFinalImages } from './image-scan.mjs';
const execute = promisify(execFile), prefix = `goease-ci-${randomBytes(6).toString('hex')}`;
const containers = [], images = [], network = `${prefix}-net`;
async function docker(args, input) {
  try {
    if (input !== undefined) {
      const { spawn } = await import('node:child_process');
      await new Promise((resolve, reject) => {
        const child = spawn('docker', args, { stdio: ['pipe', 'ignore', 'pipe'] });
        let stderr = '';
        child.stderr.on('data', chunk => { stderr = (stderr + chunk.toString()).slice(-65_536); });
        const timer = setTimeout(() => { child.kill(); reject(new Error('Container command timed out')); }, 30_000);
        child.once('error', () => { clearTimeout(timer); reject(new Error('Container command unavailable')); });
        child.once('exit', code => { clearTimeout(timer); if (code === 0) resolve(); else reject({ stderr }); });
        child.stdin.end(input);
      }); return '';
    }
    return (await execute('docker', args, { timeout: args[0] === 'build' ? 360_000 : 30_000, maxBuffer: 1024 * 1024 })).stdout.trim();
  } catch (error) { throw redactedContainerFailure(args[0], error); }
}
async function waitFor(check) {
  for (let attempt = 0; attempt < 90; attempt++) { if (await check()) return; await new Promise(resolve => setTimeout(resolve, 500)); }
  throw new Error('Owned container readiness timed out');
}
async function waitForContainer(name, label, check) {
  try { await waitFor(check); }
  catch {
    let diagnosis = 'LOG_UNAVAILABLE';
    try {
      const logs = await execute('docker', ['logs', '--tail', '80', name], { timeout: 5000, maxBuffer: 128 * 1024 });
      diagnosis = redactedStartupStatus(logs.stdout + '\n' + logs.stderr);
    } catch { /* Never expose raw execution errors. */ }
    throw new Error(`Owned ${label} readiness timed out (${diagnosis}); raw startup logs are not logged`);
  }
}
try {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'goease-container-ci-'));
  const clusterPassword = randomBytes(32).toString('hex'), migrationPassword = randomBytes(32).toString('hex'), runtimePassword = randomBytes(32).toString('hex');
  const clusterFile = path.join(temp, 'cluster-password'), apiFile = path.join(temp, 'api-env'), operatorFile = path.join(temp, 'operator-env');
  // Parent temp directory is private; bind mounts must also be readable by the
  // container's non-root UID. No secret is sent in Docker arguments or image layers.
  await writeFile(clusterFile, clusterPassword, { mode: 0o444 });
  const migration = `postgresql://goease_ci_migrator:${migrationPassword}@database:5432/goease_ci`, runtime = `postgresql://goease_ci_app:${runtimePassword}@database:5432/goease_ci`;
  // TEST_ONLY public client-shaped config exercises anonymous401 before Google;
  // web has no client configured and no provider request/authentication occurs.
  await writeFile(apiFile, `DATABASE_URL=${runtime}\nWEB_ORIGINS=https://ci.goease.vn\nGOOGLE_WEB_CLIENT_ID=123-test-only.apps.googleusercontent.com\n`, { mode: 0o444 });
  await writeFile(operatorFile, `DATABASE_MIGRATION_URL=${migration}\nDATABASE_URL=${runtime}\nRUNTIME_ROLE=goease_ci_app\n`, { mode: 0o444 });
  for (const target of ['api', 'operator', 'admin', 'pg-tools']) {
    const image = `${prefix}-${target}`; images.push(image);
    console.info(`Building reviewed container target: ${target}`);
    await docker(['build', '--target', target, '-f', 'deploy/Dockerfile', '-t', image, '.']);
  }
  const scanTargets = [];
  for (const target of ['api', 'operator', 'admin', 'pg-tools']) {
    const image = `${prefix}-${target}`;
    assert.equal(await docker(['image', 'inspect', '--format', '{{.Os}}/{{.Architecture}}', image]), 'linux/amd64');
    scanTargets.push({ target, imageID: await docker(['image', 'inspect', '--format', '{{.Id}}', image]) });
  }
  for (const target of ['api', 'operator']) {
    const version = await docker(['run', '--rm', '--entrypoint', 'dpkg-query', `${prefix}-${target}`, '-W', '-f=${Version}', 'perl-base']);
    assert.equal(version, '5.36.0-7+deb12u4');
    await docker(['run', '--rm', '--entrypoint', 'node', `${prefix}-${target}`, '-e',
      "const fs=require('node:fs');for(const p of ['/usr/local/lib/node_modules/npm','/usr/local/bin/npm','/usr/local/bin/npx']){try{fs.lstatSync(p);process.exit(1)}catch(e){if(e.code!=='ENOENT')throw e}}"]);
  }
  for (const name of ['liblzma5', 'xz-utils']) {
    assert.equal(await docker(['run', '--rm', '--entrypoint', 'dpkg-query', `${prefix}-pg-tools`, '-W', '-f=${Version}', name]), '5.8.1-1+deb13u2');
  }
  await docker(['run', '--rm', '--entrypoint', 'sh', `${prefix}-pg-tools`, '-c', 'test ! -e /usr/local/bin/gosu']);
  for (const name of ['libexpat=2.8.5-r0', 'libpng=1.6.59-r0', 'nghttp2-libs=1.70.0-r0', 'pcre2=10.49-r0', 'tiff=4.7.2-r0', 'zlib=1.3.2-r1']) {
    await docker(['run', '--rm', '--entrypoint', 'apk', `${prefix}-admin`, 'info', '-e', name]);
  }
  const scan = await scanFinalImages(scanTargets, process.env.GOEASE_IMAGE_REPORT_DIR, process.env.GOEASE_TRIVY_BIN);
  // Collect every scan and still execute all existing behavior checks before
  // failing on available fixes. Remaining unfixed advisories are release blockers.
  await docker(['network', 'create', network]);
  console.info('Preparing owned private PostgreSQL fixture.');
  const pg = `${prefix}-db`; containers.push(pg);
  await docker(['run', '-d', '--name', pg, '--network', network, '--network-alias', 'database', '-e', 'POSTGRES_PASSWORD_FILE=/run/secrets/password', '-e', 'POSTGRES_DB=goease_ci', '--mount', `type=bind,src=${clusterFile},dst=/run/secrets/password,readonly`, '--tmpfs', '/var/lib/postgresql:rw,size=256m', 'postgres:18.6-trixie@sha256:74935e72241653ca55e0414067e6d8763aceb8a810eb51b452253ec3dcfc4336']);
  // The image's initialization server accepts Unix sockets before initialization
  // finishes. TCP readiness only becomes available on the final server.
  await waitFor(async () => { try { await docker(['exec', pg, 'pg_isready', '-h', '127.0.0.1', '-p', '5432', '-U', 'postgres', '-d', 'goease_ci']); return true; } catch { return false; } });
  console.info('Creating least-privilege roles on the final PostgreSQL server.');
  await docker(['exec', '-i', pg, 'psql', '-U', 'postgres', '-d', 'goease_ci', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=sqlstate'], `CREATE ROLE goease_ci_migrator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '${migrationPassword}';
CREATE ROLE goease_ci_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '${runtimePassword}';
ALTER DATABASE goease_ci OWNER TO goease_ci_migrator;
REVOKE ALL ON DATABASE goease_ci FROM PUBLIC;
GRANT CONNECT ON DATABASE goease_ci TO goease_ci_app;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;`);
  for (const command of ['migrate', 'grants', 'seed-sample', 'verify']) {
    console.info(`Checking isolated operator command: ${command}`);
    await docker(['run', '--rm', '--network', network, '--read-only', '--cap-drop=ALL', '--security-opt=no-new-privileges', '--tmpfs', '/tmp:rw,size=64m', '--mount', `type=bind,src=${operatorFile},dst=/run/secrets/operator_env,readonly`, `${prefix}-operator`, command]);
  }
  const backups = path.join(temp, 'backups'); await mkdir(backups, { mode: 0o777 });
  const { chmod } = await import('node:fs/promises'); await chmod(backups, 0o777);
  const passFile = path.join(temp, 'pg-pass');
  await writeFile(passFile, `database:5432:*:goease_ci_migrator:${migrationPassword}\n`, { mode: 0o444 });
  const serviceFile = async database => {
    const file = path.join(temp, `service-${database}`);
    await writeFile(file, `[goease]\nhost=database\nport=5432\ndbname=${database}\nuser=goease_ci_migrator\n`, { mode: 0o444 }); return file;
  };
  const sourceService = await serviceFile('goease_ci');
  const pgTools = (service, command, label) => docker(['run', '--rm', '--network', network, '--read-only', '--cap-drop=ALL', '--security-opt=no-new-privileges', '--tmpfs', '/tmp:rw,size=16m', '--mount', `type=bind,src=${service},dst=/run/secrets/pg_service,readonly`, '--mount', `type=bind,src=${passFile},dst=/run/secrets/pg_pass,readonly`, '--mount', `type=bind,src=${backups},dst=/backups`, `${prefix}-pg-tools`, command, label]);
  console.info('Checking concurrent backup and fresh-only restore.');
  const results = await Promise.allSettled([pgTools(sourceService, 'backup', 'collision'), pgTools(sourceService, 'backup', 'collision')]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter(result => result.status === 'rejected').length, 1);
  // The archive stays UID postgres/mode0600. A non-root CI runner must not
  // weaken that permission merely to read the checksum from the host.
  const hash = async () => {
    const output = await docker(['run', '--rm', '--read-only', '--cap-drop=ALL', '--security-opt=no-new-privileges', '--entrypoint', 'sha256sum', '--mount', `type=bind,src=${backups},dst=/backups,readonly`, `${prefix}-pg-tools`, '/backups/collision.dump']);
    const match = /^([a-f0-9]{64}) {2}\/backups\/collision\.dump$/.exec(output);
    assert.ok(match, 'Private archive checksum must be returned by its owning UID'); return match[1];
  };
  const before = await hash(); await assert.rejects(pgTools(sourceService, 'backup', 'collision')); assert.equal(await hash(), before);
  await docker(['exec', '-i', pg, 'psql', '-U', 'postgres', '-d', 'goease_ci', '-v', 'ON_ERROR_STOP=1'], 'CREATE DATABASE goease_restore OWNER goease_ci_migrator; CREATE DATABASE goease_dirty OWNER goease_ci_migrator;');
  await docker(['exec', '-i', pg, 'psql', '-U', 'postgres', '-d', 'goease_dirty', '-v', 'ON_ERROR_STOP=1'], "CREATE TYPE public.test_only_enum AS ENUM ('TEST_ONLY');");
  await assert.rejects(pgTools(await serviceFile('goease_dirty'), 'restore-fresh', 'collision'));
  const restoreService = await serviceFile('goease_restore');
  await pgTools(restoreService, 'restore-fresh', 'collision');
  assert.equal(await docker(['exec', pg, 'psql', '-U', 'postgres', '-d', 'goease_restore', '-At', '-c', 'SELECT count(*) FROM "Place"']), '3');
  await assert.rejects(pgTools(restoreService, 'restore-fresh', 'collision'));
  const api = `${prefix}-api`, proxy = `${prefix}-proxy`; containers.push(api, proxy);
  console.info('Checking non-root API and local HTTP proxy boundaries.');
  await docker(['run', '-d', '--name', api, '--network', network, '--network-alias', 'api', '--read-only', '--cap-drop=ALL', '--security-opt=no-new-privileges', '--tmpfs', '/tmp:rw,size=32m', '--mount', `type=bind,src=${apiFile},dst=/run/secrets/api_env,readonly`, `${prefix}-api`]);
  await waitForContainer(api, 'API', async () => { try { await docker(['exec', api, 'node', '-e', "fetch('http://127.0.0.1:3000/api/health',{signal:AbortSignal.timeout(1000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]); return true; } catch { return false; } });
  console.info('Non-root API health is ready; starting local HTTP proxy.');
  await docker(['exec', api, 'node', '-e', 'if(process.getuid()===0)process.exit(1)']);
  await docker(['run', '-d', '--name', proxy, '--network', network, '--read-only', '--cap-drop=ALL', '--security-opt=no-new-privileges', '--tmpfs', '/tmp:rw,size=32m', '-e', 'STAGING_HOST=ci.goease.vn', '-p', '127.0.0.1::8080', `${prefix}-admin`]);
  const address = await docker(['port', proxy, '8080/tcp']);
  assert.notEqual(await docker(['exec', proxy, 'id', '-u']), '0');
  assert.match(address, /^127\.0\.0\.1:\d+$/);
  const base = `http://${address}`, probe = route => localHttpProbe(base + route, 'ci.goease.vn');
  await waitForContainer(proxy, 'proxy', async () => { try { return (await probe('/api/health')).ok; } catch { return false; } });
  for (const route of ['/admin/catalog', '/admin/requests', '/technical/health']) {
    const response = await probe(route); assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /text\/html/); assert.match(response.headers.get('cache-control'), /no-store/);
  }
  assert.equal((await probe('/assets/not-present.js')).status, 404);
  for (const [route, status] of [['/api/admin/places', 401], ['/api/not-present', 404]]) {
    const response = await probe(route); assert.equal(response.status, status);
    assert.match(response.headers.get('content-type'), /application\/json/); assert.match(response.headers.get('cache-control'), /no-store/);
  }
  assert.equal((await localHttpProbe(base + '/api/health', 'unknown.invalid')).status, 421);
  assert.equal(await docker(['port', api]), '', 'API must have no host-published port');
  // Keep proxy running. Start a replacement while old IP is still allocated,
  // then remove the old API; DNS must recover without restarting nginx.
  const replacement = `${prefix}-api-replacement`; containers.push(replacement);
  console.info('Checking private API replacement without proxy restart.');
  await docker(['run', '-d', '--name', replacement, '--network', network, '--network-alias', 'api', '--read-only', '--cap-drop=ALL', '--security-opt=no-new-privileges', '--tmpfs', '/tmp:rw,size=32m', '--mount', `type=bind,src=${apiFile},dst=/run/secrets/api_env,readonly`, `${prefix}-api`]);
  const ip = name => docker(['inspect', '--format', '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}', name]);
  assert.notEqual(await ip(api), await ip(replacement));
  await waitFor(async () => { try { await docker(['exec', replacement, 'node', '-e', "fetch('http://127.0.0.1:3000/api/health',{signal:AbortSignal.timeout(1000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]); return true; } catch { return false; } });
  await docker(['rm', '-f', api]);
  await waitFor(async () => { try { return (await probe('/api/health')).ok; } catch { return false; } });
  const browser = await chromium.launch({ args: ['--host-resolver-rules=MAP ci.goease.vn 127.0.0.1'] });
  console.info('Checking static browser relative /api and refresh on local HTTP fixture.');
  try {
    const page = await browser.newPage(), errors = [], responses = [], browserBase = `http://ci.goease.vn:${address.split(':').at(-1)}`;
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => { if (response.url().endsWith('/api/health')) responses.push(response.status()); });
    await page.goto(browserBase + '/technical/health'); await page.getByText('API đang hoạt động', { exact: true }).waitFor({ timeout: 10_000 });
    await page.reload(); await page.getByText('API đang hoạt động', { exact: true }).waitFor({ timeout: 10_000 });
    assert.ok(responses.length >= 2 && responses.every(status => status === 200)); assert.deepEqual(errors, []);
  } finally { await browser.close(); }
  console.info('Actual containers: non-root runtime/operator, private PG, relative /api, proxy/deep links/cache/auth gates PASS (local HTTP CI only).');
  assert.equal(scan.fixable, 0, 'Final images contain advisories with available fixes; see full reports');
} finally {
  for (const name of containers.reverse()) await docker(['rm', '-f', name]).catch(() => {});
  await docker(['network', 'rm', network]).catch(() => {});
  // Images are uniquely named CI artifacts; no global prune or shared Docker state.
}

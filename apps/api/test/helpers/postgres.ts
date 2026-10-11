import { execFile, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import pg from 'pg';
export { grantRuntime } from '../../scripts/lib/runtime-role.js';

const execute = promisify(execFile);

export async function postgresBin() {
  const candidates = [process.env['POSTGRES_BIN'], ...(process.platform === 'win32' ? ['C:/Program Files/PostgreSQL/18/bin'] : ['/usr/lib/postgresql/18/bin', '/usr/lib/postgresql/17/bin', '/usr/lib/postgresql/16/bin'])].filter((value): value is string => Boolean(value));
  for (const candidate of candidates) if (existsSync(path.join(candidate, process.platform === 'win32' ? 'initdb.exe' : 'initdb'))) return candidate;
  throw new Error('PostgreSQL 16–18 binaries required; set POSTGRES_BIN (no database test is skipped).');
}

export async function runTool(binary: string, args: string[], env = process.env) {
  if (path.basename(binary).replace(/\.exe$/i, '') === 'pg_ctl') {
    // Daemon grandchildren must not inherit Node pipes on Windows: otherwise
    // execFile's callback waits for the server's entire lifetime after start.
    await new Promise<void>((resolve, reject) => {
      const child = spawn(binary, args, { env, windowsHide: true, stdio: 'ignore' });
      const timer = setTimeout(() => { child.kill(); reject(new Error('Owned pg_ctl operation timed out')); }, 30_000);
      child.once('error', () => { clearTimeout(timer); reject(new Error('Owned pg_ctl could not start')); });
      child.once('exit', code => { clearTimeout(timer); if (code === 0) resolve(); else reject(new Error('Owned pg_ctl failed; inspect private postgres.log')); });
    });
    return { stdout: '', stderr: '' };
  }
  try { return await execute(binary, args, { env, windowsHide: true, maxBuffer: 4 * 1024 * 1024, timeout: 120_000 }); }
  catch { throw new Error(`${path.basename(binary)} failed; details stay in the private local fixture, never print credentials.`); }
}

async function freePort() {
  const server = net.createServer();
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No local port available');
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return address.port;
}

export class LocalPostgres {
  private constructor(readonly directory: string, readonly bin: string, readonly port: number, readonly password: string) {}
  static async initialize(directory: string) {
    const absolute = path.resolve(directory);
    // Never initialize over an existing directory, DB or service.
    if (existsSync(absolute)) throw new Error('Local PostgreSQL target already exists; refusing to overwrite it.');
    const bin = await postgresBin();
    const port = await freePort();
    const password = randomBytes(32).toString('hex');
    await mkdir(absolute, { recursive: true, mode: 0o700 });
    await writeFile(path.join(absolute, 'password'), password, { mode: 0o600 });
    await writeFile(path.join(absolute, 'goease-local.json'), JSON.stringify({ port, password }), { mode: 0o600 });
    await runTool(path.join(bin, 'initdb'), ['-D', path.join(absolute, 'data'), '--username=goease_cluster', `--pwfile=${path.join(absolute, 'password')}`, '--auth-host=scram-sha-256', '--auth-local=scram-sha-256', '--encoding=UTF8', '--locale=C']);
    return new LocalPostgres(absolute, bin, port, password);
  }
  static async reopen(directory: string) {
    const absolute = path.resolve(directory);
    const record: unknown = JSON.parse(await readFile(path.join(absolute, 'goease-local.json'), 'utf8'));
    if (!record || typeof record !== 'object' || !('port' in record) || !('password' in record) || !Number.isInteger(record.port) || typeof record.password !== 'string') throw new Error('Invalid owned GoEase cluster marker');
    return new LocalPostgres(absolute, await postgresBin(), record.port as number, record.password);
  }
  url(database = 'postgres', role = 'goease_cluster', password = this.password) {
    return `postgresql://${role}:${password}@127.0.0.1:${this.port}/${database}`;
  }
  async start() {
    await runTool(path.join(this.bin, 'pg_ctl'), ['-D', path.join(this.directory, 'data'), '-l', path.join(this.directory, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${this.port} -c max_connections=30 -c shared_buffers=32MB -c unix_socket_directories=`, '-w', 'start']);
  }
  async stop() { await runTool(path.join(this.bin, 'pg_ctl'), ['-D', path.join(this.directory, 'data'), '-m', 'fast', '-w', 'stop']); }
  async stopIfRunning() {
    // A timed-out pg_ctl can have started its owned daemon already. The marker
    // is inside this freshly initialized cluster, never a system service.
    if (existsSync(path.join(this.directory, 'data/postmaster.pid'))) await this.stop();
  }
  async restart() { await this.stop(); await this.start(); }
}

export async function createIsolatedDatabase(cluster: LocalPostgres, databaseName: string) {
  if (!/^goease_[a-z0-9_]+$/.test(databaseName)) throw new Error('Only isolated goease_* database names are allowed');
  const admin = new pg.Client({ connectionString: cluster.url() });
  await admin.connect();
  const runtimePassword = randomBytes(32).toString('hex');
  const migratorPassword = randomBytes(32).toString('hex');
  const runtime = `${databaseName}_app`;
  const migrator = `${databaseName}_migrator`;
  try {
    // Identifiers are generated/strictly validated; values are fresh hex only.
    await admin.query(`CREATE ROLE ${migrator} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD '${migratorPassword}'`);
    await admin.query(`CREATE ROLE ${runtime} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD '${runtimePassword}'`);
    await admin.query(`CREATE DATABASE ${databaseName} OWNER ${migrator}`);
    await admin.query(`REVOKE ALL ON DATABASE ${databaseName} FROM PUBLIC`);
    await admin.query(`GRANT CONNECT ON DATABASE ${databaseName} TO ${runtime}`);
  } finally { await admin.end(); }
  const migrationUrl = cluster.url(databaseName, migrator, migratorPassword);
  const runtimeUrl = cluster.url(databaseName, runtime, runtimePassword);
  const migration = new pg.Client({ connectionString: migrationUrl });
  await migration.connect();
  try { await migration.query('REVOKE CREATE ON SCHEMA public FROM PUBLIC'); }
  finally { await migration.end(); }
  return { databaseName, runtime, migrator, migrationUrl, runtimeUrl };
}

export async function fixtureDirectory() {
  const parent = path.join(os.tmpdir(), 'goease-postgres-tests');
  await mkdir(parent, { recursive: true });
  // Random child; initialized fixtures are retained for safe failure diagnosis.
  return path.join(parent, randomBytes(8).toString('hex'));
}

export async function postgresVersion(bin: string) {
  return (await runTool(path.join(bin, 'postgres'), ['--version'])).stdout.trim();
}

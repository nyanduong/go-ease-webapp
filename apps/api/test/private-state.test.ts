import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';
import { chmod, mkdir, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { test } from 'node:test';
import { preparePrivateState, privateStateDirectory, verifyPrivateState, verifyTrialDatabase } from '../src/private-state.js';

const execute = promisify(execFile);
const base = process.platform === 'win32' ? path.join(process.env['LOCALAPPDATA']!, 'GoEase', 'local-db') : path.join(os.tmpdir(), 'goease-private-local-db');
function fresh() { return path.join(base, `test-${randomBytes(8).toString('hex')}`); }
async function cleanup(directory: string) {
  // Delete only the exact generated task child; never its shared parent.
  assert.ok([path.resolve(base), await realpath(base)].includes(path.dirname(path.resolve(directory))));
  assert.match(path.basename(directory), /^test-[a-f0-9]{16}$/);
  await rm(directory, { recursive: true, force: true });
}

test('private state accepts only a dedicated task child, fresh ownership, marker and matching loopback DB', async () => {
  for (const raw of ['', '.', os.homedir(), base, path.join(base, '../other'), path.join(base, 'task/child')]) assert.throws(() => privateStateDirectory(raw));
  const directory = fresh();
  try {
    const physical = await preparePrivateState(directory);
    assert.equal(physical, await realpath(directory));
    assert.equal(privateStateDirectory(physical), physical);
    await assert.rejects(preparePrivateState(directory)); // Never silently repair/overwrite.
    const url = 'postgresql://TEST_ONLY@127.0.0.1:54321/goease_local';
    await writeFile(path.join(directory, 'database.json'), JSON.stringify({ runtimeUrl: url }), { mode: 0o600 });
    assert.equal(await verifyPrivateState(directory), physical);
    await verifyTrialDatabase(directory, url);
    await assert.rejects(verifyTrialDatabase(directory, 'postgresql://TEST_ONLY@127.0.0.1:54322/goease_local'));
    await writeFile(path.join(directory, '.goease-private-state'), 'wrong');
    await assert.rejects(verifyPrivateState(directory), /marker/);
    assert.equal(await readFile(path.join(directory, 'database.json'), 'utf8'), JSON.stringify({ runtimeUrl: url }));
  } finally { await cleanup(directory); }
});

test('broad ACL/mode is refused without repairing existing state; only the owned fixture ACL is altered', async () => {
  let directory = fresh();
  try {
    directory = await preparePrivateState(directory);
    if (process.platform === 'win32') {
      await execute('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', String.raw`
$ErrorActionPreference='Stop'
Import-Module (Join-Path $PSHOME 'Modules\Microsoft.PowerShell.Security\Microsoft.PowerShell.Security.psd1') -Force
$acl=Get-Acl -LiteralPath $env:GOEASE_TEST_ACL_TARGET
$sid=New-Object System.Security.Principal.SecurityIdentifier('S-1-5-32-545')
$rule=New-Object System.Security.AccessControl.FileSystemAccessRule($sid,'Read','ContainerInherit,ObjectInherit','None','Allow')
$acl.AddAccessRule($rule)
Set-Acl -LiteralPath $env:GOEASE_TEST_ACL_TARGET -AclObject $acl
`], { env: { ...process.env, GOEASE_TEST_ACL_TARGET: directory }, windowsHide: true, timeout: 15_000 });
    } else await chmod(directory, 0o755);
    await assert.rejects(verifyPrivateState(directory), /ACL|mode0700/);
    await assert.rejects(verifyPrivateState(directory), /ACL|mode0700/);
  } finally { await cleanup(directory); }
});

test('private-state symlink/junction target is rejected without changing the destination', async () => {
  let target = fresh(); const link = fresh();
  try {
    target = await preparePrivateState(target);
    await mkdir(path.dirname(link), { recursive: true });
    await symlink(target, link, process.platform === 'win32' ? 'junction' : 'dir');
    await assert.rejects(verifyPrivateState(link), /symlinks|junctions|physical/);
    assert.equal(await verifyPrivateState(target), await realpath(target));
  } finally { await cleanup(link); await cleanup(target); }
});

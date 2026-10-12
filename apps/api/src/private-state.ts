import { execFile } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { lstat, mkdir, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const marker = '.goease-private-state';
const kind = 'goease-local-db-v1';

export function privateStateDirectory(raw: string) {
  if (!path.isAbsolute(raw) || raw !== raw.trim()) throw new Error('Absolute private GoEase state path required');
  const directory = path.resolve(raw);
  const base = process.platform === 'win32'
    ? path.join(process.env['LOCALAPPDATA'] ?? '', 'GoEase', 'local-db')
    : path.join(os.tmpdir(), 'goease-private-local-db');
  let physicalBase = base;
  try { physicalBase = realpathSync.native(base); } catch { /* A fresh namespace does not exist yet. */ }
  const relative = [base, physicalBase].map(root => path.relative(root, directory));
  // Exactly one task child; never change ACLs on a shared parent/user directory.
  if (!path.isAbsolute(base) || !relative.some(child => /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(child)) || /[/\\]OneDrive(?: - [^/\\]+)?(?:[/\\]|$)/i.test(directory)) throw new Error('Use an owned task directory beneath the GoEase private local-db root');
  return directory;
}

async function noLinks(directory: string) {
  let current = directory;
  for (;;) {
    try {
      if ((await lstat(current)).isSymbolicLink()) throw new Error('Private state cannot use symlinks or junctions');
      // MSIX can virtualize a LocalAppData path without a reparse point. Inspect
      // links explicitly and return realpath to the caller after provisioning.
      if (process.platform !== 'win32' && path.resolve(await realpath(current)) !== path.resolve(current)) throw new Error('Private state physical path differs');
    } catch (error) { if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')) throw error; }
    const parent = path.dirname(current); if (parent === current) return; current = parent;
  }
}

const aclScript = String.raw`
$ErrorActionPreference='Stop'
$target=$env:GOEASE_PRIVATE_ACL_TARGET
$me=[System.Security.Principal.WindowsIdentity]::GetCurrent().User
$trusted=@($me.Value,'S-1-5-18','S-1-5-32-544')
$phase='MODULE'
try {
# A Node child can inherit PowerShell Core's module search path. Select the
# Windows PowerShell built-in ACL cmdlets explicitly, without global changes.
Import-Module (Join-Path $PSHOME 'Modules\Microsoft.PowerShell.Security\Microsoft.PowerShell.Security.psd1') -Force
$phase='CREATE'
if($env:GOEASE_PRIVATE_ACL_CREATE -eq '1') {
  $acl=New-Object System.Security.AccessControl.DirectorySecurity
  $acl.SetAccessRuleProtection($true,$false)
  foreach($id in $trusted) {
    $sid=New-Object System.Security.Principal.SecurityIdentifier($id)
    $rule=New-Object System.Security.AccessControl.FileSystemAccessRule($sid,'FullControl','ContainerInherit,ObjectInherit','None','Allow')
    $acl.AddAccessRule($rule)
  }
  $phase='SET'
  Set-Acl -LiteralPath $target -AclObject $acl
}
$phase='ROOT'
$rootAcl=Get-Acl -LiteralPath $target
if(!$rootAcl.AreAccessRulesProtected) { throw 'Unprotected task root' }
$phase='ITEMS'
$items=@(Get-Item -LiteralPath $target -Force)+@(Get-ChildItem -LiteralPath $target -Force -Recurse)
foreach($item in $items) {
  $phase='LINK'
  if($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) { throw 'Reparse point refused' }
  $phase='OWNER'
  $acl=Get-Acl -LiteralPath $item.FullName
  $owner=$acl.GetOwner([System.Security.Principal.SecurityIdentifier]).Value
  if($trusted -notcontains $owner) { throw 'Untrusted owner' }
  $ownerFull=$false
  foreach($rule in $acl.Access) {
    $phase='RULE'
    $sid=$rule.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value
    if($rule.AccessControlType -eq 'Allow' -and $trusted -notcontains $sid) { throw 'Broad ACL refused' }
    if($sid -eq $me.Value -and $rule.AccessControlType -eq 'Allow' -and ($rule.FileSystemRights -band [System.Security.AccessControl.FileSystemRights]::FullControl) -eq [System.Security.AccessControl.FileSystemRights]::FullControl) { $ownerFull=$true }
  }
  $phase='ACCESS'
  if(!$ownerFull) { throw 'Current owner access missing' }
}
} catch { [Console]::Error.WriteLine('GOEASE_ACL_'+$phase+'_'+$_.Exception.GetType().Name); exit 1 }
`;

async function permissions(directory: string, create = false) {
  if (process.platform === 'win32') {
    try {
      await execute(path.join(process.env['SystemRoot'] ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'), ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', aclScript], {
        env: { ...process.env, GOEASE_PRIVATE_ACL_TARGET: directory, GOEASE_PRIVATE_ACL_CREATE: create ? '1' : '0' },
        windowsHide: true, timeout: 30_000, maxBuffer: 4096,
      });
    } catch (error) {
      const diagnostic = error && typeof error === 'object' && 'stderr' in error && typeof error.stderr === 'string' ? error.stderr.match(/GOEASE_ACL_(?:MODULE|CREATE|SET|ROOT|ITEMS|LINK|OWNER|RULE|ACCESS)_[A-Za-z]{1,64}\b/)?.[0] : undefined;
      // eslint-disable-next-line preserve-caught-error -- A child stderr/cause can expose private paths; retain only the fixed diagnostic.
      throw new Error(`Private GoEase Windows ACL verification failed (${diagnostic ?? 'GOEASE_ACL_UNAVAILABLE'}); no secrets logged`);
    }
  } else {
    const info = await stat(directory);
    if ((info.mode & 0o077) !== 0 || info.uid !== process.getuid?.()) throw new Error('Private GoEase directory must be owned by this user and mode0700');
  }
}

export async function preparePrivateState(raw: string) {
  const directory = privateStateDirectory(raw);
  await noLinks(directory);
  await mkdir(path.dirname(directory), { recursive: true, mode: 0o700 });
  await noLinks(path.dirname(directory));
  // Fresh directory only: never chmod/change ACLs on existing user data.
  await mkdir(directory, { mode: 0o700 });
  const physical = await realpath(directory);
  await noLinks(physical);
  await permissions(physical, true);
  await writeFile(path.join(physical, marker), kind, { mode: 0o600, flag: 'wx' });
  await verifyPrivateState(physical);
  return physical;
}

export async function verifyPrivateState(raw: string) {
  const directory = privateStateDirectory(raw);
  await noLinks(directory);
  const physical = await realpath(directory);
  await noLinks(physical);
  await permissions(physical);
  if (await readFile(path.join(physical, marker), 'utf8') !== kind) throw new Error('Private GoEase task marker missing or invalid');
  return physical;
}

export async function verifyTrialDatabase(raw: string, databaseUrl: string) {
  const directory = await verifyPrivateState(raw);
  const record: unknown = JSON.parse(await readFile(path.join(directory, 'database.json'), 'utf8'));
  if (!record || typeof record !== 'object' || !('runtimeUrl' in record) || record.runtimeUrl !== databaseUrl) throw new Error('Trial runtime must use its owned private database configuration');
  const url = new URL(databaseUrl);
  if (url.hostname !== '127.0.0.1' || url.pathname !== '/goease_local') throw new Error('Trial PostgreSQL must stay isolated on loopback');
}

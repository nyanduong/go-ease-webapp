import { lstat, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export const assetId =
  /^[a-f0-9]{24}-[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\.jpg$/;
export const PROFILE_MEDIA_GRACE_MS = 24 * 60 * 60 * 1000;
export const PROFILE_MEDIA_FILE_LIMIT = 50;
export const PROFILE_MEDIA_BYTE_LIMIT = 50 * 184320;
const markerSuffix = '.pending.json';

// Only new uploads with our versioned receipt may be reclaimed. Legacy files are preserved.
export async function trackProfileUpload(folder: string, id: string, now = Date.now()) {
  await writeFile(join(folder, id + markerSuffix), JSON.stringify({ version: 1, createdAt: now }), {
    flag: 'wx',
    mode: 0o600,
  });
}

function referencedAssets(metadata: Record<string, unknown> | undefined): Set<string> | null {
  // A missing metadata object is not evidence that no saved profile exists.
  if (!metadata) return null;
  const profile = metadata.goease_profile;
  if (profile === undefined) return new Set();
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) return null;
  const refs = new Set<string>();
  for (const key of ['avatarUrl', 'coverUrl']) {
    const value = (profile as Record<string, unknown>)[key];
    if (value === null || value === undefined) continue;
    if (typeof value !== 'string') return null;
    try {
      const path = new URL(value).pathname;
      const id = path.slice('/v1/profile-media/'.length);
      if (path.startsWith('/v1/profile-media/') && assetId.test(id)) refs.add(id);
    } catch {
      return null;
    }
  }
  return refs;
}

export async function inspectProfileUploads(
  folder: string,
  owner: string,
  metadata: Record<string, unknown> | undefined,
  dryRun = true,
  now = Date.now(),
) {
  const refs = referencedAssets(metadata);
  let names: string[];
  try {
    names = await readdir(folder);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') names = [];
    else throw error;
  }
  let files = 0,
    bytes = 0,
    eligible = 0,
    removed = 0;
  for (const id of names) {
    if (!assetId.test(id) || !id.startsWith(owner + '-')) continue;
    const path = join(folder, id);
    const stat = await lstat(path);
    // Never follow symlinks, or interpret another account's files as this owner's quota.
    if (!stat.isFile()) continue;
    files++;
    bytes += stat.size;
    const marker = join(folder, id + markerSuffix);
    if (!refs || refs.has(id)) continue;
    try {
      const markerStat = await lstat(marker);
      if (!markerStat.isFile() || markerStat.size > 256) continue;
      const receipt = JSON.parse(await readFile(marker, 'utf8')) as {
        version?: unknown;
        createdAt?: unknown;
      };
      if (
        receipt.version !== 1 ||
        typeof receipt.createdAt !== 'number' ||
        !Number.isFinite(receipt.createdAt) ||
        receipt.createdAt < 0 ||
        now - Math.max(receipt.createdAt, stat.mtimeMs) < PROFILE_MEDIA_GRACE_MS
      )
        continue;
      eligible++;
      if (!dryRun) {
        await unlink(path);
        await unlink(marker);
        removed++;
        files--;
        bytes -= stat.size;
      }
    } catch (error) {
      // Unknown/corrupt receipts are preserved; actual storage errors must remain visible.
      if (!(error instanceof SyntaxError) && (error as NodeJS.ErrnoException).code !== 'ENOENT')
        throw error;
    }
  }
  return { files, bytes, eligible, removed, dryRun, referencesVerified: refs !== null };
}

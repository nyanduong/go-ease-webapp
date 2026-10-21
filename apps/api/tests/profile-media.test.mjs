import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile, utimes, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApi } from '../dist/bootstrap.js';
import { validateProfileJpeg } from '../dist/modules/profile-media/profile-media.module.js';
import {
  inspectProfileUploads,
  trackProfileUpload,
  PROFILE_MEDIA_GRACE_MS,
} from '../dist/modules/profile-media/profile-media-storage.js';

test('verified photo uploads persist across restart, use opaque URLs and reject invalid/oversized files', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'goease-photo-'));
  const jpeg = await readFile(new URL('./fixtures/profile.jpg', import.meta.url));
  const authUrl = 'https://abcdefghijklmnopqrst.supabase.co';
  const id = '12345678-1234-4234-8234-123456789abc';
  const now = Math.floor(Date.now() / 1000);
  const enc = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const token = `${enc({ alg: 'ES256' })}.${enc({ sub: id, iss: authUrl + '/auth/v1', aud: 'authenticated', role: 'authenticated', iat: now, exp: now + 3600 })}.fixture_signature`;
  const env = {
    AUTH_ENABLED: 'true',
    AUTH_GOOGLE_ONLY: 'false',
    SUPABASE_AUTH_URL: authUrl,
    SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_offline_fixture_00000000',
    PROFILE_MEDIA_DIR: folder,
  };
  const start = async () => {
    const { app } = await createApi(
      env,
      undefined,
      {},
      {
        fetcher: async () =>
          new Response(JSON.stringify({ id, aud: 'authenticated', role: 'authenticated' })),
      },
    );
    await app.listen(0, '127.0.0.1');
    return { app, base: await app.getUrl() };
  };
  let server;
  try {
    server = await start();
    const upload = (body, authorized = true) =>
      fetch(server.base + '/v1/profile-media', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(authorized ? { authorization: 'Bearer ' + token } : {}),
        },
        body: JSON.stringify(body),
      });
    assert.equal((await upload({ jpeg: jpeg.toString('base64') }, false)).status, 401);
    assert.equal((await upload({ jpeg: Buffer.from('<svg/>').toString('base64') })).status, 400);
    assert.equal((await upload({ jpeg: jpeg.toString('base64'), owner: 'other' })).status, 400);
    assert.equal((await upload({ jpeg: 'A'.repeat(280000) })).status, 413);
    assert(validateProfileJpeg(jpeg));
    assert.equal(validateProfileJpeg(Buffer.alloc(200000)), false);
    const result = await upload({ jpeg: jpeg.toString('base64') });
    assert.equal(result.status, 201);
    const { path } = await result.json();
    assert.match(path, /^\/v1\/profile-media\/[a-f0-9]{24}-[a-f0-9-]{36}\.jpg$/);
    assert(!path.includes(id));
    const cleanup = await fetch(server.base + '/v1/profile-media/cleanup', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token },
      body: '{}',
    });
    assert.equal(cleanup.status, 201);
    assert.deepEqual(await cleanup.json(), {
      apiVersion: '1',
      files: 1,
      bytes: jpeg.length,
      eligible: 0,
      removed: 0,
      dryRun: true,
      referencesVerified: false,
    });
    assert.equal(
      (
        await fetch(server.base + '/v1/profile-media/cleanup', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{}',
        })
      ).status,
      401,
    );
    await server.app.close();
    server = await start();
    const image = await fetch(server.base + path);
    assert.equal(image.status, 200);
    assert.equal(image.headers.get('content-type'), 'image/jpeg');
    assert.equal(image.headers.get('x-content-type-options'), 'nosniff');
    assert.deepEqual(Buffer.from(await image.arrayBuffer()), jpeg);
    assert.equal((await fetch(server.base + '/v1/profile-media/not-an-asset')).status, 404);
    const owner = path.split('/').at(-1).slice(0, 24);
    for (let i = 0; i < 49; i++) {
      await writeFile(
        join(folder, `${owner}-00000000-0000-4000-8000-${String(i).padStart(12, '0')}.jpg`),
        jpeg,
      );
    }
    assert.equal((await upload({ jpeg: jpeg.toString('base64') })).status, 429);
    // Reaching quota never deletes legacy or saved account files to make room.
    assert.equal((await fetch(server.base + path)).status, 200);
  } finally {
    await server?.app.close();
    assert(folder.startsWith(join(tmpdir(), 'goease-photo-')));
    await rm(folder, { recursive: true, force: true });
  }
});

test('cleanup requires trusted references, receipts, ownership and grace; dry run preserves every file', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'goease-photo-lifecycle-'));
  const owner = 'a'.repeat(24),
    other = 'b'.repeat(24);
  const now = Date.now(),
    old = now - PROFILE_MEDIA_GRACE_MS - 1000;
  const ids = Array.from(
    { length: 7 },
    (_, i) =>
      `${i === 5 ? other : owner}-00000000-0000-4000-8000-${String(i).padStart(12, '0')}.jpg`,
  );
  try {
    for (const [i, id] of ids.entries()) {
      await writeFile(join(folder, id), 'fixture');
      await utimes(join(folder, id), old / 1000, old / 1000);
      if (i !== 2) await trackProfileUpload(folder, id, i === 3 ? now : old);
    }
    // 0 abandoned; 1 saved; 2 legacy; 3 still within grace; 4 malformed; 5 another owner; 6 active write.
    await writeFile(join(folder, ids[4] + '.pending.json'), '{broken');
    await utimes(join(folder, ids[6]), now / 1000, now / 1000);
    const metadata = {
      goease_profile: { avatarUrl: 'https://api.example/v1/profile-media/' + ids[1] },
    };
    assert.equal((await inspectProfileUploads(folder, owner, undefined, false, now)).removed, 0);
    assert.equal(
      (
        await inspectProfileUploads(
          folder,
          owner,
          { goease_profile: { coverUrl: 123 } },
          false,
          now,
        )
      ).removed,
      0,
    );
    const preview = await inspectProfileUploads(folder, owner, metadata, true, now);
    assert.equal(preview.eligible, 1);
    assert.equal(preview.files, 6);
    assert.equal(preview.bytes, 42);
    for (const id of ids) await access(join(folder, id));
    const cleaned = await inspectProfileUploads(folder, owner, metadata, false, now);
    assert.equal(cleaned.removed, 1);
    assert.equal(cleaned.files, 5);
    await assert.rejects(access(join(folder, ids[0])), { code: 'ENOENT' });
    for (const id of ids.slice(1)) await access(join(folder, id));
    assert.equal((await inspectProfileUploads(folder, owner, metadata, false, now)).removed, 0);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

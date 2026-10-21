import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApi } from '../dist/bootstrap.js';
import { validateProfileJpeg } from '../dist/modules/profile-media/profile-media.module.js';

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
    await server.app.close();
    server = await start();
    const image = await fetch(server.base + path);
    assert.equal(image.status, 200);
    assert.equal(image.headers.get('content-type'), 'image/jpeg');
    assert.equal(image.headers.get('x-content-type-options'), 'nosniff');
    assert.deepEqual(Buffer.from(await image.arrayBuffer()), jpeg);
    assert.equal((await fetch(server.base + '/v1/profile-media/not-an-asset')).status, 404);
  } finally {
    await server?.app.close();
    assert(folder.startsWith(join(tmpdir(), 'goease-photo-')));
    await rm(folder, { recursive: true, force: true });
  }
});

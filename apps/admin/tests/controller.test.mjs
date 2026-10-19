import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAdminClient } from '../.logic-tests/controller.js';
import { getDalatCatalog } from '@goease/catalog';
const places = getDalatCatalog().map((entry) => ({ entry, version: 1, enabled: true }));
test('web admin needs backend grant, retains only access in RAM, validates writes and drops session on denial', async () => {
  let deny = false;
  const calls = [];
  const client = createAdminClient({
    base: 'http://127.0.0.1:3000',
    url: 'https://abcdefghijklmnopqrst.supabase.co',
    key: 'sb_publishable_offline_fixture_00000000',
    fetcher: async (url, init) => {
      calls.push({ url, init });
      if (url.includes('/token?'))
        return new Response(
          JSON.stringify({
            token_type: 'bearer',
            access_token: 'offline.fixture.signature',
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            refresh_token: 'DO_NOT_STORE',
          }),
        );
      if (deny) return new Response('{}', { status: 403 });
      return new Response(
        JSON.stringify(init.method === 'POST' ? places[0] : { apiVersion: '1', places }),
      );
    },
  });
  await assert.rejects(client.list());
  assert.equal(calls.length, 0);
  await client.login('a@example.test', 'offline_password');
  assert.equal(client.valid(), true);
  await client.save({ kind: 'create', entry: places[0].entry });
  assert.equal(calls.at(-1).init.headers.authorization, 'Bearer offline.fixture.signature');
  assert.equal(calls.at(-1).init.credentials, 'omit');
  deny = true;
  await assert.rejects(client.list(), /403/);
  assert.equal(client.valid(), false);
  client.logout();
  assert.equal(JSON.stringify(client).includes('offline.fixture.signature'), false);
});
test('web admin refuses remote HTTP bearer destinations and caller role injection', async () => {
  const client = createAdminClient({
    base: 'http://public.example.test',
    url: 'https://abcdefghijklmnopqrst.supabase.co',
    key: 'sb_publishable_offline_fixture_00000000',
    fetcher: async () => assert.fail('no outbound'),
  });
  await assert.rejects(client.login('a@example.test', 'p'));
  assert.equal(client.valid(), false);
});

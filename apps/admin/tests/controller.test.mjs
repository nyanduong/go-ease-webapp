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
        JSON.stringify(
          init.method === 'POST' ? places[0] : { apiVersion: '1', places, nextCursor: null },
        ),
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

test('admin paginates requests and expires RAM access before issuing an authenticated request', async () => {
  let clock = 1_000_000;
  const calls = [];
  const client = createAdminClient({
    base: 'http://127.0.0.1:3000',
    url: 'https://abcdefghijklmnopqrst.supabase.co',
    key: 'sb_publishable_offline_fixture_00000000',
    now: () => clock,
    fetcher: async (url) => {
      calls.push(url);
      if (url.includes('/token?'))
        return Response.json({
          token_type: 'bearer',
          access_token: 'offline.fixture.signature',
          expires_at: 1100,
        });
      return Response.json({ apiVersion: '1', places: [], nextCursor: null });
    },
  });
  await client.login('admin@example.test', 'fixture');
  assert.match(calls.at(-1), /limit=20$/);
  await client.list('place-020');
  assert.match(calls.at(-1), /limit=20&after=place-020$/);
  const count = calls.length;
  clock = 1_100_000;
  assert.equal(client.valid(), false);
  await assert.rejects(client.list(), /hết hạn/);
  assert.equal(calls.length, count);
});

test('CMS client validates publication, paginates and sends optimistic version using verified RAM auth', async () => {
  const calls = [];
  const entry = {
    id: 'cms-fixture',
    kind: 'destination',
    title: 'Điểm đến fixture',
    summary: 'Mô tả',
    body: 'Nội dung có nguồn',
    status: 'draft',
    destinationId: null,
    categoryIds: [],
    image: null,
    address: 'Đà Lạt',
    coordinates: { latitude: 11.94, longitude: 108.45 },
    destination: {
      id: 'cms-fixture',
      name: 'Điểm đến fixture',
      countryCode: 'VN',
      timeZone: 'Asia/Ho_Chi_Minh',
      currency: 'VND',
      center: { latitude: 11.94, longitude: 108.45 },
      radiusKm: 35,
    },
    sources: [{ title: 'Nguồn fixture', url: 'https://example.test/source' }],
  };
  const record = (value, version = 1) => ({
    entry: value,
    version,
    updatedAt: '2026-10-21T00:00:00.000Z',
  });
  const client = createAdminClient({
    base: 'http://127.0.0.1:3000',
    url: 'https://abcdefghijklmnopqrst.supabase.co',
    key: 'sb_publishable_offline_fixture_00000000',
    fetcher: async (url, init) => {
      calls.push({ url, init });
      if (url.includes('/token?'))
        return Response.json({
          token_type: 'bearer',
          access_token: 'offline.fixture.signature',
          expires_at: Math.floor(Date.now() / 1000) + 3600,
        });
      if (url.includes('/admin/catalog'))
        return Response.json({ apiVersion: '1', places: [], nextCursor: null });
      if (init.method === 'POST') return Response.json(record(JSON.parse(init.body)));
      if (init.method === 'PUT') return Response.json(record(JSON.parse(init.body).entry, 2));
      return Response.json({ apiVersion: '1', items: [record(entry)], nextCursor: null });
    },
  });
  await client.login('admin@example.test', 'fixture');
  await client.listContent({ kind: 'destination', after: 'previous-id' });
  assert.match(calls.at(-1).url, /limit=50&after=previous-id&kind=destination/);
  await client.saveContent(entry);
  assert.equal(JSON.parse(calls.at(-1).init.body).status, 'draft');
  await client.saveContent({ ...entry, status: 'published' }, 1);
  assert.equal(JSON.parse(calls.at(-1).init.body).expectedVersion, 1);
  assert.equal(calls.at(-1).init.headers.authorization, 'Bearer offline.fixture.signature');
  const count = calls.length;
  await assert.rejects(client.saveContent({ ...entry, status: 'published', sources: [] }));
  assert.equal(calls.length, count);
});

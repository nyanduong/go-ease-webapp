import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { createApi } from '../dist/bootstrap.js';
import { contentPageSchema, contentRecordSchema, getDestination } from '@goease/contracts';
import { isolatedUrl } from '../scripts/db-tools.mjs';
import { initialContent, originalContent, seedContent } from '../scripts/content-seed.mjs';
import { checkCmsDatabaseBrowser } from '../../web/tests/cms-db-browser.mjs';

if (process.env.GOEASE_DB_TEST_ACK !== 'isolated') throw Error('Isolated real database required');
const adminUrl = process.env.GOEASE_DB_TEST_ADMIN_URL;
const runtimeUrl = process.env.GOEASE_DB_TEST_RUNTIME_URL;
isolatedUrl(adminUrl, 'test');
isolatedUrl(runtimeUrl, 'test');
const admin = new Pool({ connectionString: adminUrl, max: 1 });
after(() => admin.end());
const project = 'https://abcdefghijklmnopqrst.supabase.co',
  issuer = project + '/auth/v1';

function token(sub) {
  const now = Math.floor(Date.now() / 1000);
  const enc = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${enc({ alg: 'HS256' })}.${enc({ sub, iss: issuer, aud: 'authenticated', role: 'authenticated', iat: now, exp: now + 3600 })}.offline_fixture_signature`;
}
function entry(id, kind = 'destination', patch = {}) {
  return {
    id,
    kind,
    title: id,
    summary: 'Isolated editorial fixture summary',
    body: 'Fixture editorial body with source.',
    status: 'draft',
    destinationId: null,
    categoryIds: [],
    image: null,
    address: 'Fixture address',
    coordinates: { latitude: 11.94, longitude: 108.45 },
    destination: kind === 'destination' ? { ...getDestination('da-lat'), id, name: id } : null,
    sources: [{ title: 'Offline fixture source', url: 'https://example.test/editorial-fixture' }],
    ...patch,
  };
}
async function result(response, status = 200) {
  assert.equal(response.status, status);
  return response.json();
}
async function failure(response, status, code) {
  const body = await result(response, status);
  assert.equal(body.error.code, code);
  for (const secret of [runtimeUrl, adminUrl, 'offline_fixture_signature'])
    assert(!JSON.stringify(body).includes(secret));
}
async function fixture(run) {
  const A = randomUUID(),
    B = randomUUID(),
    prefix = 'cms-' + randomUUID();
  const tokens = { A: token(A), B: token(B) };
  let authClock = Date.now();
  const { app } = await createApi(
    {
      TRIPS_ENABLED: 'true',
      CATALOG_ADMIN_ENABLED: 'true',
      DATABASE_URL: runtimeUrl,
      AUTH_ENABLED: 'true',
      AUTH_GOOGLE_ONLY: 'false',
      AUTH_TIMEOUT_MS: '1000',
      API_REQUEST_TIMEOUT_MS: '8000',
      API_CORS_ORIGINS: 'http://127.0.0.1:4197',
      SUPABASE_AUTH_URL: project,
      SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_offline_fixture_00000000',
    },
    undefined,
    {},
    {
      now: () => authClock,
      fetcher: async (_url, options) => {
        const who = Object.keys(tokens).find(
          (key) => options.headers.authorization === 'Bearer ' + tokens[key],
        );
        return new Response(
          JSON.stringify(
            who ? { id: who === 'A' ? A : B, aud: 'authenticated', role: 'authenticated' } : {},
          ),
          { status: who ? 200 : 401 },
        );
      },
    },
  );
  await app.listen(0, '127.0.0.1');
  const base = await app.getUrl();
  const request = (who, method, path, body, extra = {}) =>
    fetch(base + path, {
      method,
      headers: {
        ...(who ? { authorization: 'Bearer ' + tokens[who] } : {}),
        'content-type': 'application/json',
        ...extra,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  const create = async (value) =>
    contentRecordSchema.parse(
      await result(await request('A', 'POST', '/v1/admin/content', value), 201),
    );
  const update = async (record, patch) =>
    contentRecordSchema.parse(
      await result(
        await request('A', 'PUT', '/v1/admin/content/' + record.entry.id, {
          entry: { ...record.entry, ...patch },
          expectedVersion: record.version,
        }),
      ),
    );
  try {
    await admin.query('INSERT INTO "CatalogAdmin" (issuer,subject) VALUES ($1,$2::uuid)', [
      issuer,
      A,
    ]);
    await run({ A, B, prefix, request, create, update, base, token: tokens.A, advanceAuthWindow: () => { authClock += 60000; } });
  } finally {
    await app.close();
  }
}

test('editorial publication requires current admin permission, complete sources and optimistic version', () =>
  fixture(async ({ A, prefix, request, create, update }) => {
    const id = prefix + '-destination';
    await failure(await request(null, 'GET', '/v1/admin/content'), 401, 'AUTH_INVALID');
    await failure(
      await request('B', 'POST', '/v1/admin/content', entry(id), { 'x-role': 'admin' }),
      403,
      'ADMIN_FORBIDDEN',
    );
    let saved = await create(entry(id));
    assert.equal(saved.version, 1);
    await failure(await request(null, 'GET', '/v1/content/' + id), 404, 'NOT_FOUND');
    await failure(
      await request('A', 'PUT', '/v1/admin/content/' + id, {
        entry: { ...saved.entry, status: 'published', sources: [] },
        expectedVersion: 1,
      }),
      400,
      'BAD_REQUEST',
    );
    await failure(
      await request('A', 'PUT', '/v1/admin/content/' + id, {
        entry: {
          ...saved.entry,
          status: 'published',
          destination: {
            ...saved.entry.destination,
            countryCode: 'JP',
            center: { latitude: 35.6762, longitude: 139.6503 },
          },
        },
        expectedVersion: 1,
      }),
      400,
      'BAD_REQUEST',
    );
    saved = await update(saved, { status: 'published' });
    assert.equal(saved.version, 2);
    assert.deepEqual(await result(await request(null, 'GET', '/v1/content/' + id)), saved);
    await failure(
      await request('A', 'PUT', '/v1/admin/content/' + id, {
        entry: { ...saved.entry, title: 'Stale overwrite' },
        expectedVersion: 1,
      }),
      409,
      'CATALOG_CONFLICT',
    );
    await failure(
      await request('A', 'POST', '/v1/admin/content', saved.entry),
      409,
      'CATALOG_CONFLICT',
    );
    await failure(
      await request('A', 'PUT', '/v1/admin/content/' + id, {
        entry: { ...saved.entry, id: prefix + '-other' },
        expectedVersion: 2,
      }),
      400,
      'BAD_REQUEST',
    );
    await admin.query(
      'UPDATE "CatalogAdmin" SET enabled=false WHERE issuer=$1 AND subject=$2::uuid',
      [issuer, A],
    );
    await failure(
      await request('A', 'PUT', '/v1/admin/content/' + id, {
        entry: saved.entry,
        expectedVersion: 2,
      }),
      403,
      'ADMIN_FORBIDDEN',
    );
  }));

test('editorial references reject missing/wrong/unpublished parents and categories; hiding parents hides children and favorites', () =>
  fixture(async ({ B, prefix, request, create, update }) => {
    let destination = await create(entry(prefix + '-destination'));
    let category = await create(entry(prefix + '-category', 'category'));
    const place = entry(prefix + '-place', 'place', {
      destinationId: destination.entry.id,
      status: 'published',
    });
    await failure(await request('A', 'POST', '/v1/admin/content', place), 400, 'BAD_REQUEST');
    await failure(
      await request('A', 'POST', '/v1/admin/content', {
        ...place,
        destinationId: prefix + '-missing',
      }),
      400,
      'BAD_REQUEST',
    );
    await failure(
      await request('A', 'POST', '/v1/admin/content', {
        ...place,
        destinationId: category.entry.id,
      }),
      400,
      'BAD_REQUEST',
    );
    destination = await update(destination, { status: 'published' });
    await failure(
      await request('A', 'POST', '/v1/admin/content', {
        ...place,
        categoryIds: [category.entry.id],
      }),
      400,
      'BAD_REQUEST',
    );
    await failure(
      await request('A', 'POST', '/v1/admin/content', {
        ...place,
        categoryIds: [prefix + '-missing'],
      }),
      400,
      'BAD_REQUEST',
    );
    category = await update(category, { status: 'published' });
    const savedPlace = await create({ ...place, categoryIds: [category.entry.id] });
    await failure(
      await request('A', 'POST', '/v1/admin/content', {
        ...place,
        id: prefix + '-duplicate-tags',
        categoryIds: [category.entry.id, category.entry.id],
      }),
      400,
      'BAD_REQUEST',
    );
    const tagged = contentPageSchema.parse(
      await result(await request(null, 'GET', '/v1/content?categoryId=' + category.entry.id)),
    );
    assert.deepEqual(
      tagged.items.map((item) => item.entry.id),
      [savedPlace.entry.id],
    );
    await result(await request('B', 'PUT', '/v1/favorites/' + savedPlace.entry.id));
    await update(destination, { status: 'hidden' });
    await failure(
      await request(null, 'GET', '/v1/content/' + savedPlace.entry.id),
      404,
      'NOT_FOUND',
    );
    assert.equal(
      (
        await result(
          await request(null, 'GET', '/v1/content?destinationId=' + destination.entry.id),
        )
      ).items.length,
      0,
    );
    assert.equal((await result(await request('B', 'GET', '/v1/favorites'))).items.length, 0);
    await failure(
      await request('B', 'PUT', '/v1/favorites/' + savedPlace.entry.id),
      404,
      'NOT_FOUND',
    );
    const rows = await admin.query(
      'SELECT "contentId" FROM "ContentFavorite" WHERE "ownerSubject"=$1::uuid',
      [B],
    );
    assert.equal(rows.rowCount, 1);
  }));

test('editorial keyset pagination exceeds twenty records without duplicates and validates bounds', () =>
  fixture(async ({ prefix, request, create }) => {
    const destination = await create(
      entry(prefix + '-destination', 'destination', { status: 'published' }),
    );
    const expected = [];
    for (let i = 0; i < 23; i++) {
      const id = prefix + '-place-' + String(i).padStart(2, '0');
      expected.push(id);
      await create(
        entry(id, 'place', { destinationId: destination.entry.id, status: 'published' }),
      );
    }
    const first = contentPageSchema.parse(
      await result(
        await request(null, 'GET', '/v1/content?kind=place&destinationId=' + destination.entry.id),
      ),
    );
    assert.equal(first.items.length, 20);
    assert.equal(first.nextCursor, expected[19]);
    const next = contentPageSchema.parse(
      await result(
        await request(
          null,
          'GET',
          '/v1/content?kind=place&destinationId=' +
            destination.entry.id +
            '&after=' +
            first.nextCursor,
        ),
      ),
    );
    assert.equal(next.nextCursor, null);
    assert.deepEqual(
      [...first.items, ...next.items].map((item) => item.entry.id),
      expected,
    );
    const managed = contentPageSchema.parse(
      await result(
        await request('A', 'GET', '/v1/admin/content?kind=place&q=' + prefix + '&limit=50'),
      ),
    );
    assert.equal(managed.items.length, 23);
    for (const query of [
      'limit=0',
      'limit=51',
      'limit=10000',
      'after=../bad',
      'ownerSubject=forged',
    ])
      await failure(await request(null, 'GET', '/v1/content?' + query), 400, 'BAD_REQUEST');
  }));

test('favorites reopen idempotently and PostgreSQL RLS isolates user and issuer even outside API filters', () =>
  fixture(async ({ A, B, prefix, request, create }) => {
    const saved = await create(
      entry(prefix + '-destination', 'destination', { status: 'published' }),
    );
    const path = '/v1/favorites/' + saved.entry.id;
    await failure(await request(null, 'PUT', path), 401, 'AUTH_INVALID');
    await result(await request('A', 'PUT', path));
    await result(await request('A', 'PUT', path));
    assert.deepEqual(
      (await result(await request('A', 'GET', '/v1/favorites'))).items.map((item) => item.entry.id),
      [saved.entry.id],
    );
    assert.equal((await result(await request('B', 'GET', '/v1/favorites'))).items.length, 0);
    await result(await request('B', 'DELETE', path));
    assert.equal((await result(await request('A', 'GET', '/v1/favorites'))).items.length, 1);
    const pool = new Pool({ connectionString: runtimeUrl, max: 1 });
    const client = await pool.connect();
    try {
      assert.equal((await client.query('SELECT * FROM "ContentFavorite"')).rowCount, 0);
      await client.query('BEGIN');
      const context = (projectIssuer, subject) =>
        client.query(
          "SELECT set_config('goease.issuer',$1,true),set_config('goease.subject',$2,true)",
          [projectIssuer, subject],
        );
      await context(issuer, A);
      assert.equal((await client.query('SELECT * FROM "ContentFavorite"')).rowCount, 1);
      await context(issuer, B);
      assert.equal(
        (await client.query('DELETE FROM "ContentFavorite" WHERE "ownerSubject"=$1::uuid', [A]))
          .rowCount,
        0,
      );
      await assert.rejects(
        client.query(
          'INSERT INTO "ContentFavorite" ("ownerIssuer","ownerSubject","contentId") VALUES ($1,$2::uuid,$3)',
          [issuer, A, saved.entry.id],
        ),
      );
      await client.query('ROLLBACK');
      await client.query('BEGIN');
      await context('https://other-project.example/auth/v1', A);
      assert.equal((await client.query('SELECT * FROM "ContentFavorite"')).rowCount, 0);
      await client.query('ROLLBACK');
      assert.equal((await client.query('SELECT * FROM "ContentFavorite"')).rowCount, 0);
    } finally {
      await client.query('ROLLBACK');
      client.release();
      await pool.end();
    }
    await result(await request('A', 'DELETE', path));
    assert.equal((await result(await request('A', 'GET', '/v1/favorites'))).items.length, 0);
  }));

test('sourced editorial seed is repeatable and preserves admin payload, version and publication edits', () =>
  fixture(async ({ request, update }) => {
    const ids = initialContent.map((value) => value.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const value of initialContent) {
      assert(value.sources.length > 0);
      assert(value.sources.every((source) => source.url.startsWith('https://')));
    }
    await seedContent(adminUrl);
    const legacy = originalContent.find((entry) => entry.id === 'dalat-bietthuhangnga');
    await admin.query('UPDATE "EditorialContent" SET payload=$1::jsonb,version=1 WHERE id=$2', [
      JSON.stringify(legacy),
      legacy.id,
    ]);
    await seedContent(adminUrl);
    const upgraded = (
      await admin.query('SELECT payload,version FROM "EditorialContent" WHERE id=$1', [legacy.id])
    ).rows[0];
    assert(upgraded.payload.image, 'Untouched RC1 content receives its verified photograph');
    assert.equal(upgraded.version, 2);
    const read = () =>
      admin.query('SELECT * FROM "EditorialContent" WHERE id=ANY($1::varchar[]) ORDER BY id', [
        ids,
      ]);
    const before = (await read()).rows;
    assert.equal(before.length, ids.length);
    for (const value of initialContent) {
      const links = await admin.query(
        'SELECT "categoryId" FROM "EditorialCategory" WHERE "contentId"=$1 ORDER BY "categoryId"',
        [value.id],
      );
      assert.deepEqual(
        links.rows.map((row) => row.categoryId),
        [...value.categoryIds].sort(),
      );
    }
    await seedContent(adminUrl);
    assert.deepEqual((await read()).rows, before);
    const page = contentPageSchema.parse(
      await result(
        await request('A', 'GET', '/v1/admin/content?limit=50&q=' + initialContent[0].title),
      ),
    );
    const original = page.items.find((value) => value.entry.id === initialContent[0].id);
    assert(original);
    const edited = await update(original, {
      title: 'Admin maintained seed fixture',
      body: 'Hand edited body retained on reseed.',
      status: 'hidden',
    });
    await seedContent(adminUrl);
    const row = (await read()).rows.find((value) => value.id === original.entry.id);
    assert.deepEqual(row.payload, edited.entry);
    assert.equal(row.version, edited.version);
    assert.equal(row.updatedAt.toISOString(), edited.updatedAt);
    await failure(await request(null, 'GET', '/v1/content/' + original.entry.id), 404, 'NOT_FOUND');
  }));

test('real PostgreSQL CMS publication reaches PWA discovery, favorites and saved reopened manual plans at mobile and desktop widths', () =>
  fixture(async ({ A, B, create, update, base, token, request, advanceAuthWindow }) => {
    const id = 'aaa-browser-' + randomUUID();
    const draft = await create(
      entry(id, 'destination', {
        title: 'Đà Lạt — Hành trình cao nguyên',
        summary: 'Chọn một nhịp đi chậm giữa những khoảng xanh và góc phố cao nguyên.',
        body: 'Nội dung minh họa cho kiểm thử CMS với PostgreSQL thật. Bạn có thể tự sắp xếp các điểm dừng và kiểm tra thông tin trước chuyến đi.',
        destination: { ...getDestination('da-lat'), id, name: 'Đà Lạt — Hành trình cao nguyên' },
      }),
    );
    await failure(await request(null, 'GET', '/v1/content/' + id), 404, 'NOT_FOUND');
    const published = await update(draft, { status: 'published' });
    const { tripIds } = await checkCmsDatabaseBrowser({ base, token, owner: A, record: published, advanceAuthWindow });
    assert.equal(tripIds.length, 3);
    const trips = await admin.query(
      'SELECT id,"ownerSubject",destination FROM "Trip" WHERE id=ANY($1::varchar[])',
      [tripIds],
    );
    assert.equal(trips.rowCount, 3);
    for (const trip of trips.rows) {
      assert.equal(trip.ownerSubject, A);
      assert.equal(trip.destination.id, id);
    }
    assert.equal((await result(await request('A', 'GET', '/v1/favorites'))).items.length, 0);
    assert.equal((await result(await request('B', 'GET', '/v1/favorites'))).items.length, 0);
    await failure(await request('B', 'GET', '/v1/trips/' + tripIds[0]), 404, 'NOT_FOUND');
    assert.notEqual(A, B);
  }));

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getDalatCatalog } from '@goease/catalog';
import {
  CATALOG_LIMITS,
  catalogEntriesSchema,
  adminCatalogPageQuerySchema,
} from '@goease/contracts';
import { CatalogRepository } from '../dist/modules/catalog/catalog.repository.js';
import { CatalogService } from '../dist/modules/catalog/catalog.service.js';
import { AdminCatalogService } from '../dist/modules/catalog/admin/admin-catalog.service.js';

const entries = Array.from({ length: 57 }, (_, i) => ({
  ...getDalatCatalog()[0],
  id: `place-${String(i).padStart(3, '0')}`,
}));
const rows = entries.map((entry) => ({ id: entry.id, snapshot: entry, version: 1, enabled: true }));
function setup(data = rows) {
  const requests = [];
  const tx = {
    place: {
      findMany: async (args) => {
        requests.push(args);
        return data
          .filter((row) => !args.where?.id?.gt || row.id > args.where.id.gt)
          .slice(0, args.take);
      },
    },
  };
  const repository = new CatalogRepository({ requireClient: () => tx });
  repository.permitted = async () => true;
  const admin = new AdminCatalogService(
    { CATALOG_ADMIN_ENABLED: true },
    { verify: async () => ({}) },
    { run: async (_, __, action) => action(tx) },
    repository,
  );
  return { tx, repository, admin, requests };
}
test('catalog over 20 remains complete; admin cursor pages are bounded, ordered and exhaustive', async () => {
  assert.equal(catalogEntriesSchema.parse(entries).length, 57);
  const { repository, admin, requests } = setup();
  const publicCatalog = await new CatalogService({ configured: true }, repository).list();
  assert.equal(publicCatalog.catalog.entries.length, 57);
  const seen = [];
  let after;
  do {
    const page = await admin.page('Bearer fixture', new AbortController().signal, {
      limit: 20,
      after,
    });
    assert.ok(page.places.length <= 20);
    seen.push(...page.places.map((place) => place.entry.id));
    after = page.nextCursor;
  } while (after);
  assert.deepEqual(
    seen,
    entries.map((entry) => entry.id),
  );
  assert.equal(new Set(seen).size, 57);
  assert.ok(
    requests.slice(1).every((request) => request.take === 21 && request.skip === undefined),
  );
});
test('page validation rejects overflow, fractions, duplicated and unknown queries', () => {
  for (const query of [
    { limit: '51' },
    { limit: '0' },
    { limit: '1.5' },
    { limit: ['20', '30'] },
    { after: 'bad cursor' },
    { other: '20' },
  ])
    assert.equal(adminCatalogPageQuerySchema.safeParse(query).success, false);
  assert.equal(adminCatalogPageQuerySchema.parse({ limit: '50' }).limit, 50);
});
test('legacy catalog and trip validation refuse overflow instead of silently dropping places', async () => {
  const data = Array.from({ length: CATALOG_LIMITS.maxEntries + 1 }, (_, i) => ({
    ...rows[0],
    id: `overflow-${i}`,
  }));
  const { tx, repository } = setup(data);
  await assert.rejects(repository.validationEntries(tx), (error) => error.code === 'CATALOG_LIMIT');
  await assert.rejects(
    new CatalogService({ configured: true }, repository).managedCatalog(),
    (error) => error.code === 'CATALOG_LIMIT',
  );
});
test('admin can create beyond 20, retains serialized safety ceiling and existing authorization', async () => {
  const { admin, repository } = setup();
  repository.lock = async () => {};
  repository.find = async () => null;
  repository.count = async () => 57;
  let created = 0;
  repository.create = async () => {
    created++;
  };
  await admin.createPlace('Bearer fixture', new AbortController().signal, { entry: entries[0] });
  assert.equal(created, 1);
  repository.count = async () => CATALOG_LIMITS.maxEntries;
  await assert.rejects(
    admin.createPlace('Bearer fixture', new AbortController().signal, { entry: entries[0] }),
    (error) => error.code === 'CATALOG_LIMIT',
  );
  repository.permitted = async () => false;
  await assert.rejects(
    admin.page('Bearer fixture', new AbortController().signal, { limit: 20 }),
    (error) => error.code === 'ADMIN_FORBIDDEN',
  );
});

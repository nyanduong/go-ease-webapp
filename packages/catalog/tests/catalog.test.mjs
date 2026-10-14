import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  catalogEntriesSchema, catalogEntrySchema, catalogSchema, DALAT_DEMO_BOUNDS,
  referenceCostSchema, tripSchemaWithCatalog,
} from '@goease/contracts';
import { CATALOG_INFO, findDalatCatalogEntry, getDalatCatalog, getDalatPlaces } from '@goease/catalog';

test('all 15 curated records validate and cover at least ten daytime visits for five days', () => {
  const entries = getDalatCatalog();
  assert.equal(entries.length, 15);
  assert.equal(catalogEntriesSchema.safeParse(entries).success, true);
  assert.equal(new Set(entries.map((entry) => entry.id)).size, entries.length);
  assert.ok(new Set(entries.map((entry) => entry.category)).size >= 6);
  assert.ok(entries.filter((entry) => entry.visitTimeHint === 'daytime').length >= 10);
  assert.equal(CATALOG_INFO.destinationId, 'da-lat');
});

test('markers are within the demo region and have traceable source/date metadata', () => {
  for (const entry of getDalatCatalog()) {
    assert.ok(entry.coordinates.latitude >= DALAT_DEMO_BOUNDS.south && entry.coordinates.latitude <= DALAT_DEMO_BOUNDS.north);
    assert.ok(entry.coordinates.longitude >= DALAT_DEMO_BOUNDS.west && entry.coordinates.longitude <= DALAT_DEMO_BOUNDS.east);
    assert.equal(entry.coordinateKind, 'source-map-marker');
    assert.ok(entry.sources.some((source) => source.url === entry.coordinateSourceUrl && source.accessedOn === CATALOG_INFO.accessedOn));
    assert.equal(new URL(entry.coordinateSourceUrl).hostname, 'visitlamdong.vn');
    assert.equal(entry.durationBasis, 'team-estimate');
  }
});

test('no unverified price is turned into free or a live quote; night market is evening-only guidance', () => {
  for (const entry of getDalatCatalog()) {
    assert.deepEqual(entry.referenceCost, { status: 'unknown', amountVnd: null, basis: 'per-person', sourceUrl: null, checkedOn: null });
  }
  assert.equal(findDalatCatalogEntry('dalat-chodemdalat').visitTimeHint, 'evening');
  assert.equal(findDalatCatalogEntry('missing'), undefined);
});

test('existing strict Place and trip consumers accept projected catalog', () => {
  const places = getDalatPlaces();
  assert.equal(catalogSchema.safeParse(places).success, true);
  const place = places[0];
  const trip = {
    schemaVersion: 1, id: 'trip', name: 'Demo', destinationId: 'da-lat', timeZone: 'Asia/Ho_Chi_Minh',
    currency: 'VND', startDate: '2026-11-20', durationDays: 1, people: 4, budgetVnd: null,
    days: [{ id: 'day-1', date: '2026-11-20', activities: [{
      id: 'activity-1', name: place.name, location: { kind: 'catalog', placeId: place.id },
      startTime: null, endTime: null, costVnd: null, notes: '',
    }] }],
  };
  assert.equal(tripSchemaWithCatalog(places).safeParse(trip).success, true);
  assert.equal('referenceCost' in place, false);
});

test('consumer edits cannot mutate the shared dataset or lookups', () => {
  const entries = getDalatCatalog();
  const originalName = entries[0].name;
  const originalLatitude = entries[0].coordinates.latitude;
  entries[0].name = 'Changed';
  entries[0].coordinates.latitude = 0;
  entries[0].sources[0].url = 'https://example.test';
  entries.pop();
  assert.equal(getDalatCatalog().length, 15);
  assert.equal(getDalatCatalog()[0].name, originalName);
  assert.equal(getDalatPlaces()[0].coordinates.latitude, originalLatitude);
  const found = findDalatCatalogEntry(getDalatCatalog()[0].id);
  found.name = 'Changed again';
  assert.equal(getDalatCatalog()[0].name, originalName);
});

test('reject swapped/out-of-region/empty coordinates, duplicate IDs and unsupported metadata', () => {
  const entry = getDalatCatalog()[0];
  for (const coordinates of [null, {}, { latitude: 108.43, longitude: 11.93 }, { latitude: 10.77, longitude: 106.69 }, { latitude: NaN, longitude: 108.43 }]) {
    assert.equal(catalogEntrySchema.safeParse({ ...entry, coordinates }).success, false);
  }
  assert.equal(catalogEntrySchema.safeParse({ ...entry, suggestedDurationMinutes: 0 }).success, false);
  assert.equal(catalogEntrySchema.safeParse({ ...entry, durationBasis: 'confirmed' }).success, false);
  assert.equal(catalogEntrySchema.safeParse({ ...entry, coordinateSourceUrl: 'https://example.test' }).success, false);
  const entries = getDalatCatalog();
  entries[1].id = entries[0].id;
  assert.equal(catalogEntriesSchema.safeParse(entries).success, false);
});

test('unknown/null differs from evidence-backed reference/0; reject missing evidence and invalid amounts', () => {
  // Synthetic evidence, not a claim that any production place is free.
  const free = { status: 'reference', amountVnd: 0, basis: 'per-person', sourceUrl: 'https://example.test/fee', checkedOn: '2026-10-14' };
  assert.equal(referenceCostSchema.safeParse(free).success, true);
  assert.equal(referenceCostSchema.safeParse({ ...free, amountVnd: 100_000 }).success, true);
  for (const amountVnd of [-1, 0.5, '0', Infinity, 100_000_001]) {
    assert.equal(referenceCostSchema.safeParse({ ...free, amountVnd }).success, false);
  }
  assert.equal(referenceCostSchema.safeParse({ ...free, sourceUrl: null }).success, false);
  assert.equal(referenceCostSchema.safeParse({ ...free, checkedOn: null }).success, false);
  assert.equal(referenceCostSchema.safeParse({ ...free, status: 'confirmed' }).success, false);
  assert.equal(referenceCostSchema.safeParse({ status: 'unknown', amountVnd: 0, basis: 'per-person', sourceUrl: null, checkedOn: null }).success, false);
});

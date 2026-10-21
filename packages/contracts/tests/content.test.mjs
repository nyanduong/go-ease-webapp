import test from 'node:test';
import assert from 'node:assert/strict';
import { contentInputSchema, contentQuerySchema, getDestination } from '../dist/index.js';
const destination = { id: 'da-lat', kind: 'destination', title: 'Đà Lạt', summary: 'Sourced fixture', body: 'Fixture body', status: 'published', destinationId: null, categoryIds: [], image: null, address: '', coordinates: null, destination: getDestination('da-lat'), sources: [{ title: 'Tourism source fixture', url: 'https://example.test/source' }] };
test('editorial publication requires source and complete content, rejects provider provenance and unsafe media', () => {
  assert(contentInputSchema.safeParse(destination).success);
  for (const patch of [{ sources: [] }, { body: '' }, { image: { url: 'http://example.test/photo', alt: 'Photo', credit: 'Fixture' } }, { destination: { ...destination.destination, selectionToken: 'a'.repeat(32) } }, { id: 'other' }]) assert.equal(contentInputSchema.safeParse({ ...destination, ...patch }).success, false);
  assert(contentInputSchema.safeParse({ ...destination, status: 'draft', body: '', sources: [] }).success);
});
test('editorial pages reject unbounded, duplicated/unknown params; places need destination and coordinates', () => {
  assert.deepEqual(contentQuerySchema.parse({ limit: '50', kind: 'food' }), { limit: 50, kind: 'food' });
  for (const query of [{ limit: '51' }, { limit: '0' }, { limit: ['1', '2'] }, { role: 'admin' }, { q: 'x'.repeat(101) }]) assert.equal(contentQuerySchema.safeParse(query).success, false);
  assert.equal(contentInputSchema.safeParse({ ...destination, kind: 'place', destination: null }).success, false);
});

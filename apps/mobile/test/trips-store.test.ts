import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import type { AuthUser, TripDetail } from '@goease/contracts';
import { createNativeAuthClient } from '../src/features/auth/client.ts';
import { createNativeAuthStore } from '../src/features/auth/store.ts';
import { createTripsStore } from '../src/features/trips/store.ts';
import { TripFailure, type createTripsClient, type TripMutation } from '../src/features/trips/client.ts';
import { copyForm, createBody, formFromTrip, updateBody } from '../src/features/trips/form.ts';
import { deferred, id, ownerA, ownerB, summary, token, trip } from './trips-fixture.ts';

// TEST ONLY transport/identity doubles through the real native auth store. No Google, native UI or API/DB live evidence.
async function fixture(t: TestContext, patch: Partial<ReturnType<typeof createTripsClient>> = {}) {
  let currentUser: AuthUser = { id: ownerA, role: 'CUSTOMER', displayName: 'TEST ONLY A' }, vaultToken: string | null = token;
  let currentResponse: (() => Promise<Response>) | undefined, expiresMs = 600_000;
  const auth = createNativeAuthStore(createNativeAuthClient('https://auth.test/api', async url => {
    if (url.endsWith('/logout')) return new Response(null, { status: 204 });
    return currentResponse ? currentResponse() : Response.json({ transport: 'native', user: currentUser, expiresAt: new Date(Date.now() + expiresMs).toISOString() });
  }), { credential: async () => 'TEST ONLY unused', signOut: async () => {} }, { get: async () => vaultToken, set: async value => { vaultToken = value; }, delete: async () => { vaultToken = null; } });
  let keyCalls = 0;
  const client: ReturnType<typeof createTripsClient> = { list: async () => ({ trips: [], nextCursor: null }), detail: async () => trip(), mutate: async () => trip(), ...patch };
  const store = createTripsStore(client, auth, () => id(500 + ++keyCalls));
  const disconnect = store.connect(); t.after(() => { disconnect(); store.dispose(); auth.dispose(); });
  await auth.restore(); await delay(0);
  return { store, auth, keys: () => keyCalls, setUser: (value: AuthUser) => { currentUser = value; }, setCurrent: (response?: () => Promise<Response>) => { currentResponse = response; }, setExpiry: (milliseconds: number) => { expiresMs = milliseconds; } };
}
const createForm = { title: 'TEST ONLY 🌿', startDate: '2028-02-28', durationDays: '2', groupSize: '2', budgetVnd: '' };

test('Raw form validation keeps calendar/Unicode/null vs zero/group money/time pairs and retained IDs', () => {
  assert.equal(createBody(createForm).budgetVnd, null); assert.equal(createBody({ ...createForm, budgetVnd: '0' }).budgetVnd, 0);
  for (const patch of [{ startDate: '2026-02-29' }, { startDate: '2099-12-31', durationDays: '2' }, { groupSize: '2.5' }, { groupSize: '1e1' }, { budgetVnd: '-1' }, { budgetVnd: '1000000000001' }, { title: '\ud800' }]) assert.throws(() => createBody({ ...createForm, ...patch }));
  const raw = formFromTrip(trip()); raw.groupSize = '5'; raw.days[0]!.activities[0]!.cost = '0'; raw.days[0]!.activities[0]!.notes = 'Tiếng Việt 🌿\nDòng hai\tghi chú'; raw.days[0]!.activities[0]!.start = '23:00'; raw.days[0]!.activities[0]!.end = '24:00';
  const body = updateBody(raw, 1); assert.equal(body.days[0]!.activities[0]!.id, id(1)); assert.equal(body.days[0]!.activities[0]!.estimatedCostVnd, 0); assert.equal(body.days[0]!.activities[0]!.endMinute, 1440); assert.equal(body.days[1]!.activities[0]!.estimatedCostVnd, null);
  raw.days[0]!.activities[0]!.start = '24:00'; assert.throws(() => updateBody(raw, 1)); raw.days[0]!.activities[0]!.start = ''; assert.throws(() => updateBody(raw, 1));
});
test('Create double taps capture one immutable key/body BEFORE request, then require fresh GET before synced', async t => {
  const receipt = deferred<TripDetail>(), latest = deferred<TripDetail>(), seen: TripMutation[] = [];
  const f = await fixture(t, { mutate: async pending => { seen.push(pending); return receipt.promise; }, detail: async () => latest.promise });
  f.store.create(); f.store.setCreate(createForm);
  const first = f.store.submitCreate(), second = f.store.submitCreate();
  assert.equal(seen.length, 1); assert.equal(f.keys(), 1); assert.equal(Object.isFrozen(f.store.snapshot().pending), true);
  f.store.setCreate({ ...createForm, title: 'MUST NOT EDIT' }); assert.equal(f.store.snapshot().create.title, createForm.title);
  receipt.resolve(trip()); await delay(0); assert.equal(f.store.snapshot().mutation, 'refreshing'); assert.equal(f.store.snapshot().saved, null);
  latest.resolve(trip(2)); await Promise.all([first, second]);
  assert.equal(f.store.snapshot().saved?.version, 2); assert.equal(f.store.snapshot().pending, null); assert.match(f.store.snapshot().message, /thay đổi sau/);
});
test('Lost create response preserves exact key/body; explicit network off/on retry returns historical receipt then newer GET', async t => {
  let network = false; const seen: TripMutation[] = [];
  const f = await fixture(t, { mutate: async pending => { seen.push(pending); if (!network) throw new TripFailure('network'); return trip(); }, detail: async () => trip(3) });
  f.store.setCreate(createForm); await f.store.submitCreate();
  const pending = f.store.snapshot().pending!; assert.equal(f.store.snapshot().mutation, 'uncertain'); assert.equal(f.store.snapshot().create.title, createForm.title);
  network = true; await f.store.retry(); assert.equal(seen.length, 2); assert.equal(seen[0]!.key, seen[1]!.key); assert.equal(seen[0]!.body, seen[1]!.body); assert.equal(seen[1]!.key, pending.key); assert.equal(f.keys(), 1);
  assert.equal(f.store.snapshot().saved?.version, 3); assert.equal(f.store.snapshot().dirty, false);
});
test('Acknowledged mutation with failed reconcile retries GET only, never creates another mutation/key', async t => {
  let gets = 0, writes = 0;
  const f = await fixture(t, { mutate: async () => { writes++; return trip(2); }, detail: async () => { gets++; if (gets === 1) throw new TripFailure('network'); return trip(4); } });
  f.store.setCreate(createForm); await f.store.submitCreate(); assert.equal(f.store.snapshot().pending?.receiptVersion, 2); assert.equal(f.store.snapshot().saved, null);
  await f.store.retry(); assert.equal(writes, 1); assert.equal(gets, 2); assert.equal(f.keys(), 1); assert.equal(f.store.snapshot().saved?.version, 4);
});
test('Update preserves activity/day identities through move/reorder/delete and sends old expectedVersion on retry', async t => {
  const seen: TripMutation[] = []; let writes = 0;
  const f = await fixture(t, { mutate: async pending => { seen.push(pending); if (++writes === 1) throw new TripFailure('timeout'); return trip(2); }, detail: async () => writes > 1 ? trip(2) : trip() });
  await f.store.open(id(50)); const form = copyForm(f.store.snapshot().draft!);
  const moved = form.days[0]!.activities.splice(0, 1)[0]!; form.days[1]!.activities.unshift(moved); form.days[1]!.activities.splice(1, 1); moved.notes = 'TEST ONLY changed';
  f.store.edit(form); await f.store.save(); assert.equal(f.store.snapshot().dirty, true); assert.equal(f.store.snapshot().draft!.days[1]!.activities[0]!.id, id(1));
  await f.store.retry(); assert.equal(seen[0]!.body, seen[1]!.body); assert.equal(seen[0]!.key, seen[1]!.key);
  const sent = JSON.parse(seen[0]!.body) as { expectedVersion: number; days: Array<{ activities: Array<{ id: string }> }> };
  assert.equal(sent.expectedVersion, 1); assert.equal(sent.days[0]!.activities.length, 0); assert.equal(sent.days[1]!.activities[0]!.id, id(1)); assert.equal(f.store.snapshot().saved!.days[0]!.id, trip().days[0]!.id);
});
test('409 retains draft and requires explicit reload; no automatic rebase or overwrite', async t => {
  let reads = 0;
  const f = await fixture(t, { detail: async () => { reads++; return trip(reads); }, mutate: async () => { throw new TripFailure('conflict'); } });
  await f.store.open(id(50)); f.store.edit({ ...f.store.snapshot().draft!, title: 'LOCAL CONFLICT TEST ONLY' }); await f.store.save();
  assert.equal(f.store.snapshot().mutation, 'conflict'); assert.equal(f.store.snapshot().pending, null); assert.equal(f.store.snapshot().draft?.title, 'LOCAL CONFLICT TEST ONLY'); assert.equal(reads, 1);
  await f.store.open(id(50)); assert.equal(reads, 1); await f.store.open(id(50), true); assert.equal(reads, 2); assert.equal(f.store.snapshot().dirty, false);
});
test('Transient restore hides/aborts but same owner keeps draft and pending; new owner and confirmed logout clear RAM', async t => {
  const f = await fixture(t, { mutate: async () => { throw new TripFailure('network'); } });
  await f.store.open(id(50)); f.store.edit({ ...f.store.snapshot().draft!, title: 'OWNER A RAM TEST ONLY' }); await f.store.save(); const pending = f.store.snapshot().pending;
  const restoring = deferred<Response>(); f.setCurrent(() => restoring.promise); const restore = f.auth.restore();
  assert.equal(f.store.snapshot().available, false); assert.equal(f.store.snapshot().draft?.title, 'OWNER A RAM TEST ONLY');
  restoring.resolve(Response.json({ transport: 'native', user: { id: ownerA, role: 'CUSTOMER', displayName: 'TEST ONLY A' }, expiresAt: new Date(Date.now() + 600_000).toISOString() })); await restore;
  assert.equal(f.store.snapshot().available, true); assert.equal(f.store.snapshot().pending, pending); assert.equal(f.store.snapshot().draft?.title, 'OWNER A RAM TEST ONLY');
  f.setCurrent(); f.setUser({ id: ownerB, role: 'CUSTOMER', displayName: 'TEST ONLY B' }); await f.auth.restore();
  assert.equal(f.store.snapshot().saved, null); assert.equal(f.store.snapshot().draft, null); assert.equal(f.store.snapshot().pending, null);
  await f.auth.logout(); assert.equal(f.store.snapshot().available, false); assert.deepEqual(f.store.snapshot().trips, []);
});
test('Late detail/list/mutation callbacks cannot cross identity or expiry restore boundaries', async t => {
  const read = deferred<TripDetail>(), f = await fixture(t, { detail: async () => read.promise });
  const open = f.store.open(id(50)); f.setUser({ id: ownerB, role: 'CUSTOMER', displayName: 'TEST ONLY B' }); await f.auth.restore(); read.resolve(trip()); await open;
  assert.equal(f.store.snapshot().saved, null);
  f.setCurrent(async () => new Response('TEST ONLY expired', { status: 401 })); await f.auth.restore(); assert.equal(f.store.snapshot().available, false); assert.equal(f.store.snapshot().pending, null);
});
test('Cancel then immediate retry is fenced against the first late callback and keeps the same immutable request', async t => {
  const old = deferred<TripDetail>(), newer = deferred<TripDetail>(); let writes = 0; const seen: TripMutation[] = [];
  const f = await fixture(t, { mutate: async pending => { seen.push(pending); return ++writes === 1 ? old.promise : newer.promise; }, detail: async () => trip(3) });
  f.store.setCreate(createForm); const first = f.store.submitCreate(); f.store.cancelRequest(); const retry = f.store.retry();
  old.resolve(trip()); await first; await delay(0); assert.equal(f.store.snapshot().saved, null); assert.equal(f.store.snapshot().mutation, 'sending');
  newer.resolve(trip(2)); await retry; assert.equal(f.store.snapshot().saved?.version, 3); assert.equal(seen.length, 2); assert.equal(seen[0]!.key, seen[1]!.key); assert.equal(seen[0]!.body, seen[1]!.body);
});
test('Read failure supports explicit retry, fresh store reads saved server data and list handles empty/error/pagination', async t => {
  let reads = 0, lists = 0;
  const f = await fixture(t, { detail: async () => { if (++reads === 1) throw new TripFailure('network'); return trip(2); }, list: async (_token, _signal, cursor) => {
    if (++lists === 1) return { trips: [], nextCursor: null }; if (lists === 2) throw new TripFailure('network');
    const item = summary(); return { trips: [item], nextCursor: cursor ? null : { updatedAt: item.updatedAt, id: item.id } };
  } });
  assert.equal(f.store.snapshot().listStatus, 'ready'); assert.equal(f.store.snapshot().trips.length, 0);
  await f.store.open(id(50)); assert.equal(f.store.snapshot().detailStatus, 'error'); assert.equal(f.store.snapshot().detailId, id(50)); await f.store.open(id(50)); assert.equal(f.store.snapshot().saved?.version, 2);
  await f.store.list(); assert.equal(f.store.snapshot().listStatus, 'error'); await f.store.list(); await f.store.list(true); assert.equal(f.store.snapshot().trips.length, 1); assert.equal(f.store.snapshot().nextCursor, null);
});
test('Persistent trip session refusal checks auth once and requires a user retry instead of a restore/list loop', async t => {
  let calls = 0; const f = await fixture(t, { list: async () => { calls++; throw new TripFailure('session'); } });
  await delay(5); assert.equal(calls, 1); assert.equal(f.store.snapshot().available, true); assert.equal(f.store.snapshot().listStatus, 'error');
  await f.store.list(); await delay(5); assert.equal(calls, 2);
});
test('Actual native auth expiry timer hides and preserves same-owner RAM while the authoritative recheck is pending', async t => {
  const f = await fixture(t); await f.store.open(id(50)); f.store.edit({ ...f.store.snapshot().draft!, title: 'EXPIRY RAM TEST ONLY' });
  f.setExpiry(40); await f.auth.restore(); const pending = deferred<Response>(); f.setCurrent(() => pending.promise);
  await delay(70); assert.equal(f.auth.snapshot().kind, 'restoring'); assert.equal(f.store.snapshot().available, false); assert.equal(f.store.snapshot().draft?.title, 'EXPIRY RAM TEST ONLY');
  pending.resolve(Response.json({ transport: 'native', user: { id: ownerA, role: 'CUSTOMER', displayName: 'TEST ONLY A' }, expiresAt: new Date(Date.now() + 600_000).toISOString() })); await delay(0);
  assert.equal(f.store.snapshot().available, true); assert.equal(f.store.snapshot().dirty, true);
});
test('Late list and mutation successes after account switch never populate the new owner bucket', async t => {
  const oldList = deferred<{ trips: ReturnType<typeof summary>[]; nextCursor: null }>(); let lists = 0;
  const f = await fixture(t, { list: async () => ++lists === 1 ? oldList.promise : { trips: [], nextCursor: null } });
  f.setUser({ id: ownerB, role: 'CUSTOMER', displayName: 'TEST ONLY B' }); await f.auth.restore(); oldList.resolve({ trips: [summary()], nextCursor: null }); await delay(0); assert.equal(f.store.snapshot().trips.length, 0);
  const mutation = deferred<TripDetail>(); const second = await fixture(t, { mutate: async () => mutation.promise }); second.store.setCreate(createForm); const save = second.store.submitCreate();
  second.setUser({ id: ownerB, role: 'CUSTOMER', displayName: 'TEST ONLY B' }); await second.auth.restore(); mutation.resolve(trip()); await save;
  assert.equal(second.store.snapshot().saved, null); assert.equal(second.store.snapshot().pending, null); assert.equal(second.store.snapshot().create.title, '');
});
test('A late detail reload cannot replace a newer create draft or unlock its in-flight immutable submission', async t => {
  const oldRead = deferred<TripDetail>(), receipt = deferred<TripDetail>(); let reads = 0, writes = 0;
  const created = { ...trip(), id: id(51), title: 'NEW CREATE TEST ONLY' };
  const f = await fixture(t, { detail: async () => ++reads === 1 ? trip() : reads === 2 ? oldRead.promise : created, mutate: async () => { writes++; return receipt.promise; } });
  await f.store.open(id(50)); const oldOpen = f.store.open(id(50)); f.store.show('list'); f.store.create(); f.store.setCreate(createForm); const create = f.store.submitCreate();
  oldRead.resolve({ ...trip(5), title: 'STALE READ TEST ONLY' }); await oldOpen; assert.equal(f.store.snapshot().mutation, 'sending');
  await f.store.retry(); assert.equal(writes, 1); assert.notEqual(f.store.snapshot().draft?.title, 'STALE READ TEST ONLY');
  receipt.resolve(created); await create; assert.equal(f.store.snapshot().saved?.id, id(51)); assert.equal(f.store.snapshot().pending, null);
});
test('Opening a different trip cannot save the old retained draft while loading or after same-owner auth restore', async t => {
  const nextRead = deferred<TripDetail>(); let reads = 0, writes = 0;
  const f = await fixture(t, { detail: async () => ++reads === 1 ? trip() : nextRead.promise, mutate: async () => { writes++; return trip(2); } });
  await f.store.open(id(50)); f.store.edit({ ...f.store.snapshot().draft!, title: 'OLD A DRAFT TEST ONLY' }); const open = f.store.open(id(51), true);
  assert.equal(f.store.snapshot().detailId, id(51)); assert.equal(f.store.snapshot().saved?.id, id(50)); await f.store.save(); assert.equal(writes, 0);
  f.store.edit({ ...f.store.snapshot().draft!, title: 'MUST NOT APPLY WHILE B LOADS' }); assert.equal(f.store.snapshot().draft?.title, 'OLD A DRAFT TEST ONLY');
  await f.auth.restore(); assert.equal(f.store.snapshot().detailStatus, 'error'); await f.store.save(); assert.equal(writes, 0);
  nextRead.resolve({ ...trip(2), id: id(51) }); await open; assert.equal(f.store.snapshot().saved?.id, id(50)); assert.equal(f.store.snapshot().draft?.title, 'OLD A DRAFT TEST ONLY');
});
test('Delayed native editor/delete/text callbacks carry owner+trip correlation and cannot import old private content', async t => {
  const f = await fixture(t); await f.store.open(id(50)); const oldDraft = { ...f.store.snapshot().draft!, title: 'OWNER A PRIVATE TEST ONLY' };
  f.setUser({ id: ownerB, role: 'CUSTOMER', displayName: 'TEST ONLY B' }); await f.auth.restore(); await f.store.open(id(50));
  f.store.edit(oldDraft, ownerA, id(50)); f.store.setCreate({ ...createForm, title: 'OWNER A CREATE PRIVATE TEST ONLY' }, ownerA);
  assert.notEqual(f.store.snapshot().draft?.title, oldDraft.title); assert.equal(f.store.snapshot().create.title, '');
  f.store.edit(oldDraft, ownerB, id(51)); assert.notEqual(f.store.snapshot().draft?.title, oldDraft.title);
});

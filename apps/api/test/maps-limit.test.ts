import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EventEmitter } from 'node:events';
import type { Response } from 'express';
import type { AuthRequest } from '../src/modules/auth/http.js';
import { MapsController, MapsFault, MapsLimit, MapsService } from '../src/modules/maps/maps.module.js';

const limited = (error: unknown) => error instanceof MapsFault && error.code === 'MAPS_RATE_LIMITED' && error.getStatus() === 429;
test('Routes admission bounds concurrent work at two and releases capacity after a failure', async () => {
  const limit = new MapsLimit(); let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const pending = ['a', 'b'].map(user => limit.run(user, async () => { await gate; throw new Error('TEST ONLY'); }));
  await assert.rejects(limit.run('c', async () => true), limited); release();
  assert.ok((await Promise.allSettled(pending)).every(result => result.status === 'rejected'));
  assert.equal(await limit.run('c', async () => 'recovered'), 'recovered');
});
test('Routes per-user10/global30 budgets do not reset on failure and recover after the bounded minute', async t => {
  let now = 1_000_000; t.mock.method(Date, 'now', () => now);
  const limit = new MapsLimit();
  for (let i = 0; i < 10; i++) await assert.rejects(limit.run('a', async () => { throw new Error('TEST ONLY'); }));
  await assert.rejects(limit.run('a', async () => true), limited);
  for (let i = 0; i < 20; i++) await limit.run(`b${i}`, async () => true);
  await assert.rejects(limit.run('other', async () => true), limited);
  now += 60_000; assert.equal(await limit.run('a', async () => 'recovered'), 'recovered');
});
test('controller observes an already-closed response after asynchronous guard and aborts before service work', async () => {
  const response = Object.assign(new EventEmitter(), { destroyed: true, writableEnded: false }); response.emit('close');
  let aborted = false;
  const service = { route: async (_body: unknown, _user: string, signal: AbortSignal) => { aborted = signal.aborted; return undefined; } };
  const controller = new MapsController(undefined as never, service as unknown as MapsService);
  await controller.route({ auth: { transport: 'native', user: { id: 'TEST_ONLY_USER' } } } as AuthRequest, response as unknown as Response, {});
  assert.equal(aborted, true); assert.equal(response.listenerCount('close'), 0);
});

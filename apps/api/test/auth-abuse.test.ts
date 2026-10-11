import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AbuseLimit } from '../src/modules/auth/abuse-limit.js';
import { ApiFault } from '../src/common/api-fault.js';

test('verification concurrency is bounded and capacity recovers after failed work', async () => {
  const limit = new AbuseLimit();
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const pending = Array.from({ length: 8 }, () => limit.verification(async () => { await gate; throw new Error('TEST ONLY failure'); }));
  await assert.rejects(limit.verification(async () => true), error => error instanceof ApiFault && error.code === 'AUTH_RATE_LIMITED');
  release();
  assert.ok((await Promise.allSettled(pending)).every(result => result.status === 'rejected'));
  assert.equal(await limit.verification(async () => 'recovered'), 'recovered');
});

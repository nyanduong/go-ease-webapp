import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Prisma } from '../src/generated/prisma/client.js';
import { isReceiptRace } from '../src/modules/trips/trips.service.js';

test('only the exact receipt compound unique conflict qualifies for fresh-query retry', () => {
  const error = (code: string, meta: Record<string, unknown>) => new Prisma.PrismaClientKnownRequestError('TEST ONLY', { code, clientVersion: '7.10.0', meta });
  assert.equal(isReceiptRace(error('P2002', { modelName: 'IdempotencyRecord', target: ['userId', 'operation', 'key'] })), true);
  for (const value of [new Error('P2002'), { code: 'P2002', meta: { modelName: 'IdempotencyRecord', target: ['userId', 'operation', 'key'] } },
    error('P2002', { modelName: 'Trip', target: ['id'] }), error('P2002', { modelName: 'Activity', target: ['tripDayId', 'position'] }),
    error('P2002', { modelName: 'IdempotencyRecord', target: ['userId', 'operation'] }),
    error('P2002', { modelName: 'IdempotencyRecord', target: ['userId', 'operation', 'other'] }),
    error('P2002', { modelName: 'IdempotencyRecord', target: 'IdempotencyRecord_pkey' }),
    error('P2034', { modelName: 'IdempotencyRecord', target: ['userId', 'operation', 'key'] })]) {
    assert.equal(isReceiptRace(value), false);
  }
});

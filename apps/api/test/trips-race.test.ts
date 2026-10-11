import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Prisma } from '../src/generated/prisma/client.js';
import { isReceiptRace } from '../src/modules/trips/trips.service.js';

test('only the exact receipt compound unique conflict qualifies for fresh-query retry', () => {
  const error = (code: string, meta: Record<string, unknown>) => new Prisma.PrismaClientKnownRequestError('TEST ONLY', { code, clientVersion: '7.10.0', meta });
  // Allowlisted shape observed from the actual forced PG23505 HTTP race.
  // The driver wrapper is an Error instance; cause/constraint are records.
  const cause = { kind: 'UniqueConstraintViolation', table: 'IdempotencyRecord', constraint: { index: 'IdempotencyRecord_pkey' } };
  const meta = (patch: Record<string, unknown> = {}) => ({ modelName: 'IdempotencyRecord',
    driverAdapterError: Object.assign(new Error('TEST ONLY'), { cause: { ...cause, ...patch } }) });
  assert.equal(isReceiptRace(error('P2002', meta())), true);
  for (const value of [new Error('P2002'), { code: 'P2002', meta: { modelName: 'IdempotencyRecord', target: ['userId', 'operation', 'key'] } },
    error('P2002', { ...meta(), modelName: 'Trip' }), error('P2002', meta({ table: 'Trip' })),
    error('P2002', meta({ kind: 'ForeignKeyConstraintViolation' })), error('P2002', meta({ constraint: { index: 'Activity_tripDayId_position_key' } })),
    error('P2002', meta({ constraint: { index: 'IdempotencyRecord_pkey', fields: ['userId', 'operation', 'key'] } })),
    error('P2002', { ...meta({ table: 'Trip' }), target: ['userId', 'operation', 'key'] }),
    error('P2002', { ...meta({ constraint: { index: 'Another_pkey' } }), target: ['userId', 'operation', 'key'] }),
    error('P2002', { modelName: 'IdempotencyRecord', driverAdapterError: null }),
    error('P2002', { modelName: 'IdempotencyRecord', target: ['userId', 'operation', 'key'] }),
    error('P2002', { modelName: 'Trip', target: ['id'] }), error('P2002', { modelName: 'Activity', target: ['tripDayId', 'position'] }),
    error('P2002', { modelName: 'IdempotencyRecord', target: ['userId', 'operation'] }),
    error('P2002', { modelName: 'IdempotencyRecord', target: ['userId', 'operation', 'other'] }),
    error('P2002', { modelName: 'IdempotencyRecord', target: 'IdempotencyRecord_pkey' }),
    error('P2034', meta())]) {
    assert.equal(isReceiptRace(value), false);
  }
});

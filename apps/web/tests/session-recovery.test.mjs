import test from 'node:test';
import assert from 'node:assert/strict';
import { resumeAfterSessionWork } from '../src/platform/session-recovery.ts';

const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

test('explicit retry survives initialization handing off to a second failed background restore', async () => {
  const initialization = deferred(),
    first = deferred(),
    second = deferred(),
    maintenance = deferred();
  let current = first.promise,
    forced = 0;
  // Startup's finally callback can start background restore after the first
  // restore finishes. A one-shot await of first + currently-null maintenance
  // would discard retry when maintainSession sees this second restore.
  const initialized = initialization.promise.then(() => {
    current = second.promise;
  });
  const resumed = resumeAfterSessionWork(
    initialized,
    () => current,
    () => true,
    async () => {
      forced++;
    },
  );
  first.resolve();
  initialization.resolve();
  await initialized;
  assert.equal(forced, 0);
  // The restored session may finish before enclosing maintenance clears its
  // cooldown/failure state. Explicit retry must wait through that handoff too.
  current = maintenance.promise;
  second.resolve();
  await second.promise;
  assert.equal(forced, 0);
  current = null;
  maintenance.resolve();
  await resumed;
  assert.equal(forced, 1);
});

test('logout/account invalidation while queued cancels retry instead of touching the next owner', async () => {
  const initial = deferred(),
    work = deferred();
  let valid = true,
    forced = 0;
  const resumed = resumeAfterSessionWork(
    initial.promise,
    () => work.promise,
    () => valid,
    async () => {
      forced++;
    },
  );
  valid = false;
  initial.resolve();
  await resumed;
  assert.equal(forced, 0);
});

test('idle explicit retry runs once and failure does not create an automatic retry loop', async () => {
  let forced = 0;
  const failure = Error('fixture failure');
  await assert.rejects(
    resumeAfterSessionWork(
      null,
      () => null,
      () => true,
      async () => {
        forced++;
        throw failure;
      },
    ),
    failure,
  );
  assert.equal(forced, 1);
});

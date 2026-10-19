import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDemoApi as createApi } from '../apps/api/dist-demos/dev/demos/create-demo-api.js';
import { getDalatCatalog } from '../packages/catalog/dist/index.js';
import { createLocalTripRepository, createTripStore } from '../packages/trip-storage/dist/index.js';
const require = createRequire(import.meta.url);
const { callDemoApi } = require('../apps/mobile/.logic-tests/demo-api-controller.js');
const { createAiTripFlow } = require('../apps/mobile/.logic-tests/ai-trip-controller.js');

test('mobile user-input client → real scoped Nest HTTP → review → save/reopen (Google double; URL transport shim, not HTTPS/native proof)', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'goease-mobile-ai-'));
  const code = 'offline-session-code-000000';
  let providerCalls = 0;
  const { app } = await createApi(
    {
      GEMINI_ENABLED: 'true',
      GEMINI_API_KEY: 'offline-provider-key-00000000',
      AI_ACCESS_TOKEN: 'offline-backend-token-00000000000',
      GEMINI_STATE_DIR: directory,
    },
    undefined,
    {
      provider: {
        generate: async (body) => {
          providerCalls++;
          const prompt = JSON.parse(JSON.parse(body).contents[0].parts[0].text);
          return {
            days: prompt.dates.map((date, i) => ({
              date,
              activities: [
                { placeId: getDalatCatalog()[i].id, startTime: '09:00', endTime: '10:00' },
              ],
            })),
          };
        },
      },
    },
    { token: code, expiresAt: Date.now() + 60000 },
  );
  try {
    await app.listen(0, '127.0.0.1');
    const base = await app.getUrl();
    let raw = null,
      receipt;
    const transport = {
      async getItem() {
        return raw;
      },
      async setItem(_key, value) {
        raw = value;
      },
    };
    const store = createTripStore(createLocalTripRepository(transport));
    await store.load();
    const flow = createAiTripFlow({
      store,
      getCatalog: getDalatCatalog,
      newId: () => 'mobile-ai-integration',
      now: () => new Date(),
      request: async (input, signal, token) => {
        const result = await callDemoApi('https://offline-test.example', token, 'ai', {
          input,
          signal,
          fetcher: (url, options) =>
            fetch(url.replace('https://offline-test.example', base), options),
        });
        receipt = result.requestId;
        return result.data;
      },
    });
    const input = {
      name: 'Nhu cầu của nhóm',
      destinationId: 'da-lat',
      startDate: '2099-03-01',
      durationDays: 5,
      people: 4,
      budgetVnd: 0,
    };
    assert.equal((await flow.generate(input, code)).ok, true);
    assert.equal(raw, null);
    assert.match(receipt, /^[0-9a-f-]{36}$/);
    assert.equal(flow.preview().trip.name, input.name);
    assert.equal(flow.preview().trip.days.length, 5);
    assert.equal(flow.preview().trip.people, 4);
    assert.equal(flow.preview().trip.budgetVnd, 0);
    assert.equal((await flow.saveNew()).ok, true);
    const reopened = createTripStore(createLocalTripRepository(transport));
    await reopened.load();
    assert.equal(reopened.getSnapshot().trips[0].trip.generationSource, 'ai');
    assert.equal(providerCalls, 1);
    const failed = await flow.generate(input, 'wrong-session-code-00000000');
    assert.equal(failed.ok, false);
    assert.equal(providerCalls, 1);
    assert.equal(reopened.getSnapshot().trips.length, 1);
  } finally {
    await app.close();
    await rm(directory, { recursive: true, force: true });
  }
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { createApi } from '../dist/app.js';
import { readConfig } from '../dist/config.js';
import { AiQuota } from '../dist/ai/quota.js';
import { GeminiProvider, geminiBody } from '../dist/ai/gemini.js';
import { projectAiPlan, planJsonSchema } from '../dist/ai/projection.js';
import { AiService } from '../dist/ai/service.js';
import { addCalendarDays, aiItineraryResponseSchema, apiErrorResponseSchema, GEMINI_MODEL } from '@goease/contracts';
import { getDalatCatalog } from '@goease/catalog';

const KEY = 'offline-only-provider-key-00000000', TOKEN = 'offline-only-caller-token-00000000';
const input = { name: 'PRIVATE_TRIP_NAME_DO_NOT_SEND', destinationId: 'da-lat', startDate: '2099-02-28', durationDays: 1, people: 4, budgetVnd: null };
const settings = { GEMINI_ENABLED: 'true', GEMINI_API_KEY: KEY, AI_ACCESS_TOKEN: TOKEN };
function validPlan(body) {
  const prompt = JSON.parse(JSON.parse(body).contents[0].parts[0].text);
  return { days: prompt.dates.map((date, index) => ({ date, activities: [
    { placeId: prompt.places[index * 2].id, startTime: '09:00', endTime: '10:00' },
    { placeId: prompt.places[index * 2 + 1].id, startTime: '14:00', endTime: '15:00' },
  ] })) };
}
function wire(plan, finishReason = 'STOP') { return { candidates: [{ finishReason, content: { parts: [{ text: JSON.stringify(plan) }] } }] }; }
async function fixture(run, env = {}, options = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'goease-ai-test-'));
  try { await serve(run, { ...settings, GEMINI_STATE_DIR: join(directory, 'guard'), ...env }, options); }
  finally { await rm(directory, { recursive: true, force: true }); }
}
async function serve(run, env, options) {
  const { app } = await createApi(env, undefined, options);
  try { await app.listen(0, '127.0.0.1'); await run(await app.getUrl()); }
  finally { await app.close(); }
}
function post(base, body = input, extra = {}) {
  return fetch(`${base}/v1/ai/itineraries`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` }, body: JSON.stringify(body), ...extra });
}
async function expectError(response, status, code) {
  assert.equal(response.status, status); const body = apiErrorResponseSchema.parse(await response.json());
  assert.equal(body.error.code, code); assert.equal(body.error.requestId, response.headers.get('x-request-id'));
  assert.equal(JSON.stringify(body).includes(KEY), false); assert.equal(JSON.stringify(body).includes(TOKEN), false);
  assert.equal(JSON.stringify(body).includes('DO_NOT_LEAK'), false); return body;
}

test('AI disabled/missing config fails clearly with zero provider calls; never substitutes sample data', async () => {
  let calls = 0; const provider = { generate: async () => { calls++; return {}; } };
  await fixture(async (base) => expectError(await post(base), 503, 'AI_DISABLED'), { GEMINI_ENABLED: 'false' }, { provider });
  await fixture(async (base) => expectError(await post(base), 503, 'AI_NOT_CONFIGURED'), { GEMINI_API_KEY: '' }, { provider });
  await fixture(async (base) => expectError(await post(base), 503, 'AI_NOT_CONFIGURED'), { AI_ACCESS_TOKEN: '' }, { provider });
  assert.equal(calls, 0);
});
test('AI health is configured-unverified, not provider readiness; health never calls Gemini', () => fixture(async (base) => {
  const response = await fetch(`${base}/v1/health`); const data = await response.json();
  assert.equal(data.dependencies.gemini, 'configured-unverified'); assert.equal(data.scope, 'process');
}, {}, { provider: { generate: () => assert.fail('health must not call Gemini') } }));
test('AI authorization, arbitrary prompt/model/tools, invalid days/date/people/money/query and oversize are rejected before provider', () => fixture(async (base) => {
  await expectError(await post(base, input, { headers: { 'content-type': 'application/json' } }), 401, 'AI_ACCESS_DENIED');
  await expectError(await post(base, input, { headers: { 'content-type': 'application/json', authorization: 'Bearer wrong' } }), 401, 'AI_ACCESS_DENIED');
  for (const body of [ { ...input, prompt: 'DO_NOT_LEAK' }, { ...input, model: 'arbitrary' }, { ...input, tools: [] },
    { ...input, durationDays: 6 }, { ...input, durationDays: 0 }, { ...input, startDate: '2026-02-30' },
    { ...input, startDate: '2000-01-01' }, { ...input, people: 21 }, { ...input, budgetVnd: -1 }, { ...input, budgetVnd: 1.5 } ]) {
    await expectError(await post(base, body), 400, 'BAD_REQUEST');
  }
  await expectError(await fetch(`${base}/v1/ai/itineraries?model=x`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` }, body: JSON.stringify(input) }), 400, 'BAD_REQUEST');
  await expectError(await post(base, { ...input, name: 'x'.repeat(9000) }), 413, 'PAYLOAD_TOO_LARGE');
}, {}, { provider: { generate: () => assert.fail('invalid request must not call Gemini') } }));
test('AI HTTP 1/5 days gives validated editable Trip with canonical names, unknown prices and recomputed totals (provider double)', async () => {
  for (const durationDays of [1, 5]) await fixture(async (base) => {
    const response = await post(base, { ...input, durationDays }); assert.equal(response.status, 200);
    const data = aiItineraryResponseSchema.parse(await response.json());
    assert.equal(data.kind, 'ai'); assert.equal(data.trip.days.length, durationDays); assert.equal(data.budget.knownCostVnd, 0);
    assert.equal(data.budget.unknownCostCount, durationDays * 2); assert.equal(data.trip.name, input.name);
    for (const day of data.trip.days) for (const activity of day.activities) {
      assert.equal(activity.name, getDalatCatalog().find((place) => place.id === activity.location.placeId).name);
      assert.equal(activity.costVnd, null); assert.equal('coordinates' in activity, false);
    }
  }, {}, { provider: { generate: async (body) => validPlan(body) } });
});
test('AI projection rejects unknown/repeated places, wrong days/dates/hours, overlap, reverse order and any invented prices/coordinates/text', () => {
  const catalog = getDalatCatalog(), good = validPlan(geminiBody(input, catalog, readConfig({})));
  const mutations = [
    (p) => { p.days[0].activities[0].placeId = 'invented'; },
    (p) => { p.days[0].activities[1].placeId = p.days[0].activities[0].placeId; },
    (p) => { p.days = []; }, (p) => { p.days.push(structuredClone(p.days[0])); },
    (p) => { p.days[0].date = '2099-03-01'; }, (p) => { p.days[0].date = '2099-02-30'; },
    (p) => { p.days[0].activities[0].startTime = '25:00'; }, (p) => { p.days[0].activities[0].endTime = '08:59'; },
    (p) => { p.days[0].activities[1].startTime = '09:30'; }, (p) => { p.days[0].activities.reverse(); },
    (p) => { p.days[0].activities[0].costVnd = -1; }, (p) => { p.days[0].activities[0].costVnd = 0; },
    (p) => { p.days[0].activities[0].coordinates = { latitude: 0, longitude: 0 }; },
    (p) => { p.days[0].activities[0].notes = 'DO_NOT_LEAK'; }, (p) => { p.days[0].activities[0].startTime = null; },
    (p) => { p.days[0].activities = []; },
    (p) => { p.days[0].activities.push(...structuredClone(p.days[0].activities)); },
  ];
  for (const mutate of mutations) { const plan = structuredClone(good); mutate(plan); assert.throws(() => projectAiPlan(plan, input, catalog, 'qa-ai-trip', GEMINI_MODEL), { code: 'AI_OUTPUT_INVALID' }); }
});
test('AI money comes exclusively from shared catalog rule: reference × people, free=0, unknown=null, total cap enforced', () => {
  const catalog = getDalatCatalog(), plan = validPlan(geminiBody(input, catalog, readConfig({})));
  catalog[0].referenceCost = { status: 'reference', amountVnd: 100000, basis: 'per-person', sourceUrl: catalog[0].sources[0].url, checkedOn: '2026-10-14' };
  catalog[1].referenceCost = { ...catalog[0].referenceCost, amountVnd: 0 };
  const result = projectAiPlan(plan, { ...input, budgetVnd: 300000 }, catalog, 'qa-ai-trip', GEMINI_MODEL);
  assert.equal(result.budget.knownCostVnd, 400000); assert.equal(result.budget.overBudgetVnd, 100000); assert.equal(result.budget.unknownCostCount, 0);
  assert.equal(result.trip.days[0].activities[1].costVnd, 0);
  const altered = structuredClone(result); altered.budget.knownCostVnd = 1; assert.equal(aiItineraryResponseSchema.safeParse(altered).success, false);
  catalog[0].referenceCost.amountVnd = 100000000;
  assert.throws(() => projectAiPlan(plan, input, catalog, 'qa-ai-trip', GEMINI_MODEL), { code: 'AI_OUTPUT_INVALID' });
  const allPriced = getDalatCatalog().map((place) => ({ ...place, referenceCost: { status: 'reference', amountVnd: 25000000, basis: 'per-person', sourceUrl: place.sources[0].url, checkedOn: '2026-10-14' } }));
  const tooCostly = { days: Array.from({ length: 5 }, (_, day) => ({ date: addCalendarDays(input.startDate, day), activities: [0, 1, 2].map((slot) => ({ placeId: allPriced[day * 3 + slot].id, startTime: ['09:00', '11:00', '14:00'][slot], endTime: ['10:00', '12:00', '15:00'][slot] })) })) };
  assert.throws(() => projectAiPlan(tooCostly, { ...input, durationDays: 5 }, allPriced, 'qa-ai-trip', GEMINI_MODEL), { code: 'AI_OUTPUT_INVALID' });
});
test('Gemini adapter sends fixed model/structured schema/header key with no trip name/coords/prices, then validates wire output (fetch double)', () => fixture(async (base) => {
  const response = await post(base); assert.equal(response.status, 200); await response.json();
}, {}, { fetcher: async (url, options) => {
  assert.equal(url, `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`);
  assert.equal(options.headers['x-goog-api-key'], KEY); assert.equal(options.redirect, 'error');
  assert.equal(url.includes(KEY), false); assert.equal(options.body.includes(KEY), false); assert.equal(options.body.includes(input.name), false);
  const request = JSON.parse(options.body); assert.equal(request.generationConfig.candidateCount, 1);
  assert.equal(request.generationConfig.responseMimeType, 'application/json');
  assert.deepEqual(request.generationConfig.responseJsonSchema, planJsonSchema(input, getDalatCatalog()));
  assert.equal('responseFormat' in request.generationConfig, false);
  const prompt = JSON.parse(request.contents[0].parts[0].text);
  assert.equal('coordinates' in prompt.places[0], false); assert.equal('referenceCost' in prompt.places[0], false); assert.equal('tools' in request, false);
  const result = wire(validPlan(options.body)); result.candidates[0].content.parts[0].thoughtSignature = 'opaque-test-signature';
  return new Response(JSON.stringify(result));
} }));
test('Gemini adapter redacts provider errors, limits body/output, refuses blocked/truncated/tool/multiple candidates; no automatic retries', async () => {
  for (const [status, code] of [[429, 'AI_UPSTREAM_RATE_LIMITED'], [401, 'AI_UPSTREAM_DENIED'], [403, 'AI_UPSTREAM_DENIED'], [500, 'AI_UPSTREAM_UNAVAILABLE'], [302, 'AI_UPSTREAM_UNAVAILABLE']]) {
    let calls = 0; const provider = new GeminiProvider(readConfig(settings), async () => { calls++; return new Response('DO_NOT_LEAK', { status }); });
    await assert.rejects(provider.generate('{}', new AbortController().signal), (e) => e.code === code && !e.message.includes('DO_NOT_LEAK'));
    assert.equal(calls, 1);
  }
  for (const raw of ['not json', '{}', JSON.stringify(wire({}, 'MAX_TOKENS')), JSON.stringify(wire({}, 'SAFETY')),
    JSON.stringify({ candidates: [wire({}).candidates[0], wire({}).candidates[0]] }),
    JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ functionCall: { name: 'x' } }] } }] }),
  ]) {
    const provider = new GeminiProvider(readConfig(settings), async () => new Response(raw));
    await assert.rejects(provider.generate('{}', new AbortController().signal), { code: 'AI_OUTPUT_INVALID' });
  }
  const large = new GeminiProvider(readConfig(settings), async () => new Response('x'.repeat(65537)));
  await assert.rejects(large.generate('{}', new AbortController().signal), { code: 'AI_OUTPUT_TOO_LARGE' });
  assert.throws(() => geminiBody(input, getDalatCatalog().map((place) => ({ ...place, name: 'x'.repeat(10000) })), readConfig(settings)), { code: 'PAYLOAD_TOO_LARGE' });
});
test('AI HTTP timeout aborts provider and releases busy state even for a non-cooperative double', () => {
  let calls = 0, firstSignal;
  return fixture(async (base) => {
    await expectError(await post(base), 504, 'REQUEST_TIMEOUT'); assert.equal(firstSignal.aborted, true);
    const response = await post(base); assert.equal(response.status, 200); await response.json(); assert.equal(calls, 2);
  }, { GEMINI_TIMEOUT_MS: '100' }, { provider: { generate: async (body, signal) => { calls++; if (calls === 1) { firstSignal = signal; return new Promise(() => {}); } return validPlan(body); } } });
});
test('AI concurrent HTTP is rejected; client disconnect cancels provider and allows next call', () => {
  let enter; const entered = new Promise((resolve) => { enter = resolve; }); let calls = 0, firstSignal;
  let reportAbort; const aborted = new Promise((resolve) => { reportAbort = resolve; });
  return fixture(async (base) => {
    const controller = new AbortController(); const first = post(base, input, { signal: controller.signal });
    await entered; await expectError(await post(base), 409, 'AI_BUSY'); controller.abort(); await assert.rejects(first);
    await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error('Client disconnect did not abort provider')), 2000); aborted.then(() => { clearTimeout(timer); resolve(); }); });
    assert.equal(firstSignal.aborted, true);
    const next = await post(base); assert.equal(next.status, 200); await next.json(); assert.equal(calls, 2);
  }, {}, { provider: { generate: async (body, signal) => { calls++; if (calls === 1) { firstSignal = signal; signal.addEventListener('abort', reportAbort, { once: true }); enter(); return new Promise(() => {}); } return validPlan(body); } } });
});
test('AI rate limit is global, cannot be bypassed with X-Forwarded-For and prevents extra provider call', () => {
  let calls = 0;
  return fixture(async (base) => {
    const first = await post(base); assert.equal(first.status, 200); await first.json();
    await expectError(await post(base, input, { headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}`, 'x-forwarded-for': '203.0.113.1' } }), 429, 'AI_RATE_LIMITED');
    assert.equal(calls, 1);
  }, { GEMINI_MAX_ATTEMPTS_PER_MINUTE: '1' }, { provider: { generate: async (body) => { calls++; return validPlan(body); } } });
});
test('AI reserves failed provider attempts durably before outbound and total budget survives server restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'goease-ai-budget-')); const env = { ...settings, GEMINI_STATE_DIR: directory, GEMINI_MAX_TOTAL_ATTEMPTS: '1' }; let calls = 0;
  const options = { fetcher: async () => { calls++; return new Response('DO_NOT_LEAK', { status: 429 }); } };
  try {
    await serve(async (base) => expectError(await post(base), 429, 'AI_UPSTREAM_RATE_LIMITED'), env, options);
    assert.equal(JSON.parse(await readFile(join(directory, 'quota.json'), 'utf8')).total, 1);
    await serve(async (base) => expectError(await post(base), 429, 'AI_BUDGET_EXCEEDED'), env, options);
    assert.equal(calls, 1);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
test('durable quota enforces day/total limits, no auto-refund/reset, single owner and backward-clock fail closed', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'goease-ai-quota-'));
  const config = readConfig({ ...settings, GEMINI_STATE_DIR: directory, GEMINI_MAX_ATTEMPTS_PER_DAY: '1', GEMINI_MAX_TOTAL_ATTEMPTS: '2' });
  const a = new AiQuota(config), b = new AiQuota(config);
  try {
    await a.reserve(new Date('2026-10-14T00:00:00Z'));
    await assert.rejects(b.reserve(new Date('2026-10-14T00:00:01Z')), { code: 'AI_GUARD_UNAVAILABLE' });
    await assert.rejects(a.reserve(new Date('2026-10-14T00:01:00Z')), { code: 'AI_BUDGET_EXCEEDED' });
    await a.reserve(new Date('2026-10-15T00:00:00Z'));
    await assert.rejects(a.reserve(new Date('2026-10-16T00:00:00Z')), { code: 'AI_BUDGET_EXCEEDED' });
    await assert.rejects(a.reserve(new Date('2026-10-13T00:00:00Z')), { code: 'AI_GUARD_UNAVAILABLE' });
  } finally { await a.close(); await b.close(); await rm(directory, { recursive: true, force: true }); }
});
test('corrupt or missing initialized quota state fails closed instead of silently resetting limits', async () => {
  for (const missing of [false, true]) {
    const directory = await mkdtemp(join(tmpdir(), 'goease-ai-corrupt-')); const config = readConfig({ ...settings, GEMINI_STATE_DIR: directory });
    const first = new AiQuota(config); await first.reserve(new Date('2026-10-14T00:00:00Z')); await first.close();
    if (missing) await unlink(join(directory, 'quota.json')); else await writeFile(join(directory, 'quota.json'), '{bad');
    const next = new AiQuota(config);
    try { await assert.rejects(next.reserve(new Date('2026-10-14T00:01:00Z')), { code: 'AI_GUARD_UNAVAILABLE' }); }
    finally { await next.close(); await rm(directory, { recursive: true, force: true }); }
  }
});
test('AI config accepts dotted provider keys while rejecting header injection', () => {
  const dotted = `AQ.${'a'.repeat(50)}`;
  assert.equal(readConfig({ ...settings, GEMINI_API_KEY: dotted }).GEMINI_API_KEY, dotted);
  for (const value of [`${dotted}\r\nInjected: value`, `${dotted} value`, 'x'.repeat(257)]) {
    assert.throws(() => readConfig({ ...settings, GEMINI_API_KEY: value }), /Invalid API config: GEMINI_API_KEY/);
  }
});

test('AI config rejects arbitrary models/bad tokens and mismatched deadlines without printing supplied values', () => {
  for (const bad of [{ GEMINI_MODEL: 'proxy-model' }, { AI_ACCESS_TOKEN: 'short' }, { GEMINI_TIMEOUT_MS: '5000' }, { GEMINI_MAX_TOTAL_ATTEMPTS: '101' }, { GEMINI_MAX_OUTPUT_TOKENS: '1000000' }]) assert.throws(() => readConfig({ ...settings, ...bad }));
  assert.throws(() => readConfig({ ...settings, GEMINI_API_KEY: 'DO_NOT_LEAK !' }), (e) => !e.message.includes('DO_NOT_LEAK'));
});
test('already cancelled request never reserves quota or invokes provider', async () => {
  const controller = new AbortController(); controller.abort();
  const service = new AiService(readConfig(settings), { provider: { generate: () => assert.fail('must not invoke') } });
  await assert.rejects(service.generate(input, {}, `Bearer ${TOKEN}`, controller.signal), { code: 'AI_CANCELLED' }); await service.onModuleDestroy();
});
test('AI HTTP rejects an unknown provider place instead of returning/falling back to a sample Trip', () => fixture(async (base) => {
  await expectError(await post(base), 502, 'AI_OUTPUT_INVALID');
}, {}, { provider: { generate: async (body) => { const plan = validPlan(body); plan.days[0].activities[0].placeId = 'invented'; return plan; } } }));
test('unwritable quota path blocks HTTP AI before outbound', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'goease-ai-io-')); const file = join(directory, 'not-a-directory'); await writeFile(file, 'x');
  try { await serve(async (base) => expectError(await post(base), 503, 'AI_GUARD_UNAVAILABLE'), { ...settings, GEMINI_STATE_DIR: file }, { provider: { generate: () => assert.fail('must not invoke') } }); }
  finally { await rm(directory, { recursive: true, force: true }); }
});
test('live harness refuses to run without explicit one-call opt-in/config; no live success invented', () => {
  const result = spawnSync(process.execPath, ['scripts/gemini-live.mjs'], { cwd: new URL('..', import.meta.url), env: { ...process.env, GEMINI_ENABLED: 'false', GEMINI_API_KEY: '', AI_ACCESS_TOKEN: '' }, encoding: 'utf8', timeout: 5000 });
  assert.equal(result.status, 2); assert.match(result.stdout, /LIVE NOT RUN/);
});

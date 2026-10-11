import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { isAiDraftRequest, isAiScheduleDraft, type AiCandidatePlace } from '@goease/contracts';
import { AiError, type AiErrorCode } from '../src/modules/ai/errors.js';
import { GEMINI_INTERACTIONS_URL, MAX_GEMINI_BODY_BYTES, generateGeminiSchedule, readGeminiConfig } from '../src/modules/ai/gemini.js';
import { aiModelInput, aiResponseSchema, prepareAiRequest, requestFromCatalog, validateAiSchedule } from '../src/modules/ai/schedule.js';
import { runAiProbe } from '../src/modules/ai/probe.js';

// Test-only UUIDs and fetch doubles. Coordinates retain the public CC0 sample;
// none of these responses, identities, token counts or IDs are Gemini live evidence.
const ids = ['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000003'];
function catalog(): AiCandidatePlace[] {
  return ids.map((id, index) => ({ id, destinationCode: 'VN-HANOI-SAMPLE', name: `Địa điểm TEST ONLY ${index + 1}`,
    latitude: 21.028611, longitude: 105.835556, sourceUrl: 'https://www.wikidata.org/w/index.php?title=Q1202019&oldid=2549929856',
    attribution: 'TEST ONLY fixture · Wikidata CC0-1.0 structured coordinates', active: true, isSample: true }));
}
const config = { apiKey: 'TEST_ONLY_NOT_A_PROVIDER_KEY', model: 'gemini-3.8-flash' };
function draft(durationDays = 1) {
  return { days: Array.from({ length: durationDays }, (_, index) => ({ dayNumber: index + 1,
    activities: [{ placeId: ids[0]!, startMinute: 540, endMinute: 600 }, { placeId: ids[1]!, startMinute: 600, endMinute: 660 }] })) };
}
function interaction(value: unknown = draft(), usage: unknown = { total_input_tokens: 10, total_output_tokens: 20, total_thought_tokens: 5, total_tokens: 35 }) {
  return { status: 'completed', steps: [{ type: 'thought', content: [{ type: 'thought_summary', text: 'Not the JSON answer.' }] },
    { type: 'model_output', content: [{ type: 'text', text: JSON.stringify(value) }] }], ...(usage === undefined ? {} : { usage }) };
}
function response(value: unknown = interaction()) { return new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } }); }
function rejected(code: AiErrorCode, attempts?: number) {
  return (error: unknown) => error instanceof AiError && error.code === code && (attempts === undefined || error.attempts === attempts);
}
function run(fetch: typeof globalThis.fetch, options: Parameters<typeof generateGeminiSchedule>[3] = {}) {
  const places = catalog();
  return generateGeminiSchedule(config, requestFromCatalog(1, places), places, { fetch, ...options });
}

test('AI guards reject sparse arrays, extra keys, malformed UUIDs and numeric strings', () => {
  assert.equal(isAiDraftRequest({ durationDays: 1, candidatePlaceIds: new Array(1) }), false);
  assert.equal(isAiScheduleDraft({ days: new Array(1) }), false);
  assert.equal(isAiScheduleDraft({ days: [{ dayNumber: 1, activities: new Array(1) }] }), false);
  assert.equal(isAiDraftRequest({ durationDays: '1', candidatePlaceIds: ids }), false);
  assert.equal(isAiDraftRequest({ durationDays: 1, candidatePlaceIds: [ids[0], ids[0]!.toUpperCase()] }), false);
  assert.equal(isAiDraftRequest({ durationDays: 1, candidatePlaceIds: ['not-a-uuid'] }), false);
  assert.equal(isAiDraftRequest({ durationDays: 1, candidatePlaceIds: ids, ownerId: 'invented' }), false);
  assert.equal(isAiScheduleDraft({ ...draft(), totalCostVnd: 0 }), false);
});

test('AI input binds active sample IDs to one destination and bounded canonical fields', () => {
  const places = catalog(), request = requestFromCatalog(1, places);
  const prepared = prepareAiRequest({ ...request, candidatePlaceIds: request.candidatePlaceIds.map(id => id.toUpperCase()) }, places);
  assert.equal(prepared.candidates[0]?.id, ids[0]);
  for (const patch of [{ active: false }, { isSample: false }, { latitude: NaN }, { latitude: 91 }, { longitude: Infinity },
    { longitude: 181 }, { sourceUrl: 'http://untrusted.example' }, { sourceUrl: 'https://user:password@private.example' },
    { attribution: '' }, { name: 'bad\nname' }, { id: 'broken' }]) {
    assert.throws(() => prepareAiRequest(request, [{ ...places[0]!, ...patch }, ...places.slice(1)]), rejected('AI_INVALID_INPUT'));
  }
  assert.throws(() => prepareAiRequest(request, [places[0]!, places[0]!]), rejected('AI_INVALID_INPUT'));
  assert.throws(() => prepareAiRequest(request, places.slice(1)), rejected('AI_INVALID_INPUT'));
  assert.throws(() => prepareAiRequest(request, [places[0]!, { ...places[1]!, destinationCode: 'OTHER' }, places[2]!]), rejected('AI_INVALID_INPUT'));
  assert.throws(() => prepareAiRequest(request, new Array<AiCandidatePlace>(3)), rejected('AI_INVALID_INPUT'));
  assert.equal(aiModelInput(prepared).includes('latitude'), false);
  assert.equal(aiModelInput(prepared).includes('sourceUrl'), false);
});

test('AI schema limits every object and provider input to ID/name only', () => {
  const places = catalog(), prepared = prepareAiRequest(requestFromCatalog(3, places), places);
  const schema = aiResponseSchema(prepared);
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.days.minItems, 3); assert.equal(schema.properties.days.maxItems, 3);
  assert.equal(schema.properties.days.items.additionalProperties, false);
  assert.equal(schema.properties.days.items.properties.activities.items.additionalProperties, false);
  assert.deepEqual(schema.properties.days.items.properties.activities.items.properties.placeId.enum, ids);
  assert.deepEqual(JSON.parse(aiModelInput(prepared)), { durationDays: 3,
    candidates: places.map(place => ({ placeId: place.id, name: place.name })) });
});

test('AI validates 1–5 exact ordered days, adjacent/gapped intervals and 24:00 without inventing cost', () => {
  const places = catalog(), prepared = prepareAiRequest(requestFromCatalog(5, places), places), value = draft(5);
  value.days[0]!.activities = [{ placeId: ids[0]!, startMinute: 0, endMinute: 1 }, { placeId: ids[1]!, startMinute: 1439, endMinute: 1440 }];
  const result = validateAiSchedule(value, prepared);
  assert.equal(result.durationDays, 5); assert.equal(result.unknownCostCount, 10);
  assert.equal(result.knownSubtotalVnd, 0); assert.equal(typeof result.knownSubtotalVnd, 'number');
  assert.equal(result.estimatedTotalVnd, null); assert.equal(result.days[0]?.activities[1]?.endMinute, 1440);
  assert.equal(result.days[0]?.activities[0]?.estimatedCostVnd, null);
  assert.equal(result.days[0]?.activities[0]?.title, places[0]?.name);
  assert.equal(result.days[0]?.activities[0]?.sourceUrl, places[0]?.sourceUrl);
  assert.equal(result.days[0]?.activities[0]?.latitude, places[0]?.latitude);
  assert.equal(result.timeZone, 'Asia/Ho_Chi_Minh');
});

test('AI rejects invented IDs/fields, missing/duplicate/reordered days and invalid time order', () => {
  const places = catalog(), prepared = prepareAiRequest(requestFromCatalog(2, places), places);
  const cases: unknown[] = [draft(1), { days: [] }, { days: [draft().days[0], draft().days[0]] },
    { days: [{ ...draft().days[0], dayNumber: 2 }, { ...draft().days[0], dayNumber: 1 }] }];
  for (const patch of [{ placeId: '00000000-0000-4000-8000-000000000099' }, { title: 'Invented hotel' },
    { latitude: 0 }, { estimatedCostVnd: 0 }, { startMinute: '540' }, { startMinute: -1 }, { endMinute: 1441 },
    { endMinute: 540 }, { startMinute: 540.5 }]) {
    const value = draft(2); Object.assign(value.days[0]!.activities[0]!, patch); cases.push(value);
  }
  const duplicate = draft(2); duplicate.days[0]!.activities[1]!.placeId = ids[0]!.toUpperCase(); cases.push(duplicate);
  const overlap = draft(2); overlap.days[0]!.activities[1]!.startMinute = 599; cases.push(overlap);
  const unordered = draft(2); unordered.days[0]!.activities.reverse(); cases.push(unordered);
  const empty = draft(2); empty.days[0]!.activities = []; cases.push(empty);
  const tooMany = draft(2); tooMany.days[0]!.activities = new Array(11).fill(draft().days[0]!.activities[0]); cases.push(tooMany);
  for (const value of cases) assert.throws(() => validateAiSchedule(value, prepared), rejected('AI_INVALID_OUTPUT'));
});

test('Gemini sends fixed REST endpoint/header and exact non-stored JSON schema request', async () => {
  const places = catalog(), canonicalName = places[0]!.name;
  const result = await generateGeminiSchedule(config, requestFromCatalog(1, places), places, { fetch: async (url, init) => {
    assert.equal(url, GEMINI_INTERACTIONS_URL); assert.equal(init?.method, 'POST'); assert.equal(init.redirect, 'error');
    const headers = new Headers(init.headers); assert.equal(headers.get('x-goog-api-key'), config.apiKey);
    assert.equal(String(url).includes(config.apiKey), false);
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    assert.equal(body['model'], config.model); assert.equal(body['store'], false); assert.equal(body['background'], false); assert.equal(body['stream'], false);
    assert.deepEqual(body['generation_config'], { max_output_tokens: 2048 });
    assert.equal('tools' in body, false); assert.equal('previous_interaction_id' in body, false); assert.equal('agent' in body, false);
    assert.equal('thinking_level' in (body['generation_config'] as object), false);
    assert.equal((body['response_format'] as Record<string, unknown>)['mime_type'], 'application/json');
    assert.equal(String(body['input']).includes('latitude'), false); assert.equal(String(body['input']).includes('attribution'), false);
    places[0]!.name = 'Changed after request'; places[0]!.latitude = 0;
    return response();
  } });
  assert.equal(result.schedule.days[0]?.activities[0]?.title, canonicalName);
  assert.equal(result.schedule.days[0]?.activities[0]?.latitude, 21.028611);
  assert.deepEqual(result.evidence.usage, { inputTokens: 10, outputTokens: 20, thoughtTokens: 5, totalTokens: 35 });
  assert.equal(result.evidence.attempts, 1); assert.equal(result.evidence.chargedCostUsd, null);
});

test('Gemini configuration/input/options refuse before fetch and never choose a default model', async () => {
  let calls = 0; const fetch: typeof globalThis.fetch = async () => { calls++; return response(); };
  for (const env of [{}, { GEMINI_API_KEY: config.apiKey }, { GEMINI_MODEL: config.model },
    { GEMINI_API_KEY: 'bad\nkey', GEMINI_MODEL: config.model }, { GEMINI_API_KEY: config.apiKey, GEMINI_MODEL: 'https://other.example' }]) {
    assert.throws(() => readGeminiConfig(env), rejected('AI_NOT_CONFIGURED'));
  }
  await assert.rejects(generateGeminiSchedule({ apiKey: '', model: '' }, {}, [], { fetch }), rejected('AI_NOT_CONFIGURED', 0));
  await assert.rejects(generateGeminiSchedule(config, { durationDays: 0, candidatePlaceIds: ids }, catalog(), { fetch }), rejected('AI_INVALID_INPUT', 0));
  for (const options of [{ timeoutMs: 0 }, { timeoutMs: 30_001 }, { maxOutputTokens: 4097 }, { maxOutputTokens: 127 }, { maxRetries: 2 as 1 }]) {
    await assert.rejects(run(fetch, options), rejected('AI_INVALID_INPUT', 0));
  }
  assert.equal(calls, 0);
});

test('Gemini accepts only a single raw completed model_output/text; SDK helpers and incomplete responses fail', async () => {
  const valid = interaction(), modelOutput = valid.steps[1]!;
  const cases = [ { output_text: JSON.stringify(draft()), status: 'completed' },
    ...['incomplete', 'requires_action', 'failed', 'cancelled', 'in_progress'].map(status => ({ ...valid, status })),
    { ...valid, steps: [] }, { ...valid, steps: [modelOutput, modelOutput] },
    { ...valid, steps: [{ ...modelOutput, content: [{ type: 'text', text: '' }] }] },
    { ...valid, steps: [{ ...modelOutput, content: [{ type: 'text', text: '{' }] }] },
    { ...valid, steps: [{ ...modelOutput, content: [...modelOutput.content, ...modelOutput.content] }] },
    interaction({ days: [{ dayNumber: 1, activities: [{ placeId: ids[0], startMinute: 20, endMinute: 10 }] }] }),
    interaction(draft(), { total_tokens: -1 }), interaction(draft(), { total_tokens: '35' }) ];
  for (const value of cases) {
    let calls = 0;
    await assert.rejects(run(async () => { calls++; return response(value); }), rejected('AI_INVALID_OUTPUT', 1));
    assert.equal(calls, 1);
  }
  const missing = interaction(); delete (missing as { usage?: unknown }).usage;
  assert.deepEqual((await run(async () => response(missing))).evidence.usage,
    { inputTokens: null, outputTokens: null, thoughtTokens: null, totalTokens: null });
});

test('Gemini retries only transient HTTP statuses once with bounded backoff', async () => {
  for (const status of [408, 429, 500, 503, 599]) {
    let calls = 0;
    const result = await run(async () => ++calls === 1 ? new Response('PRIVATE PROVIDER ERROR', { status, headers: { 'Retry-After': '999999' } }) : response(), { random: () => 0 });
    assert.equal(calls, 2); assert.equal(result.evidence.attempts, 2);
  }
  let calls = 0;
  await assert.rejects(run(async () => { calls++; return new Response('PRIVATE', { status: 503 }); }, { random: () => 0 }), rejected('AI_PROVIDER_FAILURE', 2));
  assert.equal(calls, 2);
});

test('Gemini permanent/redirect/network errors and CLI-style no-retry each use one call and redact secrets', async () => {
  for (const status of [400, 402, 403, 404, 302, 503]) {
    let calls = 0;
    await assert.rejects(run(async () => { calls++; return new Response(`PRIVATE ${config.apiKey}`, { status }); }, { maxRetries: 0 }), error => {
      assert.ok(rejected('AI_PROVIDER_FAILURE', 1)(error)); assert.ok(!JSON.stringify(error).includes(config.apiKey)); return true;
    });
    assert.equal(calls, 1);
  }
  let calls = 0;
  await assert.rejects(run(async () => { calls++; throw new TypeError(`PRIVATE ${config.apiKey} prompt/body`); }), error => {
    assert.ok(rejected('AI_PROVIDER_FAILURE', 1)(error)); assert.ok(error instanceof Error);
    assert.ok(!error.message.includes('PRIVATE')); assert.ok(!('cause' in error)); return true;
  });
  assert.equal(calls, 1);
});

test('Gemini whole deadline includes delayed headers and a stalled response body, then cancels the reader', async () => {
  let cancelled = false;
  const started = performance.now();
  await assert.rejects(run(async () => {
    await delay(25);
    return new Response(new ReadableStream<Uint8Array>({ cancel() { cancelled = true; } }));
  }, { timeoutMs: 60 }), rejected('AI_TIMEOUT', 1));
  assert.ok(performance.now() - started >= 45 && performance.now() - started < 1500);
  await delay(0); assert.equal(cancelled, true);
});

test('Gemini body byte bound handles streaming, content-length and invalid UTF-8 without repair', async () => {
  const oversize = new TextEncoder().encode('ă'.repeat(MAX_GEMINI_BODY_BYTES / 2 + 1));
  let cancelled = false;
  await assert.rejects(run(async () => new Response(new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(oversize); }, cancel() { cancelled = true; },
  }))), rejected('AI_INVALID_OUTPUT', 1));
  assert.equal(cancelled, true);
  await assert.rejects(run(async () => new Response('x', { headers: { 'Content-Length': String(MAX_GEMINI_BODY_BYTES + 1) } })), rejected('AI_INVALID_OUTPUT', 1));
  await assert.rejects(run(async () => new Response(new Uint8Array([255]))), rejected('AI_INVALID_OUTPUT', 1));
});

test('Gemini caller cancellation before fetch, during fetch/body and backoff does not retry', async () => {
  const early = new AbortController(); early.abort(); let calls = 0;
  await assert.rejects(run(async () => { calls++; return response(); }, { signal: early.signal }), rejected('AI_CANCELLED', 0)); assert.equal(calls, 0);
  for (const phase of ['fetch', 'body', 'backoff']) {
    const controller = new AbortController(); calls = 0; let cancelled = false;
    const timer = setTimeout(() => controller.abort(), 20);
    try {
      await assert.rejects(run(async () => {
        calls++;
        if (phase === 'fetch') return new Promise<Response>(() => {}); // TEST ONLY: ignores AbortSignal to exercise the wrapper bound.
        if (phase === 'backoff') return new Response('PRIVATE', { status: 429 });
        return new Response(new ReadableStream<Uint8Array>({ cancel() { cancelled = true; } }));
      }, { signal: controller.signal }), rejected('AI_CANCELLED', 1));
      assert.equal(calls, 1); if (phase === 'body') assert.equal(cancelled, true);
    } finally { clearTimeout(timer); }
  }
});

test('Gemini deadline bounds fetch itself and backoff with at most one attempted call', async () => {
  await assert.rejects(run(async () => new Promise<Response>(() => {}), { timeoutMs: 30 }), rejected('AI_TIMEOUT', 1));
  let calls = 0;
  await assert.rejects(run(async () => { calls++; return new Response('PRIVATE', { status: 429 }); }, { timeoutMs: 30 }), rejected('AI_TIMEOUT', 1));
  assert.equal(calls, 1);
});

const liveFlags = ['--live', '--authorize-live-spend', '--project-reference=test-project', '--quota-reference=test-quota', '--budget-reference=test-approval'];
test('AI probe rejects missing/ambiguous spend authorization before catalog or network access', async () => {
  let loads = 0, calls = 0;
  const dependencies = { loadCatalog: async () => { loads++; return catalog(); }, fetch: (async () => { calls++; return response(); }) as typeof globalThis.fetch };
  for (const flags of [[], ['--live'], ['--live', '--authorize-live-spend'], [...liveFlags, '--days=2'], [...liveFlags, '--dry-run'],
    [...liveFlags, '--live'], [...liveFlags, '--unexpected'], [...liveFlags, '--project-reference=duplicate'], ['--dry-run', '--authorize-live-spend']]) {
    const result = await runAiProbe(flags, { DATABASE_URL: 'TEST_ONLY_DATABASE_URL', GEMINI_API_KEY: config.apiKey, GEMINI_MODEL: config.model }, dependencies);
    assert.equal(result.exitCode, 1); assert.equal(result.receipt.status, 'failed'); assert.equal(result.receipt.attempts, 0);
  }
  const missing = await runAiProbe(liveFlags, { DATABASE_URL: 'TEST_ONLY_DATABASE_URL' }, dependencies);
  assert.equal(missing.receipt.code, 'AI_NOT_CONFIGURED');
  assert.equal(loads, 0); assert.equal(calls, 0);
});

test('AI probe dry-run needs no AI key and emits schema/input without outbound call or generated itinerary', async () => {
  let calls = 0;
  const result = await runAiProbe(['--dry-run', '--days=5'], { DATABASE_URL: 'TEST_ONLY_DATABASE_URL' }, {
    loadCatalog: async () => catalog(), fetch: async () => { calls++; return response(); },
  });
  assert.equal(result.exitCode, 0); assert.equal(result.receipt.mode, 'dry-run'); assert.equal(result.receipt.outboundCalls, 0);
  assert.equal('schedule' in result.receipt, false); assert.equal(calls, 0); assert.equal(JSON.stringify(result).includes(config.apiKey), false);
});

test('AI probe live-mode mechanics use a single test double call, bounded tokens and unknown billing', async () => {
  let calls = 0;
  const result = await runAiProbe(liveFlags, { DATABASE_URL: 'TEST_ONLY_DATABASE_URL', GEMINI_API_KEY: config.apiKey, GEMINI_MODEL: config.model }, {
    loadCatalog: async () => catalog(), fetch: async (_url, init) => {
      calls++; assert.deepEqual((JSON.parse(init?.body as string) as { generation_config: unknown }).generation_config, { max_output_tokens: 1024 }); return response();
    },
  });
  assert.equal(result.exitCode, 0); assert.equal(calls, 1); assert.equal(result.receipt.attempts, 1);
  assert.equal(result.receipt.chargedCostUsd, null); assert.equal(result.receipt.costStatus, 'unavailable');
  const failure = await runAiProbe(liveFlags, { DATABASE_URL: 'TEST_ONLY_DATABASE_URL', GEMINI_API_KEY: config.apiKey, GEMINI_MODEL: config.model }, {
    loadCatalog: async () => catalog(), fetch: async () => { calls++; return new Response(`PRIVATE ${config.apiKey}`, { status: 429 }); },
  });
  assert.equal(failure.exitCode, 1); assert.equal(failure.receipt.attempts, 1); assert.equal(calls, 2);
  assert.equal(JSON.stringify(failure).includes(config.apiKey), false);
  assert.equal(JSON.stringify(failure).includes('TEST_ONLY_DATABASE_URL'), false);
});

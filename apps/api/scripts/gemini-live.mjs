import { createApi } from '../dist/bootstrap.js';
import { readConfig } from '../dist/config/env.js';
import {
  aiItineraryResponseSchema,
  apiErrorResponseSchema,
  todayAtDestination,
} from '@goease/contracts';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

// No call, server or evidence file until an operator explicitly authorizes ONE attempt.
if (
  !process.argv.includes('--ack-one-call') ||
  process.env.GEMINI_ENABLED !== 'true' ||
  !process.env.GEMINI_API_KEY ||
  !process.env.AI_ACCESS_TOKEN
) {
  console.info(
    'LIVE NOT RUN: cần --ack-one-call, GEMINI_ENABLED=true, key/quota và AI_ACCESS_TOKEN backend được cấp phép.',
  );
  process.exitCode = 2;
} else {
  let app;
  let upstreamStatus;
  let rejectedFields;
  try {
    const config = readConfig(process.env);
    const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error();
    if (execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim())
      throw new Error();
    // Pass through to the real network; capture only the numeric status, never headers/body.
    const observedFetch = async (url, options) => {
      const response = await fetch(url, options);
      upstreamStatus = response.status;
      if (response.status === 400) {
        const reader = response.clone().body.getReader();
        let text = '';
        let size = 0;
        try {
          while (size <= 8192) {
            const chunk = await reader.read();
            if (chunk.done) break;
            size += chunk.value.byteLength;
            if (size <= 8192) text += new TextDecoder().decode(chunk.value);
          }
          // Only fixed field names may enter evidence; never raw provider messages.
          rejectedFields = [
            'responseFormat',
            'response_format',
            'thinkingLevel',
            'thinking_level',
            'pattern',
            'additionalProperties',
            'minItems',
            'maxItems',
          ].filter((field) => text.includes(field));
        } finally {
          void reader.cancel().catch(() => {});
          reader.releaseLock();
        }
      }
      return response;
    };
    ({ app } = await createApi(process.env, undefined, { fetcher: observedFetch }));
    await app.listen(0, '127.0.0.1');
    const response = await fetch(`${await app.getUrl()}/v1/ai/itineraries`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${config.AI_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        name: 'QA Gemini live',
        destinationId: 'da-lat',
        startDate: todayAtDestination(new Date()),
        durationDays: 1,
        people: 2,
        budgetVnd: null,
      }),
      signal: AbortSignal.timeout(config.API_REQUEST_TIMEOUT_MS + 2000),
    });
    const body = await response.json();
    const evidence = {
      kind: 'live',
      attemptedAt: new Date().toISOString(),
      commit,
      node: process.version,
      model: config.GEMINI_MODEL,
      upstreamStatus,
      httpStatus: response.status,
      requestId: response.headers.get('x-request-id'),
      passed: false,
    };
    if (response.ok) {
      const data = aiItineraryResponseSchema.parse(body);
      evidence.passed = true;
      evidence.days = data.trip.days.length;
      evidence.placeIds = data.trip.days.flatMap((day) =>
        day.activities.map((activity) =>
          activity.location.kind === 'catalog' ? activity.location.placeId : 'invalid',
        ),
      );
      evidence.knownCostVnd = data.budget.knownCostVnd;
      evidence.unknownCostCount = data.budget.unknownCostCount;
    } else {
      evidence.errorCode = apiErrorResponseSchema.parse(body).error.code;
      evidence.rejectedFields = rejectedFields;
    }
    const path = join(resolve(config.GEMINI_STATE_DIR), `live-${randomUUID()}.json`);
    await writeFile(path, `${JSON.stringify(evidence, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    console.info(
      `${evidence.passed ? 'LIVE PASS' : 'LIVE FAIL'}: evidence ${path}; đúng 1 HTTP attempt, không retry.`,
    );
    if (!evidence.passed) process.exitCode = 1;
  } catch {
    console.error(
      'LIVE NOT VERIFIED: cấu hình/quota/network/output hoặc ghi evidence chưa đạt; không log secret/nội dung provider.',
    );
    process.exitCode = 1;
  } finally {
    if (app) await app.close();
  }
}

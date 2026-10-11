import { pathToFileURL } from 'node:url';
import type { AiCandidatePlace } from '@goease/contracts';
import { AiError } from './errors.js';
import { loadApprovedSampleCatalog } from './catalog.js';
import { GEMINI_INTERACTIONS_URL, generateGeminiSchedule, readGeminiConfig } from './gemini.js';
import { aiModelInput, aiResponseSchema, prepareAiRequest, requestFromCatalog } from './schedule.js';

interface ProbeArguments {
  mode: 'dry-run' | 'live'; durationDays: number;
  authorization?: { projectReference: string; quotaReference: string; budgetReference: string };
}
interface ProbeDependencies {
  loadCatalog?: (databaseUrl: string) => Promise<AiCandidatePlace[]>;
  fetch?: typeof globalThis.fetch;
  signal?: AbortSignal;
}

function parseArguments(args: string[]): ProbeArguments {
  const values = new Map<string, string>();
  const switches = new Set(['--dry-run', '--live', '--authorize-live-spend']);
  const valued = new Set(['--days', '--project-reference', '--quota-reference', '--budget-reference']);
  for (const arg of args) {
    const separator = arg.indexOf('=');
    const name = separator < 0 ? arg : arg.slice(0, separator), value = separator < 0 ? '' : arg.slice(separator + 1);
    if (values.has(name) || (!switches.has(name) && !valued.has(name))
      || (switches.has(name) && separator >= 0) || (valued.has(name) && !value)) throw new AiError('AI_LIVE_NOT_AUTHORIZED');
    values.set(name, value);
  }
  if (values.has('--dry-run') === values.has('--live')) throw new AiError('AI_LIVE_NOT_AUTHORIZED');
  const days = values.get('--days') ?? '1';
  if (!/^[1-5]$/.test(days)) throw new AiError('AI_INVALID_INPUT');
  if (values.has('--dry-run')) {
    if (values.has('--authorize-live-spend') || [...valued].filter(key => key !== '--days').some(key => values.has(key))) {
      throw new AiError('AI_LIVE_NOT_AUTHORIZED');
    }
    return { mode: 'dry-run', durationDays: Number(days) };
  }
  const projectReference = values.get('--project-reference'), quotaReference = values.get('--quota-reference'), budgetReference = values.get('--budget-reference');
  const label = (value: string | undefined): value is string => !!value && /^[a-z0-9][a-z0-9_.:-]{0,63}$/.test(value);
  if (!values.has('--authorize-live-spend') || days !== '1' || !label(projectReference) || !label(quotaReference) || !label(budgetReference)) {
    throw new AiError('AI_LIVE_NOT_AUTHORIZED');
  }
  return { mode: 'live', durationDays: 1, authorization: { projectReference, quotaReference, budgetReference } };
}

/** Flags attest a previously approved scope; they do not verify billing, quota or authorization with Google. */
export async function runAiProbe(args: string[], environment: Record<string, string | undefined>, dependencies: ProbeDependencies = {}) {
  let parsed: ProbeArguments | undefined;
  try {
    parsed = parseArguments(args);
    const config = parsed.mode === 'live' ? readGeminiConfig(environment) : undefined;
    const databaseUrl = environment['DATABASE_URL'];
    if (!databaseUrl) throw new AiError('AI_NOT_CONFIGURED');
    const catalog = await (dependencies.loadCatalog ?? loadApprovedSampleCatalog)(databaseUrl);
    // The live spike is exactly one day and at most the three approved seeds.
    if (catalog.length < 1 || catalog.length > 3) throw new AiError('AI_INVALID_INPUT');
    const request = requestFromCatalog(parsed.durationDays, catalog), prepared = prepareAiRequest(request, catalog);
    if (parsed.mode === 'dry-run') {
      return { exitCode: 0, receipt: { mode: 'dry-run', status: 'validated-input', outboundCalls: 0,
        endpoint: GEMINI_INTERACTIONS_URL, input: JSON.parse(aiModelInput(prepared)) as unknown,
        responseSchema: aiResponseSchema(prepared), note: 'Không gọi Gemini; đây không phải kết quả AI hoặc bằng chứng live.' } };
    }
    const result = await generateGeminiSchedule(config!, request, catalog, { maxRetries: 0, maxOutputTokens: 1024,
      ...(dependencies.fetch ? { fetch: dependencies.fetch } : {}), ...(dependencies.signal ? { signal: dependencies.signal } : {}) });
    return { exitCode: 0, receipt: { mode: 'live', status: 'completed', timestamp: new Date().toISOString(),
      authorization: parsed.authorization, ...result.evidence, schedule: result.schedule,
      note: 'Chi phí chưa có hóa đơn; token/time limits không phải trần chi tiêu USD được bảo đảm.' } };
  } catch (error) {
    const safe = error instanceof AiError ? error : new AiError('AI_INVALID_INPUT');
    return { exitCode: 1, receipt: { mode: parsed?.mode ?? 'refused', status: 'failed', timestamp: new Date().toISOString(),
      ...(parsed?.authorization ? { authorization: parsed.authorization } : {}), code: safe.code, message: safe.message,
      attempts: safe.attempts, elapsedMs: safe.elapsedMs, usage: null, chargedCostUsd: null, costStatus: 'unavailable' } };
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const controller = new AbortController(), cancel = () => controller.abort();
  process.once('SIGINT', cancel); process.once('SIGTERM', cancel);
  try {
    const result = await runAiProbe(process.argv.slice(2), process.env, { signal: controller.signal });
    console.info(JSON.stringify(result.receipt)); process.exitCode = result.exitCode;
  } finally { process.removeListener('SIGINT', cancel); process.removeListener('SIGTERM', cancel); }
}

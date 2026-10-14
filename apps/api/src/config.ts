import { z } from 'zod';
import { GEMINI_MODEL } from '@goease/contracts';

const integer = (min: number, max: number, fallback: string) => z.string().regex(/^[0-9]+$/).default(fallback).transform(Number).pipe(z.number().int().min(min).max(max));
const origin = z.string().refine((value) => {
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && url.origin === value && !url.username && !url.password; }
  catch { return false; }
}, 'CORS phải là origin http(s) chính xác, không có path hoặc credential');
const configSchema = z.object({
  API_HOST: z.enum(['127.0.0.1', '0.0.0.0', '::1', '::']).default('127.0.0.1'),
  API_PORT: integer(1, 65535, '3000'), API_REQUEST_TIMEOUT_MS: integer(100, 30000, '5000'),
  API_RECEIVE_TIMEOUT_MS: integer(1000, 60000, '15000'),
  API_CORS_ORIGINS: z.string().default('').transform((value) => value ? value.split(',').map((item) => item.trim()) : []).pipe(z.array(origin).max(10)),
  GEMINI_ENABLED: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
  GEMINI_MODEL: z.literal(GEMINI_MODEL).default(GEMINI_MODEL),
  GEMINI_API_KEY: z.string().trim().max(256).default('').refine((value) => !value || /^[A-Za-z0-9_-]{20,256}$/.test(value)),
  AI_ACCESS_TOKEN: z.string().trim().max(128).default('').refine((value) => !value || /^[A-Za-z0-9_-]{32,128}$/.test(value)),
  GEMINI_TIMEOUT_MS: integer(100, 20000, '4000'), GEMINI_MAX_OUTPUT_TOKENS: integer(512, 4096, '2048'),
  GEMINI_MAX_ATTEMPTS_PER_MINUTE: integer(1, 10, '2'), GEMINI_MAX_ATTEMPTS_PER_DAY: integer(1, 50, '5'),
  GEMINI_MAX_TOTAL_ATTEMPTS: integer(1, 100, '10'), GEMINI_STATE_DIR: z.string().trim().min(1).max(1024).default('.ai-runtime'),
}).superRefine((value, ctx) => {
  if (value.GEMINI_ENABLED && value.GEMINI_API_KEY && value.AI_ACCESS_TOKEN && value.GEMINI_TIMEOUT_MS + 250 > value.API_REQUEST_TIMEOUT_MS) ctx.addIssue({ code: 'custom', path: ['GEMINI_TIMEOUT_MS'], message: 'Provider deadline phải nhỏ hơn API deadline ít nhất 250 ms' });
});
export function readConfig(env: Record<string, string | undefined>) {
  const result = configSchema.safeParse(env);
  if (!result.success) throw new Error(`Invalid API config: ${[...new Set(result.error.issues.map((issue) => issue.path[0]))].join(', ')}`);
  return result.data;
}
export type ApiConfig = ReturnType<typeof readConfig>;

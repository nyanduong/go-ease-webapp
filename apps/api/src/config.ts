import { z } from 'zod';

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
});
export function readConfig(env: Record<string, string | undefined>) {
  const result = configSchema.safeParse(env);
  if (!result.success) throw new Error(`Invalid API config: ${[...new Set(result.error.issues.map((issue) => issue.path[0]))].join(', ')}`);
  return result.data;
}
export type ApiConfig = ReturnType<typeof readConfig>;

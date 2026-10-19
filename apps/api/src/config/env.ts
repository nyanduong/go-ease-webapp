import { z } from 'zod';
import { GEMINI_MODEL } from '@goease/contracts';

const integer = (min: number, max: number, fallback: string) =>
  z
    .string()
    .regex(/^[0-9]+$/)
    .default(fallback)
    .transform(Number)
    .pipe(z.number().int().min(min).max(max));
const origin = z.string().refine((value) => {
  try {
    const url = new URL(value);
    return (
      ['http:', 'https:'].includes(url.protocol) &&
      url.origin === value &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}, 'CORS phải là origin http(s) chính xác, không có path hoặc credential');
const configSchema = z
  .object({
    API_HOST: z.enum(['127.0.0.1', '0.0.0.0', '::1', '::']).default('127.0.0.1'),
    API_PORT: integer(1, 65535, '3000'),
    API_REQUEST_TIMEOUT_MS: integer(100, 30000, '5000'),
    API_RECEIVE_TIMEOUT_MS: integer(1000, 60000, '15000'),
    API_CORS_ORIGINS: z
      .string()
      .default('')
      .transform((value) => (value ? value.split(',').map((item) => item.trim()) : []))
      .pipe(z.array(origin).max(10)),
    AUTH_ENABLED: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    SUPABASE_AUTH_URL: z
      .string()
      .max(128)
      .default('')
      .refine((value) => !value || /^https:\/\/[a-z0-9]{20}\.supabase\.co$/.test(value)),
    SUPABASE_PUBLISHABLE_KEY: z
      .string()
      .max(256)
      .default('')
      .refine((value) => !value || /^sb_publishable_[A-Za-z0-9_-]{16,200}$/.test(value)),
    AUTH_TIMEOUT_MS: integer(100, 10000, '3000'),
    TRIPS_ENABLED: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    CATALOG_ADMIN_ENABLED: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    DATABASE_URL: z
      .string()
      .max(2048)
      .default('')
      .refine((value) => {
        if (!value) return true;
        try {
          const u = new URL(value);
          return (
            u.protocol === 'postgresql:' &&
            ['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname) &&
            /^goease_runtime[_a-z0-9]*$/.test(u.username) &&
            !!u.password &&
            /^\/goease_(dev|test)_[a-z0-9_]+$/.test(u.pathname) &&
            !u.search &&
            !u.hash
          );
        } catch {
          return false;
        }
      }),
    TRIPS_DB_TIMEOUT_MS: integer(500, 5000, '3000'),
    GEMINI_ENABLED: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    GEMINI_MODEL: z.literal(GEMINI_MODEL).default(GEMINI_MODEL),
    GEMINI_API_KEY: z
      .string()
      .trim()
      .max(256)
      .default('')
      .refine((value) => !value || /^[A-Za-z0-9_.-]{20,256}$/.test(value)),
    AI_ACCESS_TOKEN: z
      .string()
      .trim()
      .max(128)
      .default('')
      .refine((value) => !value || /^[A-Za-z0-9_-]{32,128}$/.test(value)),
    GEMINI_TIMEOUT_MS: integer(100, 20000, '4000'),
    GEMINI_MAX_OUTPUT_TOKENS: integer(512, 4096, '2048'),
    GEMINI_MAX_ATTEMPTS_PER_MINUTE: integer(1, 10, '2'),
    GEMINI_MAX_ATTEMPTS_PER_DAY: integer(1, 50, '5'),
    GEMINI_MAX_TOTAL_ATTEMPTS: integer(1, 100, '10'),
    GEMINI_STATE_DIR: z.string().trim().min(1).max(1024).default('.ai-runtime'),
  })
  .superRefine((value, ctx) => {
    if (value.CATALOG_ADMIN_ENABLED && (!value.TRIPS_ENABLED || !value.DATABASE_URL))
      ctx.addIssue({
        code: 'custom',
        path: ['CATALOG_ADMIN_ENABLED'],
        message: 'Managed catalog requires private trips DB',
      });
    if (
      value.TRIPS_ENABLED &&
      (!value.AUTH_ENABLED ||
        value.AUTH_TIMEOUT_MS + value.TRIPS_DB_TIMEOUT_MS + 500 > value.API_REQUEST_TIMEOUT_MS)
    )
      ctx.addIssue({
        code: 'custom',
        path: ['TRIPS_ENABLED'],
        message: 'Trips cần Auth và tổng deadline Auth + DB nhỏ hơn API deadline',
      });
    if (
      value.AUTH_ENABLED &&
      value.SUPABASE_AUTH_URL &&
      value.SUPABASE_PUBLISHABLE_KEY &&
      value.AUTH_TIMEOUT_MS + 250 > value.API_REQUEST_TIMEOUT_MS
    )
      ctx.addIssue({
        code: 'custom',
        path: ['AUTH_TIMEOUT_MS'],
        message: 'Auth deadline phải nhỏ hơn API deadline ít nhất 250 ms',
      });
    if (
      value.GEMINI_ENABLED &&
      value.GEMINI_API_KEY &&
      value.AI_ACCESS_TOKEN &&
      value.GEMINI_TIMEOUT_MS + 250 > value.API_REQUEST_TIMEOUT_MS
    )
      ctx.addIssue({
        code: 'custom',
        path: ['GEMINI_TIMEOUT_MS'],
        message: 'Provider deadline phải nhỏ hơn API deadline ít nhất 250 ms',
      });
  });
export function readConfig(env: Record<string, string | undefined>) {
  const result = configSchema.safeParse(env);
  if (!result.success)
    throw new Error(
      `Invalid API config: ${[...new Set(result.error.issues.map((issue) => issue.path[0]))].join(', ')}`,
    );
  return result.data;
}
export type ApiConfig = ReturnType<typeof readConfig>;

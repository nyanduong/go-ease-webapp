import { z } from 'zod';
import { authIdentityResponseSchema } from '@goease/contracts';
import type { ApiConfig } from '../../config/env.js';
import { ApiFailure } from '../../common/errors/api-failure.js';

export interface AuthOptions {
  fetcher?: typeof fetch;
  now?: () => number;
}
const claimsSchema = z.object({
  sub: z.uuid(),
  iss: z.string(),
  aud: z.literal('authenticated'),
  role: z.literal('authenticated'),
  exp: z.number().int(),
  iat: z.number().int(),
  is_anonymous: z.boolean().optional(),
  amr: z.array(z.object({ method: z.string() })).optional(),
});
function claims(token: string, issuer: string, now: number) {
  try {
    const [header, payload] = token.split('.');
    const metadata = z
      .object({ alg: z.enum(['ES256', 'RS256', 'HS256']) })
      .parse(JSON.parse(Buffer.from(header!, 'base64url').toString('utf8')));
    void metadata;
    const parsed = claimsSchema.parse(
      JSON.parse(Buffer.from(payload!, 'base64url').toString('utf8')),
    );
    if (
      parsed.iss !== issuer ||
      parsed.exp <= now ||
      parsed.iat > now + 30 ||
      parsed.exp <= parsed.iat ||
      parsed.exp - parsed.iat > 7200 ||
      parsed.is_anonymous === true
    )
      throw Error();
    return parsed;
  } catch {
    throw new ApiFailure(401, 'AUTH_INVALID', 'Access token không hợp lệ hoặc hết hạn.');
  }
}
async function boundedUser(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) throw new ApiFailure(503, 'AUTH_UNAVAILABLE', 'Chưa xác minh được danh tính.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > 65536)
        throw new ApiFailure(503, 'AUTH_UNAVAILABLE', 'Phản hồi auth vượt giới hạn.');
      chunks.push(next.value);
    }
    return z
      .object({
        id: z.uuid(),
        aud: z.literal('authenticated'),
        role: z.literal('authenticated'),
        is_anonymous: z.boolean().optional(),
        identities: z.array(z.object({ provider: z.string() })).optional(),
        user_metadata: z.record(z.string(), z.unknown()).optional(),
      })
      .parse(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))));
  } finally {
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
export class AuthVerifier {
  private active = 0;
  private bucket = -1;
  private attempts = 0;
  private readonly controllers = new Set<AbortController>();
  private closed = false;
  constructor(
    private readonly config: ApiConfig,
    private readonly options: AuthOptions = {},
  ) {}
  async verify(authorization: string | undefined, query: unknown, signal: AbortSignal) {
    const { response } = await this.verifyProfileMedia(authorization, query, signal);
    return response;
  }
  // Metadata is display-only. Ownership still comes exclusively from verified identity.
  async verifyProfileMedia(authorization: string | undefined, query: unknown, signal: AbortSignal) {
    if (!this.config.AUTH_ENABLED)
      throw new ApiFailure(503, 'AUTH_DISABLED', 'Auth spike đang tắt.');
    if (!this.config.SUPABASE_AUTH_URL || !this.config.SUPABASE_PUBLISHABLE_KEY)
      throw new ApiFailure(
        503,
        'AUTH_NOT_CONFIGURED',
        'Chưa cấu hình project Supabase được cấp phép.',
      );
    const now = Math.floor((this.options.now ?? Date.now)() / 1000),
      bucket = Math.floor(now / 60);
    if (bucket !== this.bucket) {
      this.bucket = bucket;
      this.attempts = 0;
    }
    if (++this.attempts > 60)
      throw new ApiFailure(429, 'AUTH_RATE_LIMITED', 'Quá số lượt xác minh danh tính trong phút.');
    if (!z.strictObject({}).safeParse(query).success)
      throw new ApiFailure(
        400,
        'BAD_REQUEST',
        'Auth chỉ nhận bearer token, không nhận userId/role/query.',
      );
    if (
      !authorization ||
      authorization.length > 4103 ||
      !/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(authorization)
    )
      throw new ApiFailure(
        401,
        'AUTH_INVALID',
        'Cần access token của GoEase. Tài khoản Expo/mã demo không thay token người dùng.',
      );
    const token = authorization.slice(7),
      parsed = claims(token, `${this.config.SUPABASE_AUTH_URL}/auth/v1`, now);
    // Decoded claims only reject early. No success without the trusted provider verifying this token.
    if (this.closed || signal.aborted)
      throw new ApiFailure(499, 'AUTH_CANCELLED', 'Đã hủy xác minh danh tính.');
    if (this.active >= 4)
      throw new ApiFailure(429, 'AUTH_BUSY', 'Đang xác minh nhiều phiên. Hãy thử lại sau.');
    const controller = new AbortController();
    this.controllers.add(controller);
    this.active++;
    let timedOut = false,
      interrupt: (() => void) | undefined;
    const cancel = () => controller.abort();
    signal.addEventListener('abort', cancel, { once: true });
    const stopped = new Promise<never>((_, reject) => {
      interrupt = () =>
        reject(
          new ApiFailure(
            timedOut ? 504 : 499,
            timedOut ? 'REQUEST_TIMEOUT' : 'AUTH_CANCELLED',
            'Chưa xác minh được danh tính do hết thời gian hoặc hủy.',
          ),
        );
      controller.signal.addEventListener('abort', interrupt, { once: true });
    });
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.config.AUTH_TIMEOUT_MS);
    const operation = async () => {
      const response = await (this.options.fetcher ?? fetch)(
        `${this.config.SUPABASE_AUTH_URL}/auth/v1/user`,
        {
          method: 'GET',
          redirect: 'error',
          signal: controller.signal,
          headers: {
            accept: 'application/json',
            apikey: this.config.SUPABASE_PUBLISHABLE_KEY,
            authorization: `Bearer ${token}`,
          },
        },
      );
      if (!response.ok) {
        void response.body?.cancel().catch(() => {});
        if (response.status === 401 || response.status === 403)
          throw new ApiFailure(401, 'AUTH_INVALID', 'Provider từ chối access token.');
        if (response.status === 429)
          throw new ApiFailure(
            429,
            'AUTH_RATE_LIMITED',
            'Provider giới hạn auth. Không tự retry hoặc mua quota.',
          );
        throw new ApiFailure(503, 'AUTH_UNAVAILABLE', 'Provider auth chưa đáp ứng.');
      }
      const user = await boundedUser(response);
      const current = Math.floor((this.options.now ?? Date.now)() / 1000);
      if (user.id !== parsed.sub || user.is_anonymous === true || parsed.exp <= current)
        throw new ApiFailure(401, 'AUTH_INVALID', 'Danh tính hoặc hạn token không khớp.');
      if (
        this.config.AUTH_GOOGLE_ONLY &&
        (!parsed.amr?.some((method) => method.method === 'oauth') ||
          !user.identities?.some((identity) => identity.provider === 'google'))
      ) {
        throw new ApiFailure(401, 'AUTH_INVALID', 'Cần phiên Google OAuth được xác minh.');
      }
      const identityResponse = authIdentityResponseSchema.parse({
        apiVersion: '1',
        identity: { id: user.id, provider: 'supabase' },
      });
      return { response: identityResponse, userMetadata: user.user_metadata };
    };
    try {
      return await Promise.race([operation(), stopped]);
    } catch (error) {
      if (error instanceof ApiFailure) throw error;
      throw new ApiFailure(
        503,
        'AUTH_UNAVAILABLE',
        'Không xác minh được danh tính; không dùng user tự khai.',
      );
    } finally {
      clearTimeout(timer);
      signal.removeEventListener('abort', cancel);
      if (interrupt) controller.signal.removeEventListener('abort', interrupt);
      controller.abort();
      this.controllers.delete(controller);
      this.active--;
    }
  }
  onModuleDestroy() {
    this.closed = true;
    for (const controller of this.controllers) controller.abort();
  }
}

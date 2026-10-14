import { timingSafeEqual, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { catalogEntriesSchema, createTripInputSchemaFor, todayAtDestination } from '@goease/contracts';
import { getDalatCatalog } from '@goease/catalog';
import type { ApiConfig } from '../config.js';
import { ApiFailure } from '../errors.js';
import { AiQuota } from './quota.js';
import { GeminiProvider, geminiBody } from './gemini.js';
import type { AiProvider } from './gemini.js';
import { projectAiPlan } from './projection.js';

export interface AiOptions { provider?: AiProvider; fetcher?: typeof fetch; now?: () => Date; catalog?: () => unknown }
export class AiService {
  private readonly quota: AiQuota;
  private readonly provider: AiProvider;
  private pending: Promise<unknown> | undefined;
  private controller: AbortController | undefined;
  private closed = false;
  constructor(private readonly config: ApiConfig, private readonly options: AiOptions = {}) {
    this.quota = new AiQuota(config); this.provider = options.provider ?? new GeminiProvider(config, options.fetcher ?? fetch);
  }
  healthState() { return this.config.GEMINI_ENABLED && this.config.GEMINI_API_KEY && this.config.AI_ACCESS_TOKEN ? 'configured-unverified' as const : 'not-configured' as const; }
  generate(body: unknown, query: unknown, authorization: string | undefined, requestSignal: AbortSignal) {
    if (!this.config.GEMINI_ENABLED) throw new ApiFailure(503, 'AI_DISABLED', 'Gemini đang tắt. Không trả lịch trình mẫu thay AI.');
    if (!this.config.GEMINI_API_KEY || !this.config.AI_ACCESS_TOKEN) throw new ApiFailure(503, 'AI_NOT_CONFIGURED', 'Thiếu cấu hình Gemini/key hoặc quyền gọi AI.');
    const supplied = Buffer.from(authorization ?? ''), expected = Buffer.from(`Bearer ${this.config.AI_ACCESS_TOKEN}`);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) throw new ApiFailure(401, 'AI_ACCESS_DENIED', 'Không được phép gọi AI.');
    const now = (this.options.now ?? (() => new Date()))();
    const parsed = createTripInputSchemaFor(todayAtDestination(now)).safeParse(body);
    if (!parsed.success || !z.strictObject({}).safeParse(query).success) throw new ApiFailure(400, 'BAD_REQUEST', 'Nhu cầu AI không hợp lệ; chỉ nhận fields CreateTripInput, không prompt/model/tools/query.');
    if (this.closed || requestSignal.aborted) throw new ApiFailure(499, 'AI_CANCELLED', 'Yêu cầu AI đã hủy.');
    if (this.pending) throw new ApiFailure(409, 'AI_BUSY', 'AI đang xử lý một lượt. Hãy chờ rồi thử lại.');
    const catalogResult = catalogEntriesSchema.safeParse((this.options.catalog ?? getDalatCatalog)());
    if (!catalogResult.success) throw new ApiFailure(500, 'RESPONSE_INVALID', 'Catalog server không hợp lệ.');
    const payload = geminiBody(parsed.data, catalogResult.data, this.config);
    const controller = new AbortController(); this.controller = controller;
    const cancel = () => controller.abort(); requestSignal.addEventListener('abort', cancel, { once: true });
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, this.config.GEMINI_TIMEOUT_MS);
    let abort: (() => void) | undefined;
    const interrupted = new Promise<never>((_, reject) => {
      abort = () => reject(new ApiFailure(timedOut ? 504 : 499, timedOut ? 'REQUEST_TIMEOUT' : 'AI_CANCELLED', timedOut ? 'Gemini quá thời gian. Không tự gọi lại.' : 'Yêu cầu AI đã hủy.'));
      controller.signal.addEventListener('abort', abort, { once: true });
    });
    const work = async () => {
      await this.quota.reserve(now);
      if (controller.signal.aborted) throw new ApiFailure(499, 'AI_CANCELLED', 'Yêu cầu AI đã hủy.');
      const raw = await Promise.race([this.provider.generate(payload, controller.signal), interrupted]);
      if (controller.signal.aborted) throw new ApiFailure(499, 'AI_CANCELLED', 'Yêu cầu AI đã hủy.');
      return projectAiPlan(raw, parsed.data, catalogResult.data, randomUUID(), this.config.GEMINI_MODEL);
    };
    // Keep the concurrency lock until quota I/O settles even if the HTTP deadline fires.
    const operation = work();
    this.pending = operation.catch(() => {}).finally(() => {
      clearTimeout(timer); requestSignal.removeEventListener('abort', cancel);
      if (abort) controller.signal.removeEventListener('abort', abort);
      controller.abort(); this.controller = undefined; this.pending = undefined;
    });
    return Promise.race([operation, interrupted]);
  }
  async onModuleDestroy() {
    this.closed = true; this.controller?.abort();
    // Keep the filesystem lock through any reservation in progress before releasing ownership.
    await this.pending;
    await this.quota.close().catch(() => {});
  }
}

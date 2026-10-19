import { z } from 'zod';
import { addCalendarDays } from '@goease/contracts';
import type { CatalogEntry, CreateTripInput } from '@goease/contracts';
import type { ApiConfig } from '../../../config/env.js';
import { ApiFailure } from '../../../common/errors/api-failure.js';
import { planJsonSchema } from '../ai-projection.js';

import type { AiProvider, AiPlanner } from '../ai-provider.js';
export const AI_MAX_INPUT_BYTES = 16384;
const MAX_RESPONSE_BYTES = 65536;
export function geminiBody(input: CreateTripInput, catalog: CatalogEntry[], config: ApiConfig) {
  // No trip name, notes, user free text, key, tools, coordinates or invented prices sent to the model.
  const prompt = JSON.stringify({
    task: 'Propose a Da Lat group itinerary. Select 1-3 distinct catalog places per day, preferably 2. No repeat across days. Return only schema JSON. Dates must be in the given order; times ascending, end after start, no overlap. Do not invent places, prices, coordinates, notes, availability or bookings.',
    dates: Array.from({ length: input.durationDays }, (_, index) =>
      addCalendarDays(input.startDate, index),
    ),
    places: catalog.map(({ id, name, category, suggestedDurationMinutes, visitTimeHint }) => ({
      id,
      name,
      category,
      suggestedDurationMinutes,
      visitTimeHint,
    })),
  });
  const body = JSON.stringify({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      candidateCount: 1,
      maxOutputTokens: config.GEMINI_MAX_OUTPUT_TOKENS,
      thinkingConfig: { thinkingLevel: 'MINIMAL', includeThoughts: false },
      responseMimeType: 'application/json',
      responseJsonSchema: planJsonSchema(input, catalog),
    },
  });
  if (Buffer.byteLength(body, 'utf8') > AI_MAX_INPUT_BYTES)
    throw new ApiFailure(413, 'PAYLOAD_TOO_LARGE', 'Prompt/catalog vượt giới hạn AI 16 KiB.');
  return body;
}
const envelopeSchema = z.object({
  candidates: z
    .array(
      z.object({
        finishReason: z.literal('STOP'),
        content: z.object({
          parts: z
            .array(
              z.strictObject({
                text: z.string().max(16000),
                thought: z.literal(false).optional(),
                thoughtSignature: z.string().max(8192).optional(),
              }),
            )
            .min(1)
            .max(2),
        }),
      }),
    )
    .length(1),
});
async function boundedJson(response: Response): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw new ApiFailure(502, 'AI_OUTPUT_INVALID', 'Gemini không trả nội dung.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      size += result.value.byteLength;
      if (size > MAX_RESPONSE_BYTES)
        throw new ApiFailure(502, 'AI_OUTPUT_TOO_LARGE', 'Phản hồi Gemini vượt 64 KiB.');
      chunks.push(result.value);
    }
    try {
      return JSON.parse(
        new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)),
      ) as unknown;
    } catch {
      throw new ApiFailure(502, 'AI_OUTPUT_INVALID', 'Gemini trả JSON/UTF-8 không hợp lệ.');
    }
  } finally {
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
export class GeminiProvider implements AiProvider, AiPlanner {
  constructor(
    private readonly config: ApiConfig,
    private readonly fetcher: typeof fetch = fetch,
    private readonly transport?: AiProvider,
  ) {}
  prepare(input: CreateTripInput, catalog: CatalogEntry[]) {
    const body = geminiBody(input, catalog, this.config);
    return (signal: AbortSignal) => (this.transport ?? this).generate(body, signal);
  }
  async generate(body: string, signal: AbortSignal) {
    try {
      const response = await this.fetcher(
        `https://generativelanguage.googleapis.com/v1beta/models/${this.config.GEMINI_MODEL}:generateContent`,
        {
          method: 'POST',
          redirect: 'error',
          signal,
          headers: {
            'content-type': 'application/json',
            'x-goog-api-key': this.config.GEMINI_API_KEY,
          },
          body,
        },
      );
      if (!response.ok) {
        void response.body?.cancel().catch(() => {});
        if (response.status === 429)
          throw new ApiFailure(
            429,
            'AI_UPSTREAM_RATE_LIMITED',
            'Gemini hết rate/quota. Không tự mua quota hoặc retry hàng loạt.',
          );
        if (response.status === 401 || response.status === 403)
          throw new ApiFailure(
            503,
            'AI_UPSTREAM_DENIED',
            'Gemini từ chối key/quyền. Cần người vận hành kiểm tra.',
          );
        throw new ApiFailure(
          502,
          'AI_UPSTREAM_UNAVAILABLE',
          'Gemini chưa đáp ứng được. Hãy thử lại sau.',
        );
      }
      const parsed = envelopeSchema.safeParse(await boundedJson(response));
      if (!parsed.success)
        throw new ApiFailure(
          502,
          'AI_OUTPUT_INVALID',
          'Gemini bị chặn/truncated hoặc trả nội dung không hợp lệ.',
        );
      const text = parsed.data.candidates[0]?.content.parts.map((part) => part.text).join('') ?? '';
      try {
        return JSON.parse(text) as unknown;
      } catch {
        throw new ApiFailure(502, 'AI_OUTPUT_INVALID', 'Gemini trả JSON lịch trình không hợp lệ.');
      }
    } catch (error) {
      if (error instanceof ApiFailure) throw error;
      if (signal.aborted) throw new ApiFailure(499, 'AI_CANCELLED', 'Yêu cầu AI đã hủy.');
      throw new ApiFailure(502, 'AI_UPSTREAM_UNAVAILABLE', 'Không đọc/kết nối được Gemini.');
    }
  }
}

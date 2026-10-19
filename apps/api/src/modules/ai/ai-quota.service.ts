import { mkdir, open, readFile, rename, stat, unlink } from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { calendarDateSchema } from '@goease/contracts';
import type { ApiConfig } from '../../config/env.js';
import { ApiFailure } from '../../common/errors/api-failure.js';

const snapshotSchema = z
  .strictObject({
    version: z.literal(1),
    day: calendarDateSchema,
    today: z.number().int().min(0).max(1000000),
    total: z.number().int().min(0).max(1000000),
  })
  .refine((value) => value.today <= value.total);
type Snapshot = z.infer<typeof snapshotSchema>;
export class AiQuota {
  private lock: FileHandle | undefined;
  private state: Snapshot | undefined;
  private broken = false;
  private starts: number[] = [];
  private readonly directory: string;
  constructor(private readonly config: ApiConfig) {
    this.directory = resolve(config.GEMINI_STATE_DIR);
  }
  async reserve(now: Date) {
    if (this.broken)
      throw new ApiFailure(
        503,
        'AI_GUARD_UNAVAILABLE',
        'Không đọc/ghi được quota AI. Cần người vận hành kiểm tra.',
      );
    const day = calendarDateSchema.parse(now.toISOString().slice(0, 10)),
      ms = now.getTime();
    try {
      if (!this.lock) {
        await mkdir(this.directory, { recursive: true, mode: 0o700 });
        this.lock = await open(join(this.directory, 'quota.lock'), 'wx', 0o600);
        const path = join(this.directory, 'quota.json');
        try {
          if ((await stat(path)).size > 4096) throw new Error('Invalid quota');
          this.state = snapshotSchema.parse(JSON.parse(await readFile(path, 'utf8')));
        } catch (error) {
          if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
            // Existing marker + missing state must not silently reset the spending guard.
            const marker = await open(join(this.directory, 'quota.initialized'), 'wx', 0o600);
            try {
              await marker.writeFile('1');
              await marker.sync();
            } finally {
              await marker.close();
            }
            this.state = { version: 1, day, today: 0, total: 0 };
          } else throw error;
        }
      }
      if (!this.state || day < this.state.day) throw new Error('Invalid quota clock');
      const state = day === this.state.day ? this.state : { ...this.state, day, today: 0 };
      if (
        state.total >= this.config.GEMINI_MAX_TOTAL_ATTEMPTS ||
        state.today >= this.config.GEMINI_MAX_ATTEMPTS_PER_DAY
      )
        throw new ApiFailure(
          429,
          'AI_BUDGET_EXCEEDED',
          'Đã hết giới hạn lượt AI nội bộ. Không tự thử lại hoặc mua quota.',
        );
      this.starts = this.starts.filter((start) => ms - start < 60000);
      if (this.starts.length >= this.config.GEMINI_MAX_ATTEMPTS_PER_MINUTE)
        throw new ApiFailure(429, 'AI_RATE_LIMITED', 'AI đạt giới hạn theo phút. Hãy thử lại sau.');
      const next = { ...state, total: state.total + 1, today: state.today + 1 };
      const temporary = join(this.directory, `quota-${randomUUID()}.tmp`);
      const file = await open(temporary, 'wx', 0o600);
      try {
        await file.writeFile(JSON.stringify(next));
        await file.sync();
      } finally {
        await file.close();
      }
      await rename(temporary, join(this.directory, 'quota.json'));
      this.state = next;
      this.starts.push(ms); // Charge before outbound; never refund unknown/failing calls.
    } catch (error) {
      if (error instanceof ApiFailure) throw error;
      this.broken = true;
      throw new ApiFailure(
        503,
        'AI_GUARD_UNAVAILABLE',
        'Quota AI lỗi/đang khóa. Cần người vận hành kiểm tra; không tự reset.',
      );
    }
  }
  async close() {
    if (this.lock) {
      await this.lock.close();
      this.lock = undefined;
      await unlink(join(this.directory, 'quota.lock'));
    }
  }
}

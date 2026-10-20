import { mkdir, open, readFile, rename, stat, unlink } from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import { calendarDateSchema } from '@goease/contracts';
import type { ApiConfig } from '../../config/env.js';
import { ApiFailure } from '../../common/errors/api-failure.js';

const counter = z.number().int().min(0).max(1000000);
const snapshotSchema = z
  .strictObject({
    version: z.literal(1),
    day: calendarDateSchema,
    today: counter,
    total: counter,
    users: z.record(z.string().regex(/^[a-f0-9]{64}$/), counter),
  })
  .refine((value) => value.today <= value.total && Object.keys(value.users).length <= 1000);
type Snapshot = z.infer<typeof snapshotSchema>;
const lockSchema = z.strictObject({
  version: z.literal(1),
  pid: z.number().int().min(1),
  nonce: z.uuid(),
});
function isAlive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ESRCH')
      return false;
    throw error; // Permission/unknown errors never count as proof that the owner is gone.
  }
}

/** One API process owns this persistent guard. Reservations are charged before outbound I/O. */
export class DiscoveryQuota {
  private lock: FileHandle | undefined;
  private state: Snapshot | undefined;
  private broken = false;
  private starts: number[] = [];
  private lockContents: string | undefined;
  private readonly directory: string;
  constructor(private readonly config: ApiConfig) {
    this.directory = resolve(config.SERPAPI_STATE_DIR);
  }
  private async acquireLock() {
    const path = join(this.directory, 'quota.lock');
    const create = async () => {
      const file = await open(path, 'wx', 0o600);
      const contents = JSON.stringify({ version: 1, pid: process.pid, nonce: randomUUID() });
      try {
        await file.writeFile(contents);
        await file.sync();
      } catch (error) {
        await file.close();
        await unlink(path);
        throw error;
      }
      this.lockContents = contents;
      return file;
    };
    try {
      return await create();
    } catch (error) {
      if (!(error && typeof error === 'object' && 'code' in error && error.code === 'EEXIST'))
        throw error;
    }
    if ((await stat(path)).size > 512) throw new Error('Invalid lock');
    const original = await readFile(path, 'utf8');
    const owner = lockSchema.parse(JSON.parse(original));
    if (isAlive(owner.pid)) throw new Error('Quota already owned');
    // One exclusive claim per old nonce prevents two recoverers from unlinking a newly acquired lock.
    // A corrupt/legacy lock or interrupted recovery remains fail-closed for operator inspection.
    const recoveryPath = join(this.directory, `quota-recovery-${owner.nonce}.lock`);
    const recovery = await open(recoveryPath, 'wx', 0o600);
    try {
      if ((await readFile(path, 'utf8')) !== original || isAlive(owner.pid))
        throw new Error('Quota owner changed');
      await unlink(path);
      return await create(); // Another ordinary opener can win this race; exclusive creation then fails closed.
    } finally {
      await recovery.close();
      await unlink(recoveryPath);
    }
  }
  async reserve(userId: string, now: Date) {
    if (this.broken)
      throw new ApiFailure(
        503,
        'DISCOVERY_GUARD_UNAVAILABLE',
        'Chưa đọc được giới hạn tìm địa điểm.',
      );
    const day = calendarDateSchema.parse(now.toISOString().slice(0, 10));
    const user = createHash('sha256').update(userId).digest('hex');
    try {
      if (!this.lock) {
        await mkdir(this.directory, { recursive: true, mode: 0o700 });
        this.lock = await this.acquireLock();
        try {
          if ((await stat(join(this.directory, 'quota.json'))).size > 100000)
            throw new Error('Invalid quota');
          this.state = snapshotSchema.parse(
            JSON.parse(await readFile(join(this.directory, 'quota.json'), 'utf8')),
          );
        } catch (error) {
          if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
            const marker = await open(join(this.directory, 'quota.initialized'), 'wx', 0o600);
            try {
              await marker.writeFile('1');
              await marker.sync();
            } finally {
              await marker.close();
            }
            this.state = { version: 1, day, today: 0, total: 0, users: {} };
          } else throw error;
        }
      }
      if (!this.state || day < this.state.day) throw new Error('Invalid quota clock');
      const state =
        day === this.state.day ? this.state : { ...this.state, day, today: 0, users: {} };
      if (
        state.total >= this.config.SERPAPI_MAX_TOTAL_ATTEMPTS ||
        state.today >= this.config.SERPAPI_MAX_ATTEMPTS_PER_DAY ||
        (state.users[user] ?? 0) >= this.config.SERPAPI_MAX_ATTEMPTS_PER_USER_DAY
      )
        throw new ApiFailure(
          429,
          'DISCOVERY_BUDGET_EXCEEDED',
          'Đã đạt giới hạn tìm địa điểm trong ngày hoặc tổng lượt.',
        );
      this.starts = this.starts.filter((start) => now.getTime() - start < 60000);
      if (this.starts.length >= this.config.SERPAPI_MAX_ATTEMPTS_PER_MINUTE)
        throw new ApiFailure(
          429,
          'DISCOVERY_RATE_LIMITED',
          'Tìm địa điểm đạt giới hạn theo phút. Hãy thử lại sau.',
        );
      if (!(user in state.users) && Object.keys(state.users).length >= 1000)
        throw new Error('Quota capacity');
      const next = {
        ...state,
        today: state.today + 1,
        total: state.total + 1,
        users: { ...state.users, [user]: (state.users[user] ?? 0) + 1 },
      };
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
      this.starts.push(now.getTime());
    } catch (error) {
      if (error instanceof ApiFailure) throw error;
      this.broken = true;
      throw new ApiFailure(
        503,
        'DISCOVERY_GUARD_UNAVAILABLE',
        'Giới hạn tìm địa điểm đang lỗi hoặc bị khóa. Cần kiểm tra máy chủ.',
      );
    }
  }
  async close() {
    if (this.lock) {
      await this.lock.close();
      this.lock = undefined;
      const path = join(this.directory, 'quota.lock');
      if ((await readFile(path, 'utf8')) === this.lockContents) await unlink(path);
      this.lockContents = undefined;
    }
  }
}

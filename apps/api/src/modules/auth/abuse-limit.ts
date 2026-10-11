import { Injectable } from '@nestjs/common';
import { ApiFault } from '../../common/api-fault.js';
import { hash } from './crypto.js';

/** A bounded single-process brake, not a distributed identity/rate guarantee. */
@Injectable()
export class AbuseLimit {
  private buckets = new Map<string, { count: number; until: number }>();
  private window = 0;
  private total = 0;
  private verifying = 0;
  take(ip: string, action: 'challenge' | 'exchange') {
    const now = Date.now();
    if (now >= this.window) { this.window = now + 60_000; this.total = 0; }
    if (++this.total > 600) throw new ApiFault('AUTH_RATE_LIMITED', 429);
    for (const [key, value] of this.buckets) if (now >= value.until) this.buckets.delete(key);
    const key = hash(`${action}:${ip}`);
    const bucket = this.buckets.get(key);
    if (!bucket && this.buckets.size >= 1000) throw new ApiFault('AUTH_RATE_LIMITED', 429);
    const next = bucket ?? { count: 0, until: now + 60_000 };
    this.buckets.set(key, next);
    if (++next.count > (action === 'challenge' ? 10 : 20)) throw new ApiFault('AUTH_RATE_LIMITED', 429);
  }
  async verification<T>(work: () => Promise<T>): Promise<T> {
    if (this.verifying >= 8) throw new ApiFault('AUTH_RATE_LIMITED', 429);
    this.verifying++;
    try { return await work(); } finally { this.verifying--; }
  }
}

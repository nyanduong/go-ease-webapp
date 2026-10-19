import type { ApiConfig } from '../../config/env.js';
import { ApiFailure } from '../../common/errors/api-failure.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { Owner } from '../../database/actor-transaction.service.js';
import { AuthVerifier } from './auth-verifier.service.js';
export class AccountIdentityService {
  constructor(
    private readonly config: ApiConfig,
    private readonly database: PrismaService,
    private readonly auth: AuthVerifier,
  ) {}
  async verify(authorization: string | undefined, signal: AbortSignal): Promise<Owner> {
    if (!this.config.TRIPS_ENABLED)
      throw new ApiFailure(
        503,
        'TRIPS_DISABLED',
        'Chuyến server đang tắt; chuyến khách trên máy được giữ nguyên.',
      );
    this.database.requireClient();
    const result = await this.auth.verify(authorization, {}, signal);
    return {
      ownerIssuer: this.config.SUPABASE_AUTH_URL + '/auth/v1',
      ownerSubject: result.identity.id,
    };
  }
}

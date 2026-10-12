import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';
import { ApiFault } from '../../common/api-fault.js';
import type { Environment } from '../../config.js';

export interface VerifiedGoogleIdentity {
  subject: string;
  displayName: string | null;
  nonce: string;
  /** Only supplied from a cryptographically verified Google claim; never persisted. */
  verifiedEmail?: string;
}
export abstract class GoogleIdentityVerifier {
  abstract verify(idToken: string): Promise<VerifiedGoogleIdentity>;
}

/** Separated for offline cryptographic tests; never accepts unsigned identities. */
export async function verifyGoogleToken(client: OAuth2Client, audience: string, idToken: string): Promise<VerifiedGoogleIdentity> {
  try {
    const [headerPart] = idToken.split('.');
    const header: unknown = JSON.parse(Buffer.from(headerPart ?? '', 'base64url').toString('utf8'));
    if (!header || typeof header !== 'object' || !('alg' in header) || header.alg !== 'RS256') throw new ApiFault('AUTH_INVALID_IDENTITY', 401);
    const ticket = await client.verifyIdToken({ idToken, audience });
    const payload = ticket.getPayload();
    const nonce: unknown = payload && 'nonce' in payload ? payload.nonce : undefined;
    if (!payload || typeof payload.sub !== 'string' || !/^[\x21-\x7e]{1,255}$/.test(payload.sub) ||
      typeof nonce !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(nonce) ||
      typeof payload.iat !== 'number' || !Number.isFinite(payload.iat) || payload.iat * 1000 > Date.now() ||
      typeof payload.exp !== 'number' || !Number.isFinite(payload.exp) || payload.exp * 1000 <= Date.now()) throw new ApiFault('AUTH_INVALID_IDENTITY', 401);
    const name = typeof payload.name === 'string'
      ? Array.from(Array.from(payload.name).map(character => {
        const point = character.codePointAt(0)!;
        return point < 32 || (point >= 127 && point <= 159) ? ' ' : character;
      }).join('').trim()).slice(0, 120).join('') : '';
    const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
    return { subject: payload.sub, displayName: name || null, nonce,
      ...(payload.email_verified === true && email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? { verifiedEmail: email } : {}) };
  } catch (error) {
    if (error instanceof ApiFault) throw error;
    // SDK error details can contain the JWT. Never return/log them.
    const unavailable = error instanceof Error && error.message.startsWith('Failed to retrieve verification certificates:');
    throw new ApiFault(unavailable ? 'AUTH_PROVIDER_UNAVAILABLE' : 'AUTH_INVALID_IDENTITY', unavailable ? 503 : 401);
  }
}

@Injectable()
export class GoogleTokenVerifier extends GoogleIdentityVerifier {
  private readonly client = new OAuth2Client({ transporterOptions: { timeout: 3500, retryConfig: { retry: 0, noResponseRetries: 0 } } });
  constructor(private readonly config: ConfigService<Environment, true>) { super(); }
  verify(idToken: string) {
    const audience = this.config.get('GOOGLE_WEB_CLIENT_ID', { infer: true });
    if (!audience) throw new ApiFault('AUTH_NOT_CONFIGURED', 503);
    return verifyGoogleToken(this.client, audience, idToken);
  }
}

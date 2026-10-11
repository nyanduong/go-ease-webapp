import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isGoogleExchangeRequest, isOpaqueToken, type AuthChallengeResponse, type AuthTransport, type AuthUser, type CurrentSessionResponse, type SessionResponse } from '@goease/contracts';
import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import type { Environment } from '../../config.js';
import { ApiFault } from '../../common/api-fault.js';
import { AuthDatabase } from './auth-database.js';
import { GoogleIdentityVerifier } from './google-verifier.js';
import { AbuseLimit } from './abuse-limit.js';
import { csrfFor, equalHash, hash, opaque } from './crypto.js';
import { clearCookie, cookie, LOGIN_COOKIE, oneHeader, SESSION_COOKIE, setCookie, type AuthContext } from './http.js';

const SESSION_MS = 24 * 60 * 60 * 1000;
const CHALLENGE_MS = 5 * 60 * 1000;

@Injectable()
export class AuthService {
  constructor(private readonly database: AuthDatabase, private readonly verifier: GoogleIdentityVerifier,
    private readonly config: ConfigService<Environment, true>, private readonly limit: AbuseLimit) {}

  private configured() {
    if (!this.config.get('GOOGLE_WEB_CLIENT_ID', { infer: true })) throw new ApiFault('AUTH_NOT_CONFIGURED', 503);
    return this.database.db;
  }
  private origin(request: Request) {
    const origin = oneHeader(request, 'origin');
    if (!origin || !this.config.get('WEB_ORIGINS', { infer: true }).includes(origin)) throw new ApiFault('ORIGIN_FORBIDDEN', 403);
  }
  private loginContext(request: Request, kind: AuthTransport) {
    if (oneHeader(request, 'authorization') !== undefined || cookie(request, SESSION_COOKIE)) throw new ApiFault('INVALID_REQUEST', 400);
    if (kind === 'web') this.origin(request);
    else if (oneHeader(request, 'origin') !== undefined || cookie(request, LOGIN_COOKIE)) throw new ApiFault('INVALID_REQUEST', 400);
  }

  async challenge(request: Request, response: Response, kind: AuthTransport): Promise<AuthChallengeResponse> {
    const db = this.configured();
    this.loginContext(request, kind);
    this.limit.take(request.ip ?? 'unknown', 'challenge');
    const nonce = opaque(), proof = opaque(), now = new Date();
    const row = await db.$transaction(async tx => {
      // Fixed namespace lock makes the small durable cap atomic across workers.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(7904210)::text`;
      await tx.$executeRaw`DELETE FROM "AuthChallenge" WHERE id IN
        (SELECT id FROM "AuthChallenge" WHERE "expiresAt" <= clock_timestamp() ORDER BY "expiresAt" LIMIT 100)`;
      if (await tx.authChallenge.count() >= 2000) throw new ApiFault('AUTH_RATE_LIMITED', 429);
      return tx.authChallenge.create({ data: {
        id: randomUUID(), transport: kind.toUpperCase(), nonceHash: hash(nonce), proofHash: hash(proof),
        createdAt: now, expiresAt: new Date(now.getTime() + CHALLENGE_MS),
      } });
    }, { maxWait: 3000, timeout: 5000 });
    if (kind === 'web') setCookie(response, LOGIN_COOKIE, proof, CHALLENGE_MS);
    return { challengeId: row.id, transport: kind, nonce, proof, expiresAt: row.expiresAt.toISOString() };
  }

  async exchange(request: Request, response: Response, kind: AuthTransport, body: unknown): Promise<SessionResponse> {
    const db = this.configured();
    this.loginContext(request, kind);
    this.limit.take(request.ip ?? 'unknown', 'exchange');
    if (!isGoogleExchangeRequest(body)) throw new ApiFault('INVALID_REQUEST', 400);
    const proof = oneHeader(request, 'x-goease-auth-proof');
    if (!isOpaqueToken(proof)) throw new ApiFault('AUTH_INVALID_CHALLENGE', 400);
    if (kind === 'web') {
      const binding = cookie(request, LOGIN_COOKIE);
      if (!binding || !equalHash(hash(binding), hash(proof))) throw new ApiFault('AUTH_INVALID_CHALLENGE', 400);
    }
    const row = await db.authChallenge.findUnique({ where: { id: body.challengeId } });
    if (!row || row.transport !== kind.toUpperCase() || row.consumedAt || row.expiresAt.getTime() <= Date.now() ||
      !equalHash(row.proofHash, hash(proof))) throw new ApiFault('AUTH_INVALID_CHALLENGE', 400);
    // Network verification outside DB transaction; 8 concurrent SDK calls maximum.
    const identity = await this.limit.verification(() => this.verifier.verify(body.idToken));
    if (!equalHash(hash(identity.nonce), row.nonceHash)) throw new ApiFault('AUTH_INVALID_IDENTITY', 401);
    const token = opaque(), csrfToken = csrfFor(token), now = new Date();
    const result = await db.$transaction(async tx => {
      // Observe expiry after any row-lock wait, and use a single millisecond
      // timestamp so rounding cannot consume at/after the expiry boundary.
      await tx.$queryRaw`SELECT id FROM "AuthChallenge" WHERE id = ${row.id}::uuid FOR UPDATE`;
      const consumed = await tx.$executeRaw`WITH instant AS MATERIALIZED (SELECT clock_timestamp() AS checked_at)
        UPDATE "AuthChallenge" SET "consumedAt" = date_trunc('milliseconds', instant.checked_at) FROM instant
        WHERE id = ${row.id}::uuid AND transport = ${kind.toUpperCase()} AND "proofHash" = ${hash(proof)}
        AND "nonceHash" = ${hash(identity.nonce)} AND "consumedAt" IS NULL AND "expiresAt" > instant.checked_at`;
      if (consumed !== 1) throw new ApiFault('AUTH_INVALID_CHALLENGE', 400);
      // Column-safe upsert intentionally omits role/disabledAt: runtime cannot provision admin.
      const users = await tx.$queryRaw<Array<AuthUser & { disabledAt: Date | null }>>`
        INSERT INTO "User" (id, "googleSubject", "displayName", "createdAt", "updatedAt")
        VALUES (${randomUUID()}::uuid, ${identity.subject}, ${identity.displayName}, ${now}, ${now})
        ON CONFLICT ("googleSubject") DO UPDATE SET "displayName" = EXCLUDED."displayName", "updatedAt" = EXCLUDED."updatedAt"
        RETURNING id, "displayName", role, "disabledAt"`;
      const user = users[0];
      if (!user || user.disabledAt) throw new ApiFault('AUTH_INVALID_IDENTITY', 401);
      const session = await tx.session.create({ data: {
        id: randomUUID(), userId: user.id, tokenHash: hash(token), transport: kind.toUpperCase(),
        csrfTokenHash: kind === 'web' ? hash(csrfToken) : null, createdAt: now, expiresAt: new Date(now.getTime() + SESSION_MS),
      } });
      return { user: { id: user.id, displayName: user.displayName, role: user.role }, expiresAt: session.expiresAt.toISOString() };
    }, { maxWait: 3000, timeout: 5000 });
    if (kind === 'web') {
      clearCookie(response, LOGIN_COOKIE);
      setCookie(response, SESSION_COOKIE, token, SESSION_MS);
      return { transport: 'web', ...result, csrfToken };
    }
    return { transport: 'native', ...result, accessToken: token };
  }

  async authenticate(request: Request): Promise<AuthContext> {
    const db = this.configured();
    const authorization = oneHeader(request, 'authorization');
    const browserToken = cookie(request, SESSION_COOKIE);
    if (authorization !== undefined && browserToken) throw new ApiFault('INVALID_REQUEST', 400);
    let token: string | undefined, kind: AuthTransport;
    if (authorization !== undefined) {
      if (cookie(request, LOGIN_COOKIE)) throw new ApiFault('INVALID_REQUEST', 400);
      const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(authorization);
      token = match?.[1]; kind = 'native';
      if (!token || oneHeader(request, 'origin') !== undefined) throw new ApiFault('SESSION_REQUIRED', 401);
    } else { token = browserToken; kind = 'web'; }
    if (!token) throw new ApiFault('SESSION_REQUIRED', 401);
    const session = await db.session.findUnique({ where: { tokenHash: hash(token) }, include: { user: true } });
    if (!session || session.transport !== kind.toUpperCase() || session.revokedAt || session.expiresAt.getTime() <= Date.now() || session.user.disabledAt) {
      throw new ApiFault('SESSION_REQUIRED', 401);
    }
    if (kind === 'web' && (!session.csrfTokenHash || !equalHash(session.csrfTokenHash, hash(csrfFor(token))))) throw new ApiFault('SESSION_REQUIRED', 401);
    return { id: session.id, token, transport: kind, expiresAt: session.expiresAt, csrfTokenHash: session.csrfTokenHash,
      user: { id: session.user.id, displayName: session.user.displayName, role: session.user.role as AuthUser['role'] } };
  }
  current(context: AuthContext): CurrentSessionResponse {
    const shared = { user: context.user, expiresAt: context.expiresAt.toISOString() };
    return context.transport === 'web' ? { transport: 'web', ...shared, csrfToken: csrfFor(context.token) } : { transport: 'native', ...shared };
  }
  async logout(request: Request, response: Response) {
    // Origin is mandatory for cookie POST even when the cookie is absent/expired.
    if (oneHeader(request, 'authorization') === undefined) this.origin(request);
    let context: AuthContext;
    try { context = await this.authenticate(request); }
    catch (error) {
      if (!(error instanceof ApiFault) || error.code !== 'SESSION_REQUIRED') throw error;
      clearCookie(response, SESSION_COOKIE); clearCookie(response, LOGIN_COOKIE); return;
    }
    if (context.transport === 'web') {
      const csrf = oneHeader(request, 'x-csrf-token');
      if (!isOpaqueToken(csrf) || !context.csrfTokenHash || !equalHash(hash(csrf), context.csrfTokenHash)) throw new ApiFault('CSRF_INVALID', 403);
    }
    await this.database.db.session.updateMany({ where: { id: context.id, revokedAt: null }, data: { revokedAt: new Date() } });
    clearCookie(response, SESSION_COOKIE); clearCookie(response, LOGIN_COOKIE);
  }
}

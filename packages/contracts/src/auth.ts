/** Wire data only: no provider SDK, framework, DB model or token persistence. */
export type AuthTransport = 'web' | 'native';
export type UserRole = 'CUSTOMER' | 'ADMIN';
export interface AuthUser { id: string; displayName: string | null; role: UserRole }
export interface AuthChallengeResponse {
  challengeId: string;
  transport: AuthTransport;
  nonce: string;
  proof: string;
  expiresAt: string;
}
export interface GoogleExchangeRequest { challengeId: string; idToken: string }
export interface WebSessionResponse {
  transport: 'web'; user: AuthUser; expiresAt: string; csrfToken: string;
}
export interface NativeSessionResponse {
  transport: 'native'; user: AuthUser; expiresAt: string; accessToken: string;
}
export type SessionResponse = WebSessionResponse | NativeSessionResponse;
export type CurrentSessionResponse =
  { transport: 'web'; user: AuthUser; expiresAt: string; csrfToken: string } |
  { transport: 'native'; user: AuthUser; expiresAt: string };

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
export function isOpaqueToken(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
}
export function isIsoInstant(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value;
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function keys(value: Record<string, unknown>, allowed: string[]) {
  return Object.keys(value).every(key => allowed.includes(key));
}
export function isGoogleExchangeRequest(value: unknown): value is GoogleExchangeRequest {
  return record(value) && keys(value, ['challengeId', 'idToken']) && isUuid(value.challengeId) &&
    typeof value.idToken === 'string' && value.idToken.length <= 16_384 &&
    /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value.idToken);
}
export function isAuthUser(value: unknown): value is AuthUser {
  return record(value) && keys(value, ['id', 'displayName', 'role']) && isUuid(value.id) &&
    (value.role === 'CUSTOMER' || value.role === 'ADMIN') &&
    (value.displayName === null || (typeof value.displayName === 'string' && Array.from(value.displayName).length <= 120));
}
export function isAuthChallengeResponse(value: unknown): value is AuthChallengeResponse {
  return record(value) && keys(value, ['challengeId', 'transport', 'nonce', 'proof', 'expiresAt']) &&
    isUuid(value.challengeId) && (value.transport === 'web' || value.transport === 'native') &&
    isOpaqueToken(value.nonce) && isOpaqueToken(value.proof) && isIsoInstant(value.expiresAt);
}
export function isCurrentSessionResponse(value: unknown): value is CurrentSessionResponse {
  return record(value) && keys(value, ['transport', 'user', 'expiresAt', 'csrfToken']) &&
    isAuthUser(value.user) && isIsoInstant(value.expiresAt) &&
    ((value.transport === 'web' && isOpaqueToken(value.csrfToken)) ||
      (value.transport === 'native' && value.csrfToken === undefined));
}
export function isSessionResponse(value: unknown): value is SessionResponse {
  if (!record(value) || !isAuthUser(value.user) || !isIsoInstant(value.expiresAt)) return false;
  return (value.transport === 'web' && keys(value, ['transport', 'user', 'expiresAt', 'csrfToken']) && isOpaqueToken(value.csrfToken)) ||
    (value.transport === 'native' && keys(value, ['transport', 'user', 'expiresAt', 'accessToken']) && isOpaqueToken(value.accessToken));
}

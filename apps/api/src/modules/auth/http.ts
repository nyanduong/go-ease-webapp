import type { Request, Response } from 'express';
import { isOpaqueToken, type AuthTransport, type AuthUser } from '@goease/contracts';
import { ApiFault } from '../../common/api-fault.js';

export const LOGIN_COOKIE = '__Host-goease-login';
export const SESSION_COOKIE = '__Host-goease-session';
export interface AuthContext {
  id: string; token: string; transport: AuthTransport; user: AuthUser; expiresAt: Date; csrfTokenHash: string | null;
}
export type AuthRequest = Request & { auth?: AuthContext };
export function oneHeader(request: Request, name: string): string | undefined {
  let count = 0;
  for (let i = 0; i < request.rawHeaders.length; i += 2) if (request.rawHeaders[i]?.toLowerCase() === name.toLowerCase()) count++;
  if (count > 1) throw new ApiFault('INVALID_REQUEST', 400);
  const value = request.headers[name.toLowerCase()];
  if (Array.isArray(value)) throw new ApiFault('INVALID_REQUEST', 400);
  return value;
}
export function cookie(request: Request, name: string): string | undefined {
  const raw = oneHeader(request, 'cookie');
  if (!raw) return undefined;
  if (raw.length > 8192) throw new ApiFault('INVALID_REQUEST', 400);
  const values = raw.split(';').map(part => part.trim()).filter(part => part.split('=')[0] === name);
  if (values.length > 1) throw new ApiFault('INVALID_REQUEST', 400);
  const part = values[0];
  if (!part) return undefined;
  const value = part.slice(name.length + 1);
  if (!isOpaqueToken(value)) throw new ApiFault('INVALID_REQUEST', 400);
  return value;
}
export function transport(value: string): AuthTransport {
  if (value !== 'web' && value !== 'native') throw new ApiFault('INVALID_REQUEST', 400);
  return value;
}
export function emptyBody(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== 0) throw new ApiFault('INVALID_REQUEST', 400);
}
export function setCookie(response: Response, name: string, value: string, maxAge: number) {
  response.cookie(name, value, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge });
}
export function clearCookie(response: Response, name: string) {
  response.clearCookie(name, { httpOnly: true, secure: true, sameSite: 'lax', path: '/' });
}

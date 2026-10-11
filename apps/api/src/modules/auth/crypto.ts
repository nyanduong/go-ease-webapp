import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const opaque = () => randomBytes(32).toString('base64url');
export const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export const csrfFor = (token: string) => createHmac('sha256', token).update('goease-csrf-v1').digest('base64url');
export function equalHash(left: string, right: string) {
  return left.length === right.length && timingSafeEqual(Buffer.from(left), Buffer.from(right));
}

import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { attachRequestSignal } from './request-signal.js';
export function attachRequestContext(req: Request, res: Response) {
  attachRequestSignal(req, res);
  res.setHeader('x-request-id', randomUUID());
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('cache-control', 'no-store');
}

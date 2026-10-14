import type { Request, Response } from 'express';

const requests = new WeakMap<Request, AbortController>();
export function attachRequestSignal(req: Request, res: Response) {
  const controller = new AbortController(); requests.set(req, controller);
  const abort = () => controller.abort();
  req.once('aborted', abort); res.once('close', abort);
  res.once('finish', () => { req.off('aborted', abort); res.off('close', abort); controller.abort(); });
}
export function requestSignal(req: Request): AbortSignal {
  const controller = requests.get(req);
  if (!controller) throw new Error('Request lifecycle unavailable');
  return controller.signal;
}
export function abortRequest(req: Request) { requests.get(req)?.abort(); }

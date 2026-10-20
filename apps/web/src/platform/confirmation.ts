export type ConfirmationOptions = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
};

export type ConfirmationRequest = Readonly<{
  id: number;
  options: Readonly<ConfirmationOptions>;
}>;

type PendingConfirmation = ConfirmationRequest & {
  key: string;
  promise: Promise<boolean>;
  resolve: (accepted: boolean) => void;
};

const listeners = new Set<() => void>();
let nextId = 0;
let active: PendingConfirmation | null = null;
let queue: PendingConfirmation[] = [];
const publish = () => listeners.forEach((listener) => listener());

/** A single modal host serializes prompts, including requests outside React. */
export function confirmAction(options: ConfirmationOptions): Promise<boolean> {
  const normalized = {
    title: options.title,
    message: options.message,
    confirmLabel: options.confirmLabel ?? 'Đồng ý',
    cancelLabel: options.cancelLabel ?? 'Huỷ',
    danger: options.danger ?? false,
  };
  const key = JSON.stringify(normalized);
  const existing = [active, ...queue].find((request) => request?.key === key);
  if (existing) return existing.promise;

  let resolve!: (accepted: boolean) => void;
  const promise = new Promise<boolean>((settle) => {
    resolve = settle;
  });
  const request = { id: ++nextId, options: normalized, key, promise, resolve };
  if (active) queue.push(request);
  else active = request;
  publish();
  return promise;
}

export const getConfirmation = (): ConfirmationRequest | null => active;
export function subscribeConfirmations(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function settleConfirmation(id: number, accepted: boolean) {
  if (active?.id !== id) return;
  const resolved = active;
  active = queue.shift() ?? null;
  publish();
  resolved.resolve(accepted);
}

/** An account or route change invalidates any question about the old screen. */
export function cancelConfirmations() {
  const cancelled = active ? [active, ...queue] : queue;
  active = null;
  queue = [];
  publish();
  cancelled.forEach((request) => request.resolve(false));
}

import { useEffect, useId, useSyncExternalStore, type AnchorHTMLAttributes } from 'react';

const listeners = new Set<() => void>(),
  guards = new Map<string, { dirty: boolean; busy: boolean }>();
let position = Number(history.state?.goeasePosition ?? 0),
  reversing = false;
history.replaceState({ ...history.state, goeasePosition: position }, '', location.href);
const publish = () => {
  listeners.forEach((listener) => listener());
  window.scrollTo(0, 0);
};
const allowed = () => {
  const active = [...guards.values()];
  if (active.some((guard) => guard.busy)) return false;
  return (
    !active.some((guard) => guard.dirty) || window.confirm('Bỏ thay đổi chưa lưu để rời trang?')
  );
};
window.addEventListener('popstate', () => {
  const target = Number(history.state?.goeasePosition ?? 0);
  if (reversing) {
    reversing = false;
    return;
  }
  if (!allowed()) {
    reversing = true;
    history.go(position - target || 1);
    return;
  }
  position = target;
  publish();
});
export function navigate(path: string, replace = false) {
  if (!allowed()) return false;
  if (!replace) position++;
  history[replace ? 'replaceState' : 'pushState']({ goeasePosition: position }, '', path);
  publish();
  return true;
}
export function usePath() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => location.pathname,
  );
}
export function Link({ href = '/', onClick, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a
      {...props}
      href={href}
      onClick={(event) => {
        onClick?.(event);
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.ctrlKey ||
          event.metaKey ||
          event.shiftKey ||
          event.altKey
        )
          return;
        event.preventDefault();
        if (href !== location.pathname) navigate(href);
      }}
    />
  );
}
export function useLeaveGuard(dirty: boolean, busy = false) {
  const id = useId();
  useEffect(() => {
    if (!dirty && !busy) return;
    guards.set(id, { dirty, busy });
    const unload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', unload);
    return () => {
      guards.delete(id);
      window.removeEventListener('beforeunload', unload);
    };
  }, [id, dirty, busy]);
}

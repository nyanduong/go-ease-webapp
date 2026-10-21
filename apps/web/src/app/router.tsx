import { useEffect, useId, useSyncExternalStore, type AnchorHTMLAttributes } from 'react';
import { cancelConfirmations, confirmAction } from '../platform/confirmation';

const listeners = new Set<() => void>(),
  guards = new Map<string, { dirty: boolean; busy: boolean }>();
let position = Number(history.state?.goeasePosition ?? 0);
let committedHref = location.href;
let guardRevision = 0;
let navigation: { path: string; promise: Promise<boolean> } | null = null;
type Traversal = {
  kind: 'restore' | 'accept';
  target: number;
  approvedRevision?: number;
  resolve: (accepted: boolean) => void;
  promise: Promise<boolean>;
  timer: ReturnType<typeof setTimeout>;
};
let traversal: Traversal | null = null;
history.replaceState({ ...history.state, goeasePosition: position }, '', location.href);
const publish = () => {
  cancelConfirmations();
  listeners.forEach((listener) => listener());
  window.scrollTo(0, 0);
};
const busy = () => [...guards.values()].some((guard) => guard.busy);
const dirty = () => [...guards.values()].some((guard) => guard.dirty);

async function permission(): Promise<number | null> {
  // State can change while a confirmation is open (for example, session expiry or
  // a save finishing). Only an approval for the current guards can leave a page.
  while (!busy()) {
    const revision = guardRevision;
    if (!dirty()) return revision;
    const accepted = await confirmAction({
      title: 'Rời trang này?',
      message: 'Bạn có thay đổi chưa lưu. Rời trang sẽ bỏ những thay đổi này.',
      confirmLabel: 'Rời trang',
      cancelLabel: 'Ở lại',
      danger: true,
    });
    if (!accepted || busy()) return null;
    if (revision === guardRevision) return revision;
  }
  return null;
}

const historyPosition = () => {
  const value: unknown = history.state?.goeasePosition;
  return typeof value === 'number' && Number.isSafeInteger(value) ? value : position - 1;
};

function finishTraversal(accepted: boolean) {
  const finished = traversal;
  if (!finished) return;
  traversal = null;
  clearTimeout(finished.timer);
  finished.resolve(accepted);
}

function moveHistory(
  kind: Traversal['kind'],
  target: number,
  approvedRevision?: number,
): Promise<boolean> {
  let resolve!: (accepted: boolean) => void;
  const promise = new Promise<boolean>((settle) => {
    resolve = settle;
  });
  traversal = {
    kind,
    target,
    approvedRevision,
    resolve,
    promise,
    // A stale or unavailable history entry must not leave navigation locked.
    timer: setTimeout(() => finishTraversal(false), 1500),
  };
  history.go(target - historyPosition() || (kind === 'restore' ? 1 : -1));
  return promise;
}

function restoreCommitted(): Promise<boolean> {
  if (historyPosition() === position && location.href === committedHref)
    return Promise.resolve(true);
  if (traversal?.kind === 'restore') return traversal.promise;
  finishTraversal(false);
  return moveHistory('restore', position);
}

function startNavigation(path: string, operation: () => Promise<boolean>): Promise<boolean> {
  if (navigation) return navigation.path === path ? navigation.promise : Promise.resolve(false);
  const promise = operation();
  navigation = { path, promise };
  void promise.finally(() => {
    if (navigation?.promise === promise) navigation = null;
  });
  return promise;
}

window.addEventListener('popstate', () => {
  const target = historyPosition();
  const targetHref = location.href;
  if (traversal) {
    if (target !== traversal.target) {
      // A second Back/Forward click cannot open another dialog or replace the
      // pending destination. Return to the same committed page first.
      if (traversal.kind === 'accept') finishTraversal(false);
      if (!traversal) void restoreCommitted();
      else history.go(position - target || 1);
      return;
    }
    if (traversal.kind === 'restore') {
      finishTraversal(targetHref === committedHref);
      return;
    }
    if (busy() || traversal.approvedRevision !== guardRevision) {
      finishTraversal(false);
      void restoreCommitted();
      return;
    }
    position = target;
    committedHref = targetHref;
    history.replaceState({ ...history.state, goeasePosition: position }, '', committedHref);
    finishTraversal(true);
    publish();
    return;
  }
  if (navigation) {
    void restoreCommitted();
    return;
  }
  void startNavigation(targetHref, async () => {
    // A native pop changes the URL before asking the app. Restore it before
    // rendering a modal so URL, form state and screen remain on the old route.
    if (!(await restoreCommitted())) return false;
    let approvedRevision = await permission();
    if (approvedRevision === null || !(await restoreCommitted())) return false;
    if (approvedRevision !== guardRevision) approvedRevision = await permission();
    if (approvedRevision === null || busy()) return false;
    return moveHistory('accept', target, approvedRevision);
  });
});

export function navigate(path: string, replace = false): Promise<boolean> {
  const target = new URL(path, committedHref);
  if (target.origin !== location.origin) return Promise.resolve(false);
  if (target.href === committedHref) return Promise.resolve(true);
  return startNavigation(target.href, async () => {
    const approvedRevision = await permission();
    if (approvedRevision === null || !(await restoreCommitted())) return false;
    if (busy() || approvedRevision !== guardRevision) return false;
    if (!replace) position++;
    const from = new URL(committedHref);
    const detail = /^\/explore\/[^/]+$/.test(target.pathname);
    const contentReturn =
      detail && from.pathname !== '/trips/new'
        ? from.pathname + from.search
        : detail || target.pathname === '/trips/new'
          ? history.state?.goeaseContentReturn
          : undefined;
    history[replace ? 'replaceState' : 'pushState'](
      { goeasePosition: position, goeaseContentReturn: contentReturn },
      '',
      target.href,
    );
    committedHref = target.href;
    publish();
    return true;
  });
}
export function contentReturnPath() {
  const path: unknown = history.state?.goeaseContentReturn;
  if (typeof path !== 'string' || !/^\/(explore(?:\/[^/?#]+)?|favorites)?(?:\?|$)/.test(path))
    return '/explore';
  return path;
}
export function usePath() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    // A pending native history traversal must not unmount an unsaved form if
    // React renders for an unrelated session or background state update.
    () => new URL(committedHref).pathname,
  );
}
export function useSearch() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => new URL(committedHref).search,
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
          event.altKey ||
          (props.target && props.target !== '_self') ||
          props.download !== undefined
        )
          return;
        const target = new URL(href, location.href);
        if (target.origin !== location.origin) return;
        if (
          target.pathname === location.pathname &&
          target.search === location.search &&
          target.hash
        )
          return;
        event.preventDefault();
        void navigate(href);
      }}
    />
  );
}
export function useLeaveGuard(dirty: boolean, busy = false) {
  const id = useId();
  useEffect(() => {
    if (!dirty && !busy) return;
    guards.set(id, { dirty, busy });
    guardRevision++;
    const unload = (event: BeforeUnloadEvent) => {
      // Browsers own the prompt for tab close/reload; custom dialogs cannot
      // pause or replace beforeunload. In-app navigation uses the modal above.
      event.preventDefault();
    };
    window.addEventListener('beforeunload', unload);
    return () => {
      guards.delete(id);
      guardRevision++;
      window.removeEventListener('beforeunload', unload);
    };
  }, [id, dirty, busy]);
}

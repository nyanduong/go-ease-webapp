import { useId, useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import {
  cancelConfirmations,
  getConfirmation,
  settleConfirmation,
  subscribeConfirmations,
} from '../platform/confirmation';

export function ConfirmationDialogHost() {
  const request = useSyncExternalStore(subscribeConfirmations, getConfirmation, () => null);
  const dialog = useRef<HTMLDialogElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const confirmButton = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useLayoutEffect(() => {
    if (!request || !dialog.current) return;
    const element = dialog.current;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    element.showModal();
    // The safe action is first for keyboard and mobile screen-reader users.
    cancelButton.current?.focus({ preventScroll: true });
    return () => {
      element.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected)
        previousFocus.focus({ preventScroll: true });
    };
  }, [request?.id]);

  useLayoutEffect(() => () => cancelConfirmations(), []);

  if (!request) return null;
  const { options, id } = request;
  const cancel = () => settleConfirmation(id, false);
  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      aria-modal="true"
      className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-3xl border border-line bg-paper p-0 text-ink shadow-2xl backdrop:bg-ink/45 backdrop:backdrop-blur-sm"
      onCancel={(event) => {
        event.preventDefault();
        cancel();
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Tab') return;
        const first = cancelButton.current;
        const last = confirmButton.current;
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < bounds.left ||
          event.clientX > bounds.right ||
          event.clientY < bounds.top ||
          event.clientY > bounds.bottom
        )
          cancel();
      }}
    >
      <div className="p-6 sm:p-7">
        <div
          aria-hidden="true"
          className={`mb-5 flex size-12 items-center justify-center rounded-2xl ${options.danger ? 'bg-orange/15 text-error' : 'bg-mint text-teal-dark'}`}
        >
          <svg viewBox="0 0 24 24" fill="none" className="size-6">
            <path
              d="M12 8v5m0 3h.01M9.7 3.9 2.4 16.6A2.3 2.3 0 0 0 4.4 20h15.2a2.3 2.3 0 0 0 2-3.4L14.3 3.9a2.65 2.65 0 0 0-4.6 0Z"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <h2 id={titleId} className="m-0 text-xl font-extrabold sm:text-2xl">
          {options.title}
        </h2>
        <p
          id={descriptionId}
          className="mt-3 mb-6 text-sm whitespace-pre-line text-muted sm:text-base"
        >
          {options.message}
        </p>
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            ref={cancelButton}
            type="button"
            className="min-h-12 rounded-full border border-line bg-cream px-5 py-3 text-sm font-bold hover:bg-sand"
            onClick={cancel}
          >
            {options.cancelLabel}
          </button>
          <button
            ref={confirmButton}
            type="button"
            className={`min-h-12 rounded-full px-5 py-3 text-sm font-bold text-white ${options.danger ? 'bg-error hover:bg-error/90' : 'bg-teal-dark hover:bg-ink'}`}
            onClick={() => settleConfirmation(id, true)}
          >
            {options.confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}

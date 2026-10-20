import { useEffect, useId, useRef } from 'react';

export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  destructive = false,
  returnFocus,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  destructive?: boolean;
  returnFocus: HTMLElement | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const acted = useRef(false);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    const previous = returnFocus;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    element.showModal();
    cancel.current?.focus();
    return () => {
      element.close();
      document.body.style.overflow = previousOverflow;
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, [returnFocus]);

  function choose(action: () => void) {
    if (acted.current) return;
    acted.current = true;
    action();
  }

  return (
    <dialog
      ref={dialog}
      className="confirm-dialog"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onKeyDown={(event) => {
        if (event.key !== 'Tab') return;
        const buttons =
          dialog.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
        if (!buttons?.length) return;
        const first = buttons[0];
        const last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }}
      onCancel={(event) => {
        event.preventDefault();
        choose(onCancel);
      }}
    >
      <div className="confirm-dialog__icon" aria-hidden="true">
        {destructive ? '!' : '✓'}
      </div>
      <p className="eyebrow">GOEASE / CATALOG</p>
      <h2 id={titleId}>{title}</h2>
      <p id={descriptionId}>{message}</p>
      <div className="confirm-dialog__actions">
        <button
          type="button"
          ref={cancel}
          className="confirm-dialog__cancel"
          onClick={() => choose(onCancel)}
        >
          Tiếp tục chỉnh sửa
        </button>
        <button
          type="button"
          className={destructive ? 'confirm-dialog__destructive' : undefined}
          onClick={() => choose(onConfirm)}
        >
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}

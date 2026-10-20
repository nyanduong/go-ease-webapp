import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link } from '../app/router';

export function Brand() {
  return (
    <Link
      href="/"
      className="flex shrink-0 items-center gap-2 text-2xl font-extrabold tracking-tight text-teal-dark"
      aria-label="GoEase — Trang chủ"
    >
      <img src="/icons/favicon-round.svg" alt="" width="38" height="38" />
      <span>
        GoEase
        <small className="block text-xs font-normal tracking-normal text-amber-800 italic">
          Just go. We’ll plan.
        </small>
      </span>
    </Link>
  );
}
export function AccountGate({
  error,
  onRetry,
  onLogout,
}: {
  error?: string;
  onRetry: () => void;
  onLogout: () => void;
}) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-cream px-6">
      <div className="flex w-full max-w-sm flex-col items-center gap-6 text-center">
        <Brand />
        {error ? (
          <>
            <p role="alert" className="text-sm text-muted">
              {error}
            </p>
            <Button secondary onClick={onRetry}>
              Thử lại
            </Button>
            <button type="button" className="text-sm text-muted" onClick={onLogout}>
              Đăng xuất
            </button>
          </>
        ) : (
          <div role="status">
            <span
              aria-hidden="true"
              className="block size-6 animate-spin rounded-full border-2 border-line border-t-teal motion-reduce:animate-none"
            />
            <span className="sr-only">Đang tải…</span>
          </div>
        )}
      </div>
    </main>
  );
}
export function Button({
  secondary = false,
  danger = false,
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  secondary?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 py-3 text-center text-sm font-bold transition-[transform,background-color,box-shadow] duration-200 motion-safe:hover:shadow-sm motion-safe:active:scale-[.97] motion-reduce:transition-none ${danger ? 'bg-red-50 text-error hover:bg-red-100' : secondary ? 'bg-mint text-teal-dark hover:bg-teal/15' : 'bg-linear-to-r from-amber-500 to-orange text-white hover:from-orange hover:to-amber-600'} ${className}`}
    />
  );
}
export function Notice({ children, error = false }: { children: ReactNode; error?: boolean }) {
  return (
    <div
      className={`flex flex-col items-start gap-3 rounded-2xl p-4 text-sm leading-relaxed ${error ? 'bg-red-50 text-error' : 'bg-sand text-amber-900'}`}
      role={error ? 'alert' : 'status'}
    >
      {children}
    </div>
  );
}
export function PageTitle({
  eyebrow,
  children,
  description,
}: {
  eyebrow?: string;
  children: ReactNode;
  description?: string;
}) {
  return (
    <header className="flex flex-col gap-3 py-3 sm:py-6">
      {eyebrow && (
        <span className="text-xs font-bold tracking-widest text-teal-dark uppercase">
          {eyebrow}
        </span>
      )}
      <h1>{children}</h1>
      {description && <p>{description}</p>}
    </header>
  );
}
export function dateLabel(value: string) {
  return value.split('-').reverse().join('/');
}

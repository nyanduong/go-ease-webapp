import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link } from '../app/router';

export function Brand() {
  return (
    <Link
      href="/"
      className="inline-flex min-h-11 shrink-0 items-center text-3xl font-extrabold tracking-[-.06em] text-ink"
      aria-label="GoEase — Trang chủ"
    >
      <span>
        Go<span className="underline decoration-teal decoration-[3px] underline-offset-8">E</span>
        ase
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
      className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-5 py-3 text-center text-base font-semibold transition-[transform,background-color] duration-150 motion-safe:active:scale-[.98] motion-reduce:transition-none ${danger ? 'bg-red-50 text-error hover:bg-red-100' : secondary ? 'border border-line bg-paper text-ink hover:bg-sand' : 'bg-teal text-white hover:bg-teal-dark'} ${className}`}
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

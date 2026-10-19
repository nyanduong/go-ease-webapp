import { Component, useEffect, type ReactNode } from 'react';
import { Brand, Notice } from '../components/ui';
import { Navigation } from './navigation';
import { MotionRegion } from '../components/motion';
import { Link, usePath } from './router';
import { AccountWorkspace } from '../features/account/account-workspace';
import { AccountHome } from '../features/account/account-home';
import { AccountPage, LoginPage } from '../features/account/account-page';
import { startAccountLifecycle, useAccount, accountSession } from '../features/account/session';
import { AboutPage, TravelServices } from '../features/about/about-pages';
import { PwaStatus } from '../platform/pwa';

function Route({ path }: { path: string }) {
  if (path === '/' || path === '/login' || path === '/auth/callback') return <AccountHome />;
  if (path === '/trips') return <AccountWorkspace />;
  if (path === '/trips/new') return <AccountWorkspace mode="new" />;
  if (path === '/account') return <AccountPage />;
  if (path === '/about') return <AboutPage />;
  if (path === '/travel-services') return <TravelServices />;
  const match = /^\/trips\/([A-Za-z0-9_-]{1,80})$/.exec(path);
  if (match) return <AccountWorkspace mode="detail" id={match[1]} />;
  return (
    <Notice>
      Trang không tồn tại. <Link href="/">Về trang chủ</Link>
    </Notice>
  );
}
export function App() {
  const path = usePath();
  const { session, trips } = useAccount();
  useEffect(() => startAccountLifecycle(), []);
  if (session.phase !== 'backend-verified') return <LoginPage />;
  if (!trips.ready)
    return (
      <main className="mx-auto flex max-w-xl flex-col gap-5 p-8">
        <Notice>{session.busy ? 'Đang mở dữ liệu tài khoản…' : session.message}</Notice>
        <button
          onClick={() => {
            void accountSession.restore();
          }}
        >
          Thử tải lại
        </button>
        <button
          onClick={() => {
            void accountSession.logout();
          }}
        >
          Đăng xuất
        </button>
      </main>
    );
  return (
    <>
      <a
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-xl focus:bg-white focus:p-3"
        href="#main"
      >
        Đến nội dung chính
      </a>
      <Navigation path={path} />
      <div className="min-w-0 lg:ml-64">
        <header className="sticky top-0 z-30 border-b border-line bg-cream/95 px-4 sm:px-8">
          <div className="mx-auto flex h-20 max-w-7xl items-center justify-between gap-4">
            <div className="lg:hidden">
              <Brand />
            </div>
            <div className="hidden lg:block">
              <p className="text-[10px] font-bold tracking-[.2em] text-muted uppercase">
                GoEase / Không gian của bạn
              </p>
              <p className="mt-1 text-lg font-bold">
                {path === '/'
                  ? 'Lên kế hoạch. Lưu kỷ niệm.'
                  : path === '/trips/new'
                    ? 'Bắt đầu hành trình mới'
                    : path === '/account'
                      ? 'Tài khoản của bạn'
                      : path.startsWith('/trips')
                        ? 'Hành trình của bạn'
                        : 'Khám phá cùng GoEase'}
              </p>
            </div>
            <span className="inline-flex items-center gap-2 rounded-full border border-line bg-paper px-3 py-2 text-xs text-muted">
              <span className="size-1.5 rounded-full bg-teal" aria-hidden="true" />
              Đà Lạt <span className="hidden sm:inline">· Đi cùng nhau</span>
            </span>
          </div>
        </header>
        <main
          id="main"
          tabIndex={-1}
          className="mx-auto min-h-[60vh] w-full max-w-7xl px-4 py-6 outline-none sm:px-8 sm:py-8 [&_h1]:wrap-anywhere [&_h3]:wrap-anywhere"
        >
          <ErrorBoundary key={path}>
            <MotionRegion key={path} motionKey={path}>
              <Route key={`${session.userId}:${path}`} path={path} />
            </MotionRegion>
          </ErrorBoundary>
        </main>
        <footer className="mx-auto flex max-w-7xl flex-col gap-4 border-t border-line px-5 pt-8 pb-32 lg:pb-10">
          <Brand />
          <p className="text-sm text-muted">Đi cùng nhau, khám phá nhiều hơn.</p>
          <PwaStatus />
        </footer>
      </div>
    </>
  );
}
class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <Notice error>
        Chưa mở được màn hình này. Dữ liệu đã lưu vẫn được giữ.{' '}
        <Link href="/trips">Về danh sách chuyến</Link> hoặc tải lại trang.
      </Notice>
    ) : (
      this.props.children
    );
  }
}

import { Component, useEffect, type ReactNode } from 'react';
import { AccountGate, Brand, Notice } from '../components/ui';
import { Navigation } from './navigation';
import { MotionRegion } from '../components/motion';
import { Link, usePath } from './router';
import { AccountWorkspace } from '../features/account/account-workspace';
import { AccountHome } from '../features/account/account-home';
import { AccountPage, LoginPage } from '../features/account/account-page';
import { startAccountLifecycle, useAccount, accountSession } from '../features/account/session';
import { AboutPage, TravelServices } from '../features/about/about-pages';
import { PwaStatus } from '../platform/pwa';
import { SampleTrip } from '../features/trips/sample-trip';
import { Icon } from '../components/icon';
import { ProfileAvatarImage } from '../features/account/profile-avatar';
import { offlineDev } from '../platform/dev-mode';

function Route({ path }: { path: string }) {
  if (path === '/' || path === '/login' || path === '/auth/callback') return <AccountHome />;
  if (path === '/sample') return <SampleTrip />;
  if (path === '/trips') return <AccountWorkspace />;
  if (path === '/trips/new') return <AccountWorkspace mode="new" />;
  if (path === '/account')
    return offlineDev ? (
      <Notice>
        Dev offline: chuyến được lưu trong trình duyệt này, không đăng nhập và không đồng bộ tài
        khoản. Dữ liệu dev tách riêng với chuyến tài khoản và chuyến cũ.
        <Link href="/about" className="text-action">
          Giới thiệu & trợ giúp →
        </Link>
      </Notice>
    ) : (
      <AccountPage />
    );
  if (path === '/about') return <AboutPage />;
  if (path === '/travel-services')
    return offlineDev ? (
      <Notice>
        Chế độ dev offline không mở dịch vụ đặt phòng hoặc vé máy bay. Bạn vẫn có thể thêm chi phí
        dự kiến vào chuyến trên máy.
      </Notice>
    ) : (
      <TravelServices />
    );
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
  const { session, trips, workspace, profile } = useAccount();
  useEffect(() => startAccountLifecycle(), []);
  const publicPage = path === '/' || path === '/sample' || path === '/about';
  if (!publicPage && !offlineDev && session.phase !== 'backend-verified') return <LoginPage />;
  if (!publicPage && !trips.ready)
    return (
      <AccountGate
        error={workspace.busy || session.busy ? undefined : workspace.error || undefined}
        onRetry={() => {
          void accountSession.restore();
        }}
        onLogout={() => {
          void accountSession.logout();
        }}
      />
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
        <header
          className={[
            path.startsWith('/trips/') || path === '/sample' ? 'hidden lg:block' : '',
            'border-b border-line/60 bg-cream px-5 sm:px-10',
          ].join(' ')}
        >
          <div className="mx-auto flex h-18 max-w-6xl items-center justify-between gap-4">
            <div className="lg:hidden">
              <Brand />
            </div>
            <Link
              href="/"
              className="hidden min-h-11 items-center text-sm text-muted lg:inline-flex"
            >
              Một chuyến đi, theo cách bạn thích.
            </Link>
            <Link
              href="/account"
              aria-label="Mở trang cá nhân"
              className="grid size-11 place-items-center rounded-full border border-line text-muted hover:bg-sand"
            >
              {profile.value ? (
                <ProfileAvatarImage profile={profile.value} small />
              ) : (
                <Icon name="account" />
              )}
            </Link>
          </div>
        </header>
        <main
          id="main"
          tabIndex={-1}
          className="mx-auto min-h-[60vh] w-full max-w-6xl px-5 py-6 outline-none sm:px-10 sm:py-10 [&_h1]:wrap-anywhere [&_h3]:wrap-anywhere"
        >
          <ErrorBoundary key={path}>
            {offlineDev && (
              <div
                role="status"
                className="mb-5 rounded-2xl border border-line bg-sand p-4 text-sm font-semibold text-teal-dark"
              >
                DEV OFFLINE · Lưu trên trình duyệt này · Không đồng bộ tài khoản
              </div>
            )}
            <MotionRegion key={path} motionKey={path}>
              <Route key={`${session.userId}:${path}`} path={path} />
            </MotionRegion>
          </ErrorBoundary>
        </main>
        <footer className="mx-auto flex max-w-6xl flex-col gap-3 border-t border-line px-5 pt-6 pb-[calc(7rem+env(safe-area-inset-bottom))] sm:px-10 lg:pb-10">
          <p className="hidden text-sm text-muted lg:block">Đi cùng nhau, khám phá nhiều hơn.</p>
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

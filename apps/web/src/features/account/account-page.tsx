import { ProfileCard } from './profile-card';
import { useEffect, useRef, useState } from 'react';
import { AccountGate, Button, Brand, Notice, PageTitle } from '../../components/ui';
import { accountSession, accountTrips, useAccount } from './session';
import { ScenicImage } from '../../components/scenic-image';
import { Link } from '../../app/router';
import { confirmAction } from '../../platform/confirmation';

export function LoginPage() {
  const { session, hasSavedSession } = useAccount();
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  if (hasSavedSession)
    return (
      <AccountGate
        error={
          session.busy
            ? undefined
            : online
              ? 'Chưa mở được GoEase. Vui lòng thử lại.'
              : 'Bạn đang mất kết nối.'
        }
        onRetry={() => {
          void accountSession.resume();
        }}
        onLogout={() => {
          void accountSession.logout();
        }}
      />
    );
  return (
    <main className="flex min-h-dvh flex-col bg-cream px-5 py-6 sm:px-10">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4">
        <Brand />
        <Link href="/" className="text-action">
          Về trang chủ
        </Link>
      </header>
      <div className="mx-auto grid w-full max-w-5xl flex-1 items-center gap-12 py-10 md:grid-cols-2">
        <div className="hidden overflow-hidden rounded-2xl md:block">
          <ScenicImage priority className="aspect-[4/5] w-full object-cover" />
        </div>
        <section
          className="mx-auto flex w-full max-w-md flex-col gap-5"
          aria-labelledby="login-title"
        >
          <p className="text-sm font-semibold tracking-wide text-teal">CHUYẾN ĐI CỦA BẠN</p>
          <h1 id="login-title" className="text-4xl">
            Cùng lên kế hoạch
            <br />
            cho một chuyến đi.
          </h1>
          <p className="text-muted">
            Đăng nhập để tạo, chỉnh sửa và lưu lại lịch trình trong tài khoản của bạn.
          </p>
          <button
            type="button"
            className="surface flex min-h-14 items-center justify-center gap-3 px-5 py-3 font-semibold hover:bg-sand"
            disabled={session.busy || !online}
            onClick={() => void accountSession.loginGoogle()}
          >
            <img src="/google-g.png" alt="" width="24" height="24" />
            Tiếp tục với Google
          </button>
          <p className="text-sm text-muted">Sau đăng nhập, bạn sẽ trở lại nơi đang làm.</p>
          {!online && (
            <Notice error>Bạn đang mất kết nối. Kết nối mạng rồi tiếp tục với Google.</Notice>
          )}
          {session.busy && <p role="status">{session.message}</p>}
          {!session.busy &&
            session.message &&
            session.message !== 'Thiết bị không có refresh credential.' &&
            session.message !== 'Đăng nhập Google để bắt đầu chuyến đi của bạn.' && (
              <Notice error>Chưa đăng nhập được. Vui lòng thử lại.</Notice>
            )}
          {session.phase === 'unverified' && !session.busy && (
            <Button secondary onClick={() => void accountSession.resume()}>
              Thử lại kết nối
            </Button>
          )}
        </section>
      </div>
    </main>
  );
}

export function AccountPage() {
  const { session, trips, profile } = useAccount();
  const [migrating, setMigrating] = useState(false),
    [migrationMessage, setMigrationMessage] = useState('');
  const migration = useRef<AbortController | null>(null);
  const confirming = useRef(false),
    mounted = useRef(true),
    current = useRef({ session, profile, migrating });
  current.current = { session, profile, migrating };
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      migration.current?.abort();
    };
  }, []);
  async function importLegacy() {
    if (confirming.current || migrating) return;
    const owner = accountTrips.getSnapshot().owner;
    confirming.current = true;
    const accepted = await confirmAction({
      title: 'Chuyển chuyến đi cũ?',
      message:
        'Chuyển tất cả chuyến cũ trên trình duyệt này vào tài khoản Google đang đăng nhập? Bản gốc được giữ nguyên.',
      confirmLabel: 'Chuyển chuyến cũ',
    });
    confirming.current = false;
    const active = accountTrips.getSnapshot();
    if (
      !accepted ||
      !mounted.current ||
      current.current.migrating ||
      current.current.session.busy ||
      current.current.profile.busy ||
      !owner ||
      active.owner !== owner ||
      !active.ready ||
      active.busy ||
      active.draft ||
      active.pending
    )
      return;
    confirming.current = true;
    const controller = new AbortController();
    migration.current = controller;
    setMigrating(true);
    setMigrationMessage('Đang thêm chuyến đi…');
    try {
      const message = await accountSession.importLegacy(controller.signal);
      if (!controller.signal.aborted) setMigrationMessage(message);
    } catch {
      if (!controller.signal.aborted)
        setMigrationMessage(
          accountTrips.getSnapshot().pending
            ? 'Chưa xác nhận chuyển xong. Mở Chuyến đi và bấm “Thử lưu lại” để hoàn tất.'
            : 'Chưa thêm được chuyến đi cũ. Các chuyến ban đầu vẫn được giữ; hãy thử lại.',
        );
    } finally {
      confirming.current = false;
      if (!controller.signal.aborted) setMigrating(false);
    }
  }
  return (
    <div className="flex flex-col gap-5">
      <PageTitle
        eyebrow="Không gian của bạn"
        description="Một chút về bạn, trước những hành trình mới."
      >
        Cá nhân
      </PageTitle>
      {profile.value ? (
        <ProfileCard
          profile={profile.value}
          busy={profile.busy || session.busy}
          error={profile.error}
          save={accountSession.saveProfile}
          reload={accountSession.loadProfile}
        />
      ) : (
        <div className="rounded-3xl border border-line bg-paper p-8">
          <Notice>
            {profile.busy ? 'Đang tải hồ sơ của bạn…' : profile.error || 'Hồ sơ chưa sẵn sàng.'}
          </Notice>
          {!profile.busy && (
            <Button
              secondary
              onClick={() => {
                void accountSession.loadProfile();
              }}
            >
              Tải lại hồ sơ
            </Button>
          )}
        </div>
      )}
      <div className="flex items-center justify-between gap-4 rounded-3xl border border-line bg-paper p-5 sm:p-6">
        <div>
          <h2 className="text-lg">Tài khoản Google</h2>
        </div>
        <Button
          secondary
          disabled={session.busy || trips.busy || migrating || profile.busy}
          onClick={() => {
            void accountSession.logout();
          }}
        >
          Đăng xuất
        </Button>
      </div>
      <div className="surface flex flex-col divide-y divide-line px-5">
        <Link
          href="/favorites"
          className="flex min-h-16 items-center justify-between gap-3 font-semibold"
        >
          Yêu thích của tôi <span aria-hidden="true">→</span>
        </Link>
        <Link
          href="/about"
          className="flex min-h-16 items-center justify-between gap-3 font-semibold"
        >
          Giới thiệu & trợ giúp <span aria-hidden="true">→</span>
        </Link>
        <Link
          href="/travel-services"
          className="flex min-h-16 items-center justify-between gap-3 font-semibold"
        >
          Chỗ nghỉ & chuyến bay <span aria-hidden="true">↗</span>
        </Link>
        <p className="py-4 text-sm text-muted">
          GoEase lưu nháp trên thiết bị theo tài khoản. Bấm Lưu để lưu chuyến vào tài khoản; cần kết
          nối mạng để mở và đồng bộ dữ liệu.
        </p>
      </div>
      <details className="rounded-3xl border border-line bg-paper p-5 sm:p-6">
        <summary className="cursor-pointer text-sm font-bold text-muted">
          Dữ liệu chuyến đi cũ
        </summary>
        <div className="mt-5 flex flex-col gap-4">
          <section className="rounded-3xl border border-line bg-paper p-6">
            <h2>Chuyển chuyến đi cũ</h2>
            <p className="mt-3 text-muted">
              Thêm chuyến cũ trên thiết bị này vào tài khoản. Các chuyến đã lưu sẽ không bị thay
              thế.
            </p>
            <Button
              secondary
              disabled={migrating || session.busy || trips.busy || !!trips.draft || !!trips.pending}
              onClick={() => {
                void importLegacy();
              }}
            >
              Chuyển chuyến cũ vào tài khoản
            </Button>
            {migrationMessage && <Notice>{migrationMessage}</Notice>}
          </section>
        </div>
      </details>
    </div>
  );
}

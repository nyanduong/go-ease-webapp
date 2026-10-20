import { ProfileCard } from './profile-card';
import { useEffect, useRef, useState } from 'react';
import { AccountGate, Button, Brand, Notice, PageTitle } from '../../components/ui';
import { accountSession, accountTrips, useAccount } from './session';
import { JourneySketch, LoginArtwork } from './login-artwork';
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
    <main className="postcard-login">
      <header className="postcard-login-header">
        <Brand />
        <span className="postcard-language" aria-label="Ngôn ngữ: Tiếng Việt">
          <svg
            aria-hidden="true"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18Z" />
          </svg>
          Tiếng Việt
        </span>
      </header>
      <div className="postcard-login-content">
        <LoginArtwork />
        <section className="postcard-signin" aria-labelledby="login-title">
          <p className="postcard-signin-eyebrow">ĐI MỘT CHUYẾN, THÊM MỘT CÂU CHUYỆN</p>
          <h1 id="login-title">
            Chuyến đi mới,
            <br />
            bắt đầu <span>từ đây.</span>
          </h1>
          <p className="postcard-signin-description">
            Đăng nhập để tạo, chỉnh sửa
            <br className="postcard-description-break" /> và lưu lại lịch trình của bạn.
          </p>
          <button
            type="button"
            className="postcard-google-button"
            disabled={session.busy}
            onClick={() => {
              void accountSession.loginGoogle();
            }}
          >
            <span className="postcard-google-mark">
              <img src="/google-g.png" alt="" width="24" height="24" />
            </span>
            <span>Tiếp tục với Google</span>
            <svg
              className="postcard-button-arrow"
              aria-hidden="true"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            >
              <path d="m9 5 7 7-7 7" />
            </svg>
          </button>
          <p className="postcard-signin-note">
            <svg
              aria-hidden="true"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path d="M7 3h10v18l-5-3-5 3V3Z" />
            </svg>
            Lịch trình của bạn, luôn có thể mở lại.
          </p>
          {session.busy && <p role="status">{session.message}</p>}
          {!session.busy &&
            session.message &&
            session.message !== 'Thiết bị không có refresh credential.' &&
            session.message !== 'Đăng nhập Google để bắt đầu chuyến đi của bạn.' && (
              <Notice error>Chưa đăng nhập được. Vui lòng thử lại.</Notice>
            )}
          {session.phase === 'unverified' && !session.busy && (
            <Button
              secondary
              onClick={() => {
                void accountSession.resume();
              }}
            >
              Thử lại kết nối
            </Button>
          )}
          <JourneySketch />
        </section>
      </div>
      <footer className="postcard-login-footer">
        <p>Mỗi hành trình đẹp bắt đầu từ một ý tưởng.</p>
        <p>
          Điểm đến mới đang chờ bạn <span aria-hidden="true">↗</span>
        </p>
      </footer>
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
        Hồ sơ cá nhân
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

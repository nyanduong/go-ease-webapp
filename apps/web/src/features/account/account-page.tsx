import { ProfileCard } from './profile-card';
import { useEffect, useRef, useState } from 'react';
import { Button, Brand, Notice, PageTitle } from '../../components/ui';
import { accountSession, useAccount } from './session';

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
      <main className="flex min-h-dvh items-center justify-center bg-cream px-6">
        <section className="flex w-full max-w-md flex-col gap-6 rounded-3xl border border-line bg-paper p-8">
          <Brand />
          <PageTitle eyebrow="GoEase">
            {session.busy
              ? 'Đang mở lại tài khoản…'
              : online
                ? 'Chưa kết nối được máy chủ'
                : 'Đang chờ kết nối'}
          </PageTitle>
          <p className="text-muted">
            {session.busy
              ? 'Bạn không cần đăng nhập lại. GoEase đang kiểm tra phiên đã lưu.'
              : online
                ? 'Máy chủ GoEase chưa phản hồi. Hệ thống sẽ tự thử lại và giữ phiên đăng nhập của bạn.'
                : 'Sẽ tự kết nối lại khi có mạng. Bạn không cần đăng nhập Google lại vì lỗi kết nối tạm thời.'}
          </p>
          {!session.busy && (
            <Button
              secondary
              onClick={() => {
                void accountSession.resume();
              }}
            >
              Thử kết nối lại
            </Button>
          )}
          <Button
            secondary
            disabled={session.busy}
            onClick={() => {
              void accountSession.logout();
            }}
          >
            Đăng xuất
          </Button>
        </section>
      </main>
    );
  return (
    <main className="postcard-login">
      <header className="postcard-login-header">
        <Brand />
        <p>Mỗi chuyến đi, một câu chuyện.</p>
      </header>
      <div className="postcard-login-content">
        <section className="postcard-story" aria-label="Bưu thiếp Đà Lạt">
          <p className="postcard-kicker">Một chút cảm hứng, trước khi đi</p>
          <p className="postcard-journal">
            Dành một khoảng trời cho
            <br />
            <em>một chuyến đi thật riêng.</em>
          </p>
          <div className="postcard-arrival">
            <figure className="dalat-postcard">
              <img
                src="/dalat-illustration.png"
                alt="Nắng chiều trên hồ, rừng thông và những ngọn đồi Đà Lạt"
                width="1536"
                height="1024"
                fetchPriority="high"
              />
              <figcaption>
                <svg
                  aria-hidden="true"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                >
                  <path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z" />
                  <circle cx="12" cy="10" r="2.5" />
                </svg>
                Đà Lạt, Việt Nam
              </figcaption>
            </figure>
          </div>
        </section>
        <section className="postcard-signin" aria-labelledby="login-title">
          <p className="postcard-signin-eyebrow">Chào bạn, người sắp lên đường</p>
          <h1 id="login-title">
            Chuyến đi mới,
            <br />
            bắt đầu <span>từ đây.</span>
          </h1>
          <p className="postcard-signin-description">
            Đăng nhập để tạo, chỉnh sửa và mở lại lịch trình của bạn.
          </p>
          <button
            type="button"
            className="postcard-google-button"
            disabled={session.busy}
            onClick={() => {
              void accountSession.loginGoogle();
            }}
          >
            <img src="/google-g.png" alt="" width="20" height="20" className="shrink-0" />
            <span>Tiếp tục với Google</span>
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
              <Notice>{session.message}</Notice>
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
        </section>
      </div>
      <footer className="postcard-login-footer">
        <p>
          <span>GoEase.</span> Just go. We’ll plan.
        </p>
        <p>Từ một ý tưởng, đến một chuyến đi.</p>
      </footer>
    </main>
  );
}
export function AccountPage() {
  const { session, trips, profile } = useAccount();
  const [migrating, setMigrating] = useState(false),
    [migrationMessage, setMigrationMessage] = useState('');
  const migration = useRef<AbortController | null>(null);
  useEffect(() => () => migration.current?.abort(), []);
  async function importLegacy() {
    if (
      migrating ||
      !window.confirm(
        'Chuyển tất cả chuyến cũ trên trình duyệt này vào tài khoản Google đang đăng nhập? Bản gốc được giữ nguyên.',
      )
    )
      return;
    const controller = new AbortController();
    migration.current = controller;
    setMigrating(true);
    setMigrationMessage('Đang chuyển dữ liệu cũ…');
    try {
      const message = await accountSession.importLegacy(controller.signal);
      if (!controller.signal.aborted) setMigrationMessage(message);
    } catch (error) {
      if (!controller.signal.aborted)
        setMigrationMessage(
          error instanceof Error ? error.message : 'Chưa chuyển xong; bản gốc vẫn giữ nguyên.',
        );
    } finally {
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
          <p className="mt-1 text-sm text-muted">
            Bạn có thể đăng nhập lại để tiếp tục hành trình.
          </p>
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
            <h2>Chuyển dữ liệu cũ</h2>
            <p className="mt-3 text-muted">
              Chuyển các chuyến đã tạo trước đây trên trình duyệt này vào tài khoản đang đăng nhập.
              Giữ bản gốc; không ghi đè chuyến server đã có. Mỗi thiết bị/origin cần chuyển riêng.
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
      <small>
        Bản nháp hợp lệ được giữ riêng theo tài khoản trên thiết bị. Chỉ khi lưu thành công lên máy
        chủ, bạn mới mở được phiên bản đó ở thiết bị khác.
      </small>
    </div>
  );
}

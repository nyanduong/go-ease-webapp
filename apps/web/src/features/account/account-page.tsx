import { ProfileCard } from './profile-card';
import { useEffect, useRef, useState } from 'react';
import { Button, Brand, Notice, PageTitle } from '../../components/ui';
import { accountSession, useAccount } from './session';
import { PwaStatus } from '../../platform/pwa';

export function LoginPage() {
  const { session, hasSavedSession } = useAccount();
  if (hasSavedSession)
    return (
      <main className="flex min-h-dvh items-center justify-center bg-cream px-6">
        <section className="flex w-full max-w-md flex-col gap-6 rounded-3xl border border-line bg-paper p-8">
          <Brand />
          <PageTitle eyebrow="GoEase">
            {session.busy ? 'Đang mở lại tài khoản…' : 'Đang chờ kết nối'}
          </PageTitle>
          <p className="text-muted">
            {session.busy
              ? 'Bạn không cần đăng nhập lại. GoEase đang kiểm tra phiên đã lưu.'
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
    <main className="grid min-h-dvh bg-cream lg:grid-cols-2">
      <section className="relative hidden bg-[url('/dalat-illustration.png')] bg-cover bg-center p-12 lg:flex lg:items-end">
        <div className="rounded-3xl bg-cream/95 p-8">
          <h1 className="text-4xl">
            Một kế hoạch,
            <br />
            cả nhóm cùng đi.
          </h1>
          <p className="mt-4 max-w-md text-muted">
            Lên lịch trình Đà Lạt, dự toán chi phí và giữ mọi chuyến đi trong tài khoản của bạn.
          </p>
        </div>
      </section>
      <section className="flex min-w-0 flex-col justify-center gap-7 px-6 py-10 sm:px-12 lg:mx-auto lg:w-full lg:max-w-xl">
        <Brand />
        <PageTitle eyebrow="Bắt đầu với GoEase">
          Chuyến đi tiếp theo
          <br />
          đang chờ bạn
        </PageTitle>
        <p className="text-muted">
          Đăng nhập bằng Google để tạo, chỉnh sửa và mở lại lịch trình trên các thiết bị.
        </p>
        <Button
          secondary
          disabled={session.busy}
          onClick={() => {
            void accountSession.loginGoogle();
          }}
        >
          <span aria-hidden="true" className="font-bold">
            G
          </span>{' '}
          Tiếp tục với Google
        </Button>
        {session.busy && <p role="status">{session.message}</p>}
        {!session.busy && session.message && <Notice>{session.message}</Notice>}
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
        <small>
          GoEase không lưu mật khẩu Google. Chuyến đi chỉ hiển thị sau khi tài khoản được xác minh.
        </small>
        <PwaStatus />
      </section>
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

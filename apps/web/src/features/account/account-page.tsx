import { useEffect, useMemo, useState } from 'react';
import { todayAtDestination } from '@goease/contracts';
import { generateSampleTrip } from '@goease/itinerary';
import {
  initialTripForm,
  validateTripForm,
  type FormErrors,
} from '@goease/trip-client/create-trip-controller';
import { Button, dateLabel, Notice, PageTitle } from '../../components/ui';
import { useLeaveGuard } from '../../app/router';
import { TripForm } from '../trips/trip-form';
import { TripView } from '../trips/trip-view';
import { useGuestTrips } from '../trips/guest-store';
import { accountSession, accountTrips, useAccount } from './session';

export function AccountPage() {
  const { session, trips } = useAccount();
  const [email, setEmail] = useState(''),
    [password, setPassword] = useState('');
  useEffect(() => {
    void accountSession.restore();
    const hidden = () => {
      if (document.visibilityState === 'hidden') {
        setEmail('');
        setPassword('');
      }
    };
    document.addEventListener('visibilitychange', hidden);
    return () => document.removeEventListener('visibilitychange', hidden);
  }, []);
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <PageTitle
        eyebrow="Tài khoản GoEase"
        description="Chuyến tài khoản được quản lý qua máy chủ. Chuyến khách trên thiết bị vẫn được giữ riêng."
      >
        {session.phase === 'backend-verified' ? 'Góc hành trình của bạn' : 'Chào mừng bạn trở lại'}
      </PageTitle>
      {session.phase !== 'backend-verified' && (
        <form
          className="mx-auto flex w-full max-w-2xl min-w-0 flex-col gap-5 rounded-3xl border border-line bg-paper p-5 sm:p-6"
          onSubmit={(event) => {
            event.preventDefault();
            const value = password;
            setPassword('');
            void accountSession.login(email.trim(), value);
          }}
        >
          <h2>Đăng nhập GoEase</h2>
          <label>
            Email GoEase
            <input
              type="email"
              autoComplete="email"
              value={email}
              required
              maxLength={254}
              disabled={session.busy}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label>
            Mật khẩu GoEase
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              required
              maxLength={256}
              disabled={session.busy}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          <Button type="submit" disabled={session.busy}>
            Đăng nhập
          </Button>
          <Button
            secondary
            disabled={session.busy}
            onClick={() => {
              void accountSession.restore();
            }}
          >
            Khôi phục phiên
          </Button>
        </form>
      )}
      {session.message && <Notice>{session.message}</Notice>}
      <div className="flex flex-wrap items-center gap-3">
        {session.busy && (
          <Button secondary onClick={() => accountSession.cancel()}>
            Hủy chờ / ẩn phiên
          </Button>
        )}
        {session.phase === 'backend-verified' && (
          <Button
            secondary
            disabled={session.busy || trips.busy}
            onClick={() => {
              void accountSession.restore();
            }}
          >
            Làm mới phiên và danh mục
          </Button>
        )}
        <Button
          secondary
          disabled={session.busy || trips.busy}
          onClick={() => {
            void accountSession.logout();
          }}
        >
          Đăng xuất / xóa phiên trên tab
        </Button>
      </div>
      {session.phase === 'backend-verified' && trips.owner && (
        <AccountWorkspace key={trips.owner} />
      )}
      <details className="rounded-3xl border border-line bg-paper p-5 sm:p-6">
        <summary>Phiên và dữ liệu của bạn</summary>
        <p>
          Khi chuyển tab, đóng nền hoặc hết phiên, dữ liệu tài khoản đang hiển thị sẽ được ẩn. Bấm
          Khôi phục phiên để xác minh lại.
        </p>
        <p>
          Phiên được giữ trong tab hiện tại. Bản nháp đã áp dụng và yêu cầu chưa xác nhận được lưu
          riêng theo tài khoản trên thiết bị. Không tự gửi lại khi có mạng.
        </p>
      </details>
    </div>
  );
}
function AccountWorkspace() {
  const { trips, catalog } = useAccount(),
    guests = useGuestTrips();
  const [creating, setCreating] = useState(false),
    [message, setMessage] = useState('');
  const trip = trips.draft?.trip ?? trips.selected?.trip;
  const places = useMemo(
    () =>
      catalog.map((place) => {
        const { id, name, destinationId, coordinates, sources } = place.entry;
        return { id, name, destinationId, coordinates, sources };
      }),
    [catalog],
  );
  const activePlaceIds = useMemo(
    () => new Set(catalog.filter((place) => place.enabled).map((place) => place.entry.id)),
    [catalog],
  );
  const blocked = trips.busy || !trips.ready,
    locked = blocked || !!trips.pending || !!trips.draft;
  async function work(action: () => Promise<unknown>) {
    try {
      setMessage('');
      await action();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Chưa xử lý được. Bản nháp vẫn giữ nguyên.',
      );
    }
  }
  const selectedId =
    trip?.id ?? (trips.pending?.kind === 'create' ? trips.pending.trip.id : trips.pending?.id);
  return (
    <section className="flex min-w-0 flex-col gap-5" aria-label="Chuyến của tài khoản">
      <div className="flex flex-wrap items-center justify-between gap-4 pt-3">
        <h2>Chuyến của tài khoản</h2>
        <Button
          secondary
          disabled={blocked}
          onClick={() => {
            void work(() => accountTrips.list());
          }}
        >
          Tải lại danh sách server
        </Button>
      </div>
      {trips.message && <Notice error={trips.conflict}>{trips.message}</Notice>}
      {message && <Notice error>{message}</Notice>}
      {trips.pending && (
        <Notice error>
          Có yêu cầu chưa xác nhận. Giữ nguyên nội dung để đối soát.
          <Button
            disabled={blocked}
            onClick={() => {
              void work(() => accountTrips.retry());
            }}
          >
            Thử lại đúng yêu cầu đã gửi
          </Button>
        </Notice>
      )}
      {!trips.durable && (
        <Button
          secondary
          disabled={blocked}
          onClick={() => {
            void work(() => accountTrips.checkpoint());
          }}
        >
          Thử ghi lại bản nháp trên thiết bị
        </Button>
      )}
      {selectedId && (
        <Button
          secondary
          disabled={blocked}
          onClick={() => {
            void work(() => accountTrips.read(selectedId));
          }}
        >
          Đọc bản server để đối chiếu
        </Button>
      )}
      {trips.latest && (
        <div className="flex min-w-0 flex-col gap-5 rounded-3xl border border-line bg-paper p-5 sm:p-6">
          <h3>Bản server hiện tại · v{trips.latest.version}</h3>
          <p>
            {trips.latest.trip.name} ·{' '}
            {trips.latest.trip.days.reduce((count, day) => count + day.activities.length, 0)} hoạt
            động
          </p>
          <p>Bản nháp giữ nguyên. Kiểm tra rồi chọn bản sẽ giữ; hệ thống không tự gộp thay đổi.</p>
          <Button
            secondary
            disabled={blocked || !!trips.pending}
            onClick={() => {
              if (window.confirm('Bỏ bản nháp để dùng bản server mới?'))
                void work(() => accountTrips.useLatest());
            }}
          >
            Bỏ bản nháp, dùng bản server mới
          </Button>
          {trips.draft &&
            trips.latest.trip.id === trips.draft.trip.id &&
            trips.draft.baseVersion !== null && (
              <Button
                secondary
                disabled={blocked || !!trips.pending}
                onClick={() => {
                  if (
                    window.confirm(
                      'Giữ TOÀN BỘ bản nháp trên version mới? Lần lưu tiếp theo có thể thay nội dung của máy khác.',
                    )
                  )
                    void work(() => accountTrips.rebase());
                }}
              >
                Giữ toàn bộ bản nháp trên version mới
              </Button>
            )}
        </div>
      )}
      <div className="grid min-w-0 gap-4 md:grid-cols-2">
        {trips.items.map((item) => (
          <div
            className="flex min-w-0 flex-col gap-5 rounded-3xl border border-line bg-paper p-5 sm:p-6"
            key={item.id}
          >
            <span className="inline-flex w-fit rounded-full bg-mint px-3 py-1 text-xs font-bold text-teal-dark">
              Phiên bản {item.version}
            </span>
            <h3>{item.name}</h3>
            <p>
              {dateLabel(item.startDate)} · {item.durationDays} ngày · {item.people} người
            </p>
            <Button
              secondary
              aria-label={`Mở chuyến tài khoản: ${item.name}`}
              disabled={locked}
              onClick={() => {
                void work(() => accountTrips.read(item.id));
              }}
            >
              Xem lịch trình
            </Button>
          </div>
        ))}
      </div>
      {trips.cursor && (
        <Button
          secondary
          disabled={blocked}
          onClick={() => {
            void work(() => accountTrips.list(true));
          }}
        >
          Xem thêm chuyến
        </Button>
      )}
      {!trips.items.length && trips.ready && <p>Chưa có chuyến trong danh sách server.</p>}
      {!creating && (
        <Button disabled={locked} onClick={() => setCreating(true)}>
          Tạo chuyến tài khoản
        </Button>
      )}
      {creating && (
        <NewAccountTrip
          disabled={locked}
          onCancel={() => setCreating(false)}
          onCreate={async (input) => {
            const today = todayAtDestination(new Date()),
              result = generateSampleTrip(
                input,
                catalog.filter((place) => place.enabled).map((place) => place.entry),
                { tripId: crypto.randomUUID(), today },
              );
            if (!result.ok) {
              setMessage(result.message);
              return;
            }
            await work(async () => {
              await accountTrips.begin(result.trip);
              setCreating(false);
            });
          }}
        />
      )}
      {!trips.draft && !trips.pending && (
        <details className="rounded-3xl border border-line bg-paper p-5 sm:p-6">
          <summary>Nhập chuyến từ thiết bị · {guests.trips.length} chuyến khách</summary>
          <p>Tạo bản sao với ID mới; chuyến khách gốc vẫn giữ nguyên.</p>
          <div className="flex min-w-0 flex-col gap-5">
            {guests.trips.map((saved) => (
              <Button
                secondary
                key={saved.trip.id}
                disabled={locked || guests.loadStatus !== 'ready' || !!guests.issues.length}
                onClick={() => {
                  if (window.confirm(`Nhập bản sao “${saved.trip.name}” vào tài khoản hiện tại?`))
                    void work(() =>
                      accountTrips.begin({
                        ...saved.trip,
                        id: crypto.randomUUID(),
                      }),
                    );
                }}
              >
                Nhập bản sao: {saved.trip.name}
              </Button>
            ))}
          </div>
        </details>
      )}
      {trip && (
        <TripView
          key={`${trip.id}:${trips.draft ? 'draft' : 'saved'}`}
          trip={trip}
          places={places}
          activePlaceIds={activePlaceIds}
          editing={!!trips.draft}
          busy={blocked}
          locked={!!trips.pending}
          saveLabel="Lưu bản nháp lên server"
          onChange={(input) => {
            void work(() => accountTrips.change(input));
          }}
          onEdit={() => {
            if (trips.selected)
              void work(() => accountTrips.begin(trips.selected!.trip, trips.selected!.version));
          }}
          onCancel={() => {
            void work(() => accountTrips.discard());
          }}
          onSave={() => {
            if (trips.conflict) {
              setMessage('Đọc bản server và xử lý xung đột trước khi lưu.');
              return;
            }
            if (window.confirm('Lưu bản nháp lên tài khoản hiện tại?'))
              void work(() => accountTrips.save());
          }}
          onDelete={() => {
            if (
              trips.selected &&
              window.confirm('Xóa chuyến server này? Chuyến khách vẫn giữ nguyên.')
            )
              void work(() => accountTrips.remove(trips.selected!));
          }}
        />
      )}
    </section>
  );
}
function NewAccountTrip({
  disabled,
  onCancel,
  onCreate,
}: {
  disabled: boolean;
  onCancel: () => void;
  onCreate: (
    input: Extract<ReturnType<typeof validateTripForm>, { ok: true }>['input'],
  ) => Promise<void>;
}) {
  const [initial] = useState(() => initialTripForm(new Date())),
    [form, setForm] = useState(initial),
    [errors, setErrors] = useState<FormErrors>({});
  useLeaveGuard(JSON.stringify(form) !== JSON.stringify(initial), disabled);
  return (
    <form
      className="flex min-w-0 flex-col gap-5 rounded-3xl border border-line bg-paper p-5 sm:p-6"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        const result = validateTripForm(form, todayAtDestination(new Date()));
        if (!result.ok) {
          setErrors(result.errors);
          return;
        }
        void onCreate(result.input);
      }}
    >
      <h3>Chuyến tài khoản mới · Đà Lạt</h3>
      <TripForm values={form} onChange={setForm} errors={errors} disabled={disabled} />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={disabled}>
          Tạo bản nháp lịch trình mẫu
        </Button>
        <Button
          secondary
          disabled={disabled}
          onClick={() => {
            if (
              JSON.stringify(form) === JSON.stringify(initial) ||
              window.confirm('Bỏ thông tin chuyến tài khoản đang nhập?')
            )
              onCancel();
          }}
        >
          Hủy tạo chuyến
        </Button>
      </div>
    </form>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { todayAtDestination } from '@goease/contracts';
import { generateSampleTrip } from '@goease/itinerary';
import {
  initialTripForm,
  validateTripForm,
  type FormErrors,
} from '@goease/trip-client/create-trip-controller';
import { Button, Notice, dateLabel } from '../../components/ui';
import { Link, navigate, useLeaveGuard } from '../../app/router';
import { TripForm } from '../trips/trip-form';
import { TripView } from '../trips/trip-view';
import { accountTrips, useAccount } from './session';

export function AccountWorkspace({
  mode = 'list',
  id,
}: {
  mode?: 'list' | 'new' | 'detail';
  id?: string;
}) {
  const { trips, catalog } = useAccount();
  const [creating, setCreating] = useState(mode === 'new'),
    [created, setCreated] = useState<string | null>(null),
    [deleted, setDeleted] = useState(false),
    [saveFailed, setSaveFailed] = useState(false),
    [saving, setSaving] = useState(false),
    [message, setMessage] = useState('');
  useEffect(() => {
    if (created && !creating) navigate(`/trips/${encodeURIComponent(created)}`, true);
  }, [created, creating]);
  useEffect(() => {
    if (deleted && !trips.busy) navigate('/trips', true);
  }, [deleted, trips.busy]);
  const candidate = trips.draft?.trip ?? trips.selected?.trip;
  const trip = mode === 'new' ? undefined : candidate?.id === id ? candidate : undefined;
  useEffect(() => {
    if (
      !id ||
      !trips.ready ||
      trips.busy ||
      trips.pending ||
      trips.draft ||
      trips.selected?.trip.id === id
    )
      return;
    void accountTrips.read(id);
  }, [id, trips.ready]);
  useEffect(() => {
    if (mode === 'detail' && trips.draft && trips.draft.trip.id !== id)
      setMessage('Có bản nháp khác chưa lưu. Hãy mở bản nháp để xử lý trước.');
  }, [id, mode, trips.draft]);
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
  const blocked = saving || trips.busy || !trips.ready,
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
    candidate?.id ?? (trips.pending?.kind === 'create' ? trips.pending.trip.id : trips.pending?.id);
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
          Tải lại chuyến
        </Button>
      </div>
      {trips.draft && trips.draft.trip.id !== id && (
        <Link
          href={`/trips/${encodeURIComponent(trips.draft.trip.id)}`}
          className="rounded-2xl bg-sand p-4 font-semibold text-teal-dark"
        >
          Mở bản nháp chưa lưu: {trips.draft.trip.name}
        </Link>
      )}
      {mode === 'detail' && !trip && (
        <Notice>
          Chưa mở được chuyến này. Kiểm tra kết nối, quyền truy cập hoặc bản nháp đang có.
        </Notice>
      )}
      {trips.message && <Notice error={trips.conflict}>{trips.message}</Notice>}
      {message && <Notice error>{message}</Notice>}
      {trips.pending && (
        <Notice error>
          Có yêu cầu chưa xác nhận. Giữ nguyên nội dung để đối soát.
          <Button
            disabled={blocked}
            onClick={() => {
              void work(async () => {
                const ok = await accountTrips.retry();
                if (ok && id) await accountTrips.read(id);
              });
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
      {mode === 'list' && (
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
                disabled={blocked}
                onClick={() => {
                  navigate(`/trips/${encodeURIComponent(item.id)}`);
                }}
              >
                Xem lịch trình
              </Button>
            </div>
          ))}
        </div>
      )}
      {mode === 'list' && trips.cursor && (
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
      {mode === 'list' && !trips.items.length && trips.ready && (
        <p>Chưa có chuyến nào. Tạo hành trình đầu tiên của bạn.</p>
      )}
      {mode === 'list' && !creating && (
        <Button
          disabled={locked}
          onClick={() => {
            navigate('/trips/new');
          }}
        >
          Tạo chuyến đi
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
              setCreated(result.trip.id);
            });
          }}
        />
      )}
      {(mode === 'detail' || mode === 'new') && trip && (
        <TripView
          key={trip.id}
          trip={trip}
          places={places}
          activePlaceIds={activePlaceIds}
          editing={!!trips.draft}
          busy={blocked}
          locked={!!trips.pending}
          storage="account"
          baseline={trips.selected?.trip.id === trip.id ? trips.selected.trip : undefined}
          initialDirty={
            !!trips.draft &&
            (!trips.selected ||
              trips.draft.baseVersion === null ||
              JSON.stringify(trips.draft.trip) !== JSON.stringify(trips.selected.trip))
          }
          saveStatus={
            trips.pending
              ? 'unconfirmed'
              : trips.conflict
                ? 'conflict'
                : !trips.durable || (saveFailed && !!trips.draft)
                  ? 'error'
                  : 'idle'
          }
          onChange={(input) => accountTrips.change(input)}
          onEdit={() => {
            setSaveFailed(false);
            if (trips.selected)
              void work(() => accountTrips.begin(trips.selected!.trip, trips.selected!.version));
          }}
          onCancel={() => {
            setSaveFailed(false);
            void work(() => accountTrips.discard());
          }}
          onSave={(candidate) => {
            if (trips.conflict) {
              setMessage('Đọc bản server và xử lý xung đột trước khi lưu.');
              return;
            }
            if (blocked || trips.pending) return;
            const owner = trips.owner,
              baseVersion = trips.draft?.baseVersion;
            setSaving(true);
            void work(async () => {
              setSaveFailed(false);
              try {
                if (!(await accountTrips.change(candidate))) {
                  setSaveFailed(true);
                  return;
                }
                const current = accountTrips.getSnapshot();
                // Local persistence may finish after a lock, logout or draft replacement.
                // Never let that continuation submit another owner's/current draft.
                if (
                  !current.ready ||
                  current.owner !== owner ||
                  current.pending ||
                  current.draft?.baseVersion !== baseVersion ||
                  JSON.stringify(current.draft?.trip) !== JSON.stringify(candidate)
                )
                  return;
                setSaveFailed(!(await accountTrips.save()));
              } finally {
                setSaving(false);
              }
            });
          }}
          onDelete={() => {
            if (trips.selected && window.confirm('Xóa chuyến này khỏi tài khoản của bạn?'))
              void work(async () => {
                setDeleted(await accountTrips.remove(trips.selected!));
              });
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

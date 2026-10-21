import { useEffect, useMemo, useRef, useState } from 'react';
import type { Trip } from '@goease/contracts';
import { Button, Notice, dateLabel } from '../../components/ui';
import { Link, navigate } from '../../app/router';
import { NewAccountTrip } from '../trips/new-account-trip';
import { TripView } from '../trips/trip-view';
import { accountTrips, useAccount } from './session';
import { confirmAction } from '../../platform/confirmation';
import { offlineDev } from '../../platform/dev-mode';

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
    [cancelled, setCancelled] = useState(false),
    [message, setMessage] = useState('');
  const listRequested = useRef<string | null>(null);
  const confirming = useRef(false),
    mounted = useRef(true),
    currentView = useRef({ mode, id, saving });
  currentView.current = { mode, id, saving };
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const [listLoadedOwner, setListLoadedOwner] = useState<string | null>(null);
  const listReady = listLoadedOwner !== null && listLoadedOwner === trips.owner;
  useEffect(() => {
    if (
      mode !== 'list' ||
      !trips.ready ||
      trips.busy ||
      !trips.owner ||
      listRequested.current === trips.owner
    )
      return;
    const owner = trips.owner;
    listRequested.current = owner;
    void accountTrips.list().then((ok) => {
      if (ok && accountTrips.getSnapshot().owner === owner) setListLoadedOwner(owner);
    });
  }, [mode, trips.ready, trips.busy, trips.owner]);
  useEffect(() => {
    if (created && !creating) navigate(`/trips/${encodeURIComponent(created)}`, true);
  }, [created, creating]);
  useEffect(() => {
    if (cancelled && !creating) navigate('/trips', true);
  }, [cancelled, creating]);
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
      setMessage('Bạn còn thay đổi chưa lưu ở chuyến khác. Hãy mở chuyến đó để tiếp tục.');
  }, [id, mode, trips.draft]);
  const places = useMemo(
    () =>
      catalog
        .map((place) => {
          const { id, name, destinationId, coordinates, sources } = place.entry;
          return { id, name, destinationId, coordinates, sources };
        })
        .filter((place) => !trip || place.destinationId === trip.destinationId),
    [catalog, trip?.destinationId],
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
    } catch {
      setMessage(
        'Chưa thực hiện được. Hãy kiểm tra nội dung và thử lại; thay đổi của bạn vẫn được giữ.',
      );
    }
  }
  async function confirmWork(
    options: Parameters<typeof confirmAction>[0],
    action: () => Promise<unknown>,
  ) {
    if (confirming.current || blocked) return;
    const snapshot = accountTrips.getSnapshot(),
      view = currentView.current;
    confirming.current = true;
    try {
      if (!(await confirmAction(options))) return;
      const current = accountTrips.getSnapshot();
      // A popup stays open while another tab can change the account or draft.
      if (
        !mounted.current ||
        currentView.current.mode !== view.mode ||
        currentView.current.id !== view.id ||
        currentView.current.saving ||
        !current.ready ||
        current.busy ||
        current.pending ||
        current.owner !== snapshot.owner ||
        current.selected !== snapshot.selected ||
        current.draft !== snapshot.draft ||
        current.latest !== snapshot.latest
      )
        return;
      await work(action);
    } finally {
      confirming.current = false;
    }
  }
  const selectedId =
    candidate?.id ?? (trips.pending?.kind === 'create' ? trips.pending.trip.id : trips.pending?.id);
  return (
    <section className="flex min-w-0 flex-col gap-5" aria-label="Chuyến đi của bạn">
      {mode === 'list' && (
        <div className="flex flex-wrap items-center justify-between gap-4 pt-3">
          <h1>Chuyến đi của bạn</h1>
          <Button
            secondary
            disabled={blocked}
            onClick={() => {
              void work(async () => {
                if (await accountTrips.list()) setListLoadedOwner(accountTrips.getSnapshot().owner);
              });
            }}
          >
            Tải lại chuyến
          </Button>
        </div>
      )}
      {trips.draft && trips.draft.trip.id !== id && (
        <Link
          href={`/trips/${encodeURIComponent(trips.draft.trip.id)}`}
          className="rounded-2xl bg-sand p-4 font-semibold text-teal-dark"
        >
          Tiếp tục chỉnh sửa: {trips.draft.trip.name}
        </Link>
      )}
      {mode === 'detail' && !trip && (
        <Notice>
          {trips.busy
            ? 'Đang mở chuyến đi…'
            : 'Chưa mở được chuyến đi. Hãy kiểm tra kết nối và thử lại.'}
          {!trips.busy && id && (
            <Button secondary onClick={() => void accountTrips.read(id)}>
              Thử mở lại chuyến
            </Button>
          )}
        </Notice>
      )}
      {trips.message && <Notice error={trips.conflict}>{trips.message}</Notice>}
      {message && <Notice error>{message}</Notice>}
      {trips.pending && !saving && !trips.busy && (
        <Notice error>
          Chưa xác nhận được thay đổi đã lưu. Bạn có thể thử lại mà không cần nhập lại.
          <Button
            disabled={blocked}
            onClick={() => {
              void work(async () => {
                const ok = await accountTrips.retry();
                if (ok && id) await accountTrips.read(id);
              });
            }}
          >
            Thử lưu lại
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
          Thử giữ lại thay đổi
        </Button>
      )}
      {selectedId && trips.conflict && !trips.latest && (
        <Button
          secondary
          disabled={blocked}
          onClick={() => {
            void work(() => accountTrips.read(selectedId));
          }}
        >
          Xem lịch trình mới nhất
        </Button>
      )}
      {trips.latest && (
        <div className="flex min-w-0 flex-col gap-5 rounded-3xl border border-line bg-paper p-5 sm:p-6">
          <h3>Lịch trình mới nhất</h3>
          <p>
            {trips.latest.trip.name} ·{' '}
            {trips.latest.trip.days.reduce((count, day) => count + day.activities.length, 0)} hoạt
            động
          </p>
          <p>
            Chuyến đi đã được chỉnh sửa ở nơi khác. Chọn dùng lịch trình mới nhất hoặc giữ thay đổi
            của bạn.
          </p>
          <Button
            secondary
            disabled={blocked || !!trips.pending}
            onClick={() => {
              void confirmWork(
                {
                  title: 'Dùng lịch trình mới nhất?',
                  message: 'Bỏ thay đổi chưa lưu của bạn và dùng lịch trình mới nhất?',
                  confirmLabel: 'Dùng lịch mới nhất',
                  danger: true,
                },
                () => accountTrips.useLatest(),
              );
            }}
          >
            Dùng lịch trình mới nhất
          </Button>
          {trips.draft &&
            trips.latest.trip.id === trips.draft.trip.id &&
            trips.draft.baseVersion !== null && (
              <Button
                secondary
                disabled={blocked || !!trips.pending}
                onClick={() => {
                  void confirmWork(
                    {
                      title: 'Giữ thay đổi của bạn?',
                      message:
                        'Dùng toàn bộ thay đổi của bạn? Khi lưu, nội dung này sẽ thay thế những chỉnh sửa từ thiết bị khác.',
                      confirmLabel: 'Giữ thay đổi của tôi',
                    },
                    () => accountTrips.rebase(),
                  );
                }}
              >
                Giữ thay đổi của tôi
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
              <h3>{item.name}</h3>
              <p>
                {dateLabel(item.startDate)} · {item.durationDays} ngày · {item.people} người
              </p>
              <Button
                secondary
                aria-label={`Mở chuyến ${offlineDev ? 'local' : 'tài khoản'}: ${item.name}`}
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
      {mode === 'list' && !listReady && trips.busy && (
        <p role="status">Đang tải danh sách chuyến đi…</p>
      )}
      {mode === 'list' && !trips.items.length && trips.ready && listReady && (
        <div className="surface flex flex-col items-center gap-3 px-6 py-12 text-center">
          <h2>Chuyến đi đầu tiên đang chờ bạn</h2>
          <p className="max-w-md text-muted">
            Chọn một điểm đến, tạo lịch trình rồi lưu lại ở đây để mở bất cứ khi nào có kết nối.
          </p>
          <Link href="/sample" className="text-action text-teal underline">
            Xem thử lịch trình mẫu
          </Link>
        </div>
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
          onCancel={() => {
            setCreating(false);
            setCancelled(true);
          }}
          onCreate={async (trip: Trip) => {
            await work(async () => {
              if (!(await accountTrips.begin(trip))) return;
              setCreating(false);
              setCreated(trip.id);
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
              setMessage(
                'Chuyến đi đã thay đổi ở nơi khác. Hãy chọn nội dung muốn giữ trước khi lưu.',
              );
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
            const selected = trips.selected;
            if (selected)
              void confirmWork(
                {
                  title: 'Xóa chuyến đi?',
                  message: `Xóa chuyến “${selected.trip.name}” khỏi ${offlineDev ? 'kho dev trên trình duyệt này' : 'tài khoản của bạn'}? Bạn không thể hoàn tác thao tác này.`,
                  confirmLabel: 'Xóa chuyến',
                  danger: true,
                },
                async () => {
                  setDeleted(await accountTrips.remove(selected));
                },
              );
          }}
        />
      )}
    </section>
  );
}

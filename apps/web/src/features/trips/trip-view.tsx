import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  findTimeOverlaps,
  getDestination,
  type Place,
  type Trip,
  type DiscoveryPlace,
} from '@goease/contracts';
import {
  activityForm,
  moveActivity,
  removeActivity,
} from '@goease/trip-client/edit-trip-controller';
import { projectDayMap } from '@goease/trip-client/map-controller';
import { Button, dateLabel, Notice } from '../../components/ui';
import { Icon } from '../../components/icon';
import { ActivityDetails, ActivityThumbnail } from './activity-details';
import { Link, useLeaveGuard } from '../../app/router';
import { MotionRegion } from '../../components/motion';
import { GoogleDayMap } from '../maps/google-map';
import { ActivityFields, GroupFields } from './edit-fields';
import {
  appendActivity,
  editBuffer,
  projectEditBuffer,
  sameTrip,
  type EditBuffer,
} from './edit-buffer';
import { Budget } from './budget';
import { confirmAction } from '../../platform/confirmation';
import { accountTrips } from '../account/session';
import { offlineDev } from '../../platform/dev-mode';

export type SaveStatus = 'idle' | 'error' | 'unconfirmed' | 'conflict';
interface TripViewProps {
  trip: Trip;
  readOnly?: boolean;
  editing: boolean;
  busy?: boolean;
  locked?: boolean;
  places: Place[];
  activePlaceIds?: Set<string>;
  onChange: (trip: Trip) => void | Promise<unknown>;
  onSave: (trip: Trip) => void | Promise<unknown>;
  onCancel: () => void;
  onEdit: () => void;
  onDelete: () => void;
  extra?: ReactNode | ((blocked: boolean) => ReactNode);
  saveDisabled?: boolean;
  storage?: 'device' | 'account';
  saveStatus?: SaveStatus;
  initialDirty?: boolean;
  baseline?: Trip;
}
type Selection = { tab: string; dayId: string; activityId: string | null; placeId?: string };
export function TripView(props: TripViewProps) {
  const [selection, setSelection] = useState<Selection>({
    tab: 'itinerary',
    dayId: '',
    activityId: null,
  });
  const [replacement, setReplacement] = useState(0);
  const incoming = JSON.stringify(props.trip),
    lastEmission = useRef(incoming);
  const replacing = incoming !== lastEmission.current;
  useEffect(() => {
    if (incoming !== lastEmission.current) {
      lastEmission.current = incoming;
      setReplacement((value) => value + 1);
    }
  }, [incoming]);
  return (
    <TripSession
      key={`${props.trip.id}:${props.editing}:${replacement}`}
      {...props}
      selection={selection}
      select={setSelection}
      replacing={replacing}
      onChange={async (candidate) => {
        lastEmission.current = JSON.stringify(candidate);
        try {
          await props.onChange(candidate);
        } catch (error) {
          lastEmission.current = incoming;
          throw error;
        }
      }}
      onSave={(candidate) => {
        lastEmission.current = JSON.stringify(candidate);
        return props.onSave(candidate);
      }}
    />
  );
}
function TripSession({
  trip: source,
  readOnly = false,
  editing,
  busy = false,
  locked = false,
  places,
  activePlaceIds,
  onChange,
  onSave,
  onCancel,
  onEdit,
  onDelete,
  extra,
  saveDisabled = false,
  storage = 'device',
  saveStatus = 'idle',
  initialDirty = false,
  baseline,
  selection,
  select,
  replacing,
}: TripViewProps & {
  selection: Selection;
  select: (value: Selection) => void;
  replacing: boolean;
}) {
  const [addedId] = useState(() =>
    editing && selection.activityId === '__add__' ? crypto.randomUUID() : null,
  );
  const [buffer, setBuffer] = useState(() => {
    const initialBuffer = editBuffer(source);
    return addedId
      ? appendActivity(initialBuffer, selection.dayId || source.days[0].id, addedId)
      : initialBuffer;
  });
  const [openActivity, setOpenActivity] = useState<string | null>(
    editing ? (addedId ?? selection.activityId) : null,
  );
  const [showGroup, setShowGroup] = useState(
    editing && selection.tab === 'budget' && !selection.activityId,
  );
  const [showErrors, setShowErrors] = useState(false),
    [message, setMessage] = useState('');
  const initial = useRef(baseline ?? source),
    latestChange = useRef(onChange);
  latestChange.current = onChange;
  const projection = useMemo(
    () => projectEditBuffer(buffer, places, activePlaceIds),
    [buffer, places, activePlaceIds],
  );
  const trip = editing ? projection.trip : source;
  const destinationName =
    trip.destination?.name ?? getDestination(trip.destinationId)?.name ?? trip.destinationId;
  const destination = trip.destination ?? getDestination(trip.destinationId);
  const discoveredPlaces = useMemo(() => {
    const snapshots = new Map<string, DiscoveryPlace>();
    buffer.layout.days.forEach((day) =>
      day.activities.forEach((activity) => {
        if (activity.location.kind === 'discovered')
          snapshots.set(activity.location.placeId, activity.location.placeSnapshot);
      }),
    );
    return [...snapshots.values()];
  }, [buffer.layout]);
  const encoded = JSON.stringify(projection.trip),
    sourceEncoded = JSON.stringify(source);
  const dirty =
    editing && (initialDirty || !projection.ok || !sameTrip(projection.trip, initial.current));
  const blocked = busy || locked || replacing;
  const confirming = useRef(false),
    mounted = useRef(true),
    current = useRef({ buffer, blocked, editing });
  current.current = { buffer, blocked, editing };
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  async function confirmEdit(options: Parameters<typeof confirmAction>[0], action: () => void) {
    if (confirming.current || blocked || !editing) return;
    const snapshot = current.current,
      accountSnapshot = storage === 'account' ? accountTrips.getSnapshot() : null;
    confirming.current = true;
    try {
      if (!(await confirmAction(options))) return;
      const latest = current.current,
        account = storage === 'account' ? accountTrips.getSnapshot() : null;
      if (
        !mounted.current ||
        latest.blocked ||
        !latest.editing ||
        latest.buffer !== snapshot.buffer ||
        (account &&
          (!account.ready ||
            account.busy ||
            account.pending ||
            account.owner !== accountSnapshot?.owner ||
            account.draft !== accountSnapshot?.draft ||
            account.selected !== accountSnapshot?.selected ||
            account.latest !== accountSnapshot?.latest ||
            account.draft?.trip.id !== source.id))
      )
        return;
      action();
    } finally {
      confirming.current = false;
    }
  }
  const { tab, dayId } = selection;
  const day = trip.days.find((day) => day.id === dayId) ?? trip.days[0];
  const map = useMemo(() => projectDayMap(trip, day.id, places), [trip, day.id, places]);
  useLeaveGuard(dirty, busy);
  // Checkpoint valid draft edits locally through the existing owner/revision controllers.
  // Raw invalid fields remain in this session across tabs/days and never reach storage/API.
  useEffect(() => {
    if (!editing || blocked || !projection.ok || encoded === sourceEncoded) return;
    let current = true;
    void Promise.resolve(latestChange.current(projection.trip)).catch(() => {
      if (current) setMessage('Chưa giữ được thay đổi. Hãy giữ trang này mở và thử lưu lại.');
    });
    return () => {
      current = false;
    };
  }, [editing, blocked, encoded, sourceEncoded, projection.ok, projection.trip]);
  const change = (next: EditBuffer) => {
    setBuffer(next);
    setMessage('');
  };
  const mutate = (action: (value: EditBuffer) => EditBuffer) => {
    try {
      change(action(buffer));
    } catch {
      setMessage('Không áp dụng được. Kiểm tra giới hạn 12 hoạt động mỗi ngày và tổng chi phí.');
    }
  };
  const switchTab = (next: string) => select({ ...selection, tab: next });
  const startEdit = (activityId: string | null = null, targetTab = tab) => {
    select({ tab: targetTab, dayId: day.id, activityId });
    onEdit();
  };
  const openEditor = (activityId: string, targetDayId = day.id) => {
    if (!editing) {
      select({ tab: 'itinerary', dayId: targetDayId, activityId });
      onEdit();
    } else {
      select({ tab: 'itinerary', dayId: targetDayId, activityId });
      setOpenActivity(activityId);
    }
  };
  const save = () => {
    setShowErrors(true);
    setMessage('');
    if (!projection.ok) {
      if (projection.errors.name) document.getElementById('trip-name')?.focus();
      else if (projection.errors.group) {
        setShowGroup(true);
        switchTab('budget');
      } else {
        const id = Object.keys(projection.errors.activities)[0];
        const targetDay = buffer.layout.days.find((day) =>
          day.activities.some((activity) => activity.id === id),
        );
        if (id && targetDay) openEditor(id, targetDay.id);
      }
      setMessage('Chưa lưu thay đổi. Kiểm tra các mục được đánh dấu.');
      return;
    }
    void onSave(projection.trip);
  };
  const status = busy
    ? editing
      ? 'Đang lưu…'
      : 'Đang xử lý…'
    : saveStatus === 'unconfirmed'
      ? 'Đang chờ xác nhận đã lưu'
      : saveStatus === 'conflict'
        ? 'Có thay đổi từ nơi khác'
        : saveStatus === 'error'
          ? 'Chưa lưu được thay đổi'
          : dirty
            ? 'Có thay đổi chưa lưu'
            : editing
              ? 'Chưa có thay đổi'
              : readOnly
                ? 'Lịch trình mẫu'
                : storage === 'account' && !offlineDev
                  ? 'Đã lưu vào tài khoản'
                  : 'Đã lưu trên thiết bị';
  return (
    <article className="flex min-w-0 flex-col gap-5">
      <header className="relative flex flex-col gap-2 py-1 pr-10 pl-10">
        <Link
          href={readOnly ? '/' : '/trips'}
          aria-label="Quay lại"
          className="absolute top-2 left-0 grid size-11 place-items-center text-muted"
        >
          <Icon name="back" />
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="hidden text-xs font-bold tracking-widest text-teal uppercase">
            {destinationName}
            {destination?.countryCode === 'VN' ? ' · Việt Nam' : ''}
          </span>
          <span
            role="status"
            className={`text-xs font-semibold ${saveStatus === 'error' || saveStatus === 'conflict' ? 'text-error' : dirty ? 'text-amber-800' : 'text-muted'}`}
          >
            {status}
          </span>
        </div>
        {editing ? (
          <label className="max-w-3xl">
            <span className="sr-only">Tên chuyến đi</span>
            <input
              id="trip-name"
              aria-label="Tên chuyến đi"
              aria-invalid={showErrors && !!projection.errors.name}
              value={buffer.name}
              maxLength={80}
              disabled={blocked}
              className="border-transparent bg-transparent px-0 text-2xl font-extrabold text-ink sm:text-3xl"
              onChange={(event) => change({ ...buffer, name: event.target.value })}
            />
            {showErrors && projection.errors.name && (
              <small className="text-error">{projection.errors.name}</small>
            )}
          </label>
        ) : (
          <h1 className="text-2xl text-ink sm:text-3xl">{trip.name}</h1>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted">
            {dateLabel(trip.startDate)}–{dateLabel(trip.days.at(-1)!.date)}{' '}
            <span aria-hidden="true">·</span> {trip.durationDays} ngày{' '}
            <span aria-hidden="true">·</span> {trip.people} người
          </p>
          {!editing && !readOnly && (
            <Button secondary disabled={blocked} onClick={() => startEdit()}>
              Chỉnh sửa lịch trình
            </Button>
          )}
          <details className="absolute top-1 right-0 z-30">
            <summary
              aria-label="Tùy chọn chuyến đi"
              className="grid w-11 list-none place-items-center text-muted"
            >
              <Icon name="more" />
            </summary>
            <div className="surface absolute top-12 right-0 flex w-64 flex-col gap-3 p-4 shadow-lg">
              <h2 className="text-base">Thông tin hành trình</h2>
              <p className="text-sm">
                {destinationName} · {trip.durationDays} ngày · {trip.people} người
              </p>
              <p className="text-sm text-muted">
                {trip.generationSource === 'sample'
                  ? 'Lịch trình mẫu GoEase'
                  : trip.generationSource === 'discovery'
                    ? 'Lịch trình từ địa điểm đã tìm'
                    : 'Lịch trình của bạn'}
              </p>
              {!editing && !readOnly && (
                <>
                  <Button secondary danger disabled={blocked} onClick={onDelete}>
                    Xóa chuyến
                  </Button>
                </>
              )}
              <Link href="/travel-services" className="text-action">
                Chỗ nghỉ & chuyến bay ↗
              </Link>
            </div>
          </details>
        </div>
      </header>
      <div
        role="tablist"
        aria-label="Chi tiết chuyến"
        className="sticky top-0 z-20 flex overflow-x-auto border-b border-line bg-cream py-1 [&>button]:min-h-11 [&>button]:flex-1 [&>button]:border-b-2 [&>button]:border-transparent [&>button]:px-2 [&>button]:py-3 [&>button]:text-sm [&>button]:font-bold [&>button]:whitespace-nowrap [&>button]:transition-colors motion-reduce:[&>button]:transition-none [&>button[aria-selected=true]]:border-teal [&>button[aria-selected=true]]:text-teal"
      >
        {[
          ['itinerary', 'Lịch trình'],
          ['map', 'Bản đồ'],
          ['budget', 'Chi phí'],
        ].map(([key, label]) => (
          <button
            key={key}
            role="tab"
            id={`tab-${key}`}
            aria-controls={`panel-${key}`}
            tabIndex={tab === key ? 0 : -1}
            aria-selected={tab === key}
            onKeyDown={(event) => {
              const keys = ['itinerary', 'map', 'budget'];
              if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
                event.preventDefault();
                const next =
                  event.key === 'Home'
                    ? 0
                    : event.key === 'End'
                      ? 2
                      : (keys.indexOf(tab) + (event.key === 'ArrowRight' ? 1 : 2)) % 3;
                switchTab(keys[next]);
                document.getElementById(`tab-${keys[next]}`)?.focus();
              }
            }}
            disabled={busy}
            onClick={() => switchTab(key)}
          >
            {label}
          </button>
        ))}
      </div>
      <div
        className={`min-w-0 ${tab === 'map' ? '' : 'mx-auto w-full max-w-4xl'}`}
        role="tabpanel"
        id={`panel-${tab}`}
        aria-labelledby={`tab-${tab}`}
      >
        <MotionRegion className="flex min-w-0 flex-col gap-5" motionKey={`${tab}:${day.id}`}>
          {message && <Notice error>{message}</Notice>}
          {editing && !projection.ok && (
            <p className="text-xs text-amber-900">
              Một số thông tin chưa đúng. Hãy kiểm tra trước khi rời trang.
            </p>
          )}
          {showErrors && projection.errors.aggregate && (
            <Notice error>{projection.errors.aggregate}</Notice>
          )}
          {(tab === 'itinerary' || tab === 'map') && (
            <div aria-label="Ngày trong chuyến" className="flex gap-2 overflow-x-auto pb-1">
              {trip.days.map((item, index) => (
                <button
                  key={item.id}
                  aria-pressed={item.id === day.id}
                  disabled={busy}
                  onClick={() => select({ ...selection, dayId: item.id })}
                  className="day-button"
                >
                  <span>
                    Ngày {index + 1} · {dateLabel(item.date).slice(0, 5)}
                  </span>
                </button>
              ))}
            </div>
          )}
          {tab === 'itinerary' && (
            <>
              <p className="flex items-center gap-2 text-sm text-muted">
                <Icon name="clock" width="18" />
                Giờ gợi ý · {day.activities.length} hoạt động
              </p>
              {findTimeOverlaps(day).length > 0 && (
                <Notice error>Có hoạt động trùng giờ. Kiểm tra lại trước khi đi.</Notice>
              )}
              <div className="trip-timeline flex flex-col">
                {day.activities.map((activity, index) => {
                  const original =
                    buffer.layout.days
                      .flatMap((day) => day.activities)
                      .find((item) => item.id === activity.id) ?? activity;
                  const available = activePlaceIds
                    ? places.filter(
                        (place) =>
                          activePlaceIds.has(place.id) ||
                          (original.location.kind === 'catalog' &&
                            original.location.placeId === place.id),
                      )
                    : places;
                  return (
                    <section
                      key={activity.id}
                      id={`activity-${activity.id}`}
                      className={`activity-layout ${selection.activityId === activity.id ? 'rounded-xl bg-sand/50' : ''}`}
                    >
                      <span className="pt-1 text-base font-bold">{activity.startTime ?? '—'}</span>
                      <div className="activity-content">
                        <ActivityThumbnail activity={activity} />
                        <h3 className="text-lg leading-snug sm:text-xl">{activity.name}</h3>
                        <p className="mt-1 text-sm text-muted">
                          {activity.location.kind === 'custom' ? 'Hoạt động của bạn' : 'Khám phá'}
                          {activity.startTime && activity.endTime
                            ? ` · ${Math.round(Number(activity.endTime.slice(0, 2)) * 60 + Number(activity.endTime.slice(3)) - (Number(activity.startTime.slice(0, 2)) * 60 + Number(activity.startTime.slice(3))))} phút`
                            : ''}
                        </p>
                        <div className="activity-actions">
                          <ActivityDetails activity={activity} places={places} />
                          {!readOnly && (
                            <button
                              type="button"
                              disabled={blocked || saveDisabled}
                              className="text-action"
                              aria-label={`Đổi địa điểm ${activity.name}`}
                              onClick={() => openEditor(activity.id)}
                            >
                              <Icon name="pin" />
                              Đổi địa điểm <Icon name="chevron" width="16" />
                            </button>
                          )}
                        </div>
                        {editing && openActivity === activity.id ? (
                          <ActivityFields
                            value={buffer.activities[activity.id] ?? activityForm(activity)}
                            onChange={(value) =>
                              change({
                                ...buffer,
                                activities: { ...buffer.activities, [activity.id]: value },
                              })
                            }
                            errors={
                              showErrors ? projection.errors.activities[activity.id] : undefined
                            }
                            places={available}
                            discoveredPlaces={discoveredPlaces}
                            disabled={blocked}
                            onClose={() => setOpenActivity(null)}
                          />
                        ) : (
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            {editing && (
                              <details className="ml-auto w-full">
                                <summary className="text-action justify-end">Thao tác khác</summary>
                                <div className="flex flex-wrap items-center justify-end gap-2">
                                  <Button
                                    secondary
                                    aria-label={`Đưa lên ${activity.name}`}
                                    disabled={blocked || index === 0}
                                    onClick={() =>
                                      mutate((value) => ({
                                        ...value,
                                        layout: moveActivity(
                                          value.layout,
                                          activity.id,
                                          day.id,
                                          index - 1,
                                        ),
                                      }))
                                    }
                                  >
                                    ↑
                                  </Button>
                                  <Button
                                    secondary
                                    aria-label={`Đưa xuống ${activity.name}`}
                                    disabled={blocked || index === day.activities.length - 1}
                                    onClick={() =>
                                      mutate((value) => ({
                                        ...value,
                                        layout: moveActivity(
                                          value.layout,
                                          activity.id,
                                          day.id,
                                          index + 1,
                                        ),
                                      }))
                                    }
                                  >
                                    ↓
                                  </Button>
                                  <Button
                                    secondary
                                    danger
                                    aria-label={`Xóa hoạt động ${activity.name}`}
                                    disabled={blocked}
                                    onClick={() => {
                                      void confirmEdit(
                                        {
                                          title: 'Xóa hoạt động?',
                                          message: `Xóa hoạt động “${activity.name}” khỏi lịch trình?`,
                                          confirmLabel: 'Xóa hoạt động',
                                          danger: true,
                                        },
                                        () =>
                                          mutate((value) => ({
                                            ...value,
                                            layout: removeActivity(value.layout, activity.id),
                                          })),
                                      );
                                    }}
                                  >
                                    Xóa
                                  </Button>
                                  {trip.days.length > 1 && (
                                    <label className="text-xs">
                                      Chuyển ngày
                                      <select
                                        aria-label={`Chuyển ngày ${activity.name}`}
                                        value={day.id}
                                        disabled={blocked}
                                        onChange={(event) =>
                                          mutate((value) => ({
                                            ...value,
                                            layout: moveActivity(
                                              value.layout,
                                              activity.id,
                                              event.target.value,
                                            ),
                                          }))
                                        }
                                      >
                                        {trip.days.map((target, order) => (
                                          <option
                                            key={target.id}
                                            value={target.id}
                                            disabled={
                                              target.activities.length >= 12 && target.id !== day.id
                                            }
                                          >
                                            Ngày {order + 1}
                                          </option>
                                        ))}
                                      </select>
                                    </label>
                                  )}
                                </div>
                              </details>
                            )}
                          </div>
                        )}
                      </div>
                    </section>
                  );
                })}
              </div>
              {!day.activities.length && <Notice>Ngày này chưa có hoạt động.</Notice>}
              {!readOnly && (
                <Button
                  secondary
                  disabled={blocked || day.activities.length >= 12}
                  onClick={() => {
                    if (!editing) {
                      startEdit('__add__');
                      return;
                    }
                    const id = crypto.randomUUID();
                    mutate((value) => appendActivity(value, day.id, id));
                    setOpenActivity(id);
                  }}
                >
                  <Icon name="plus" /> Thêm địa điểm
                </Button>
              )}
              <p className="text-xs leading-relaxed text-muted">
                Giờ trong lịch là gợi ý. Kiểm tra giờ mở cửa, giá và thời gian di chuyển trước khi
                đi.
              </p>
            </>
          )}
          {tab === 'budget' && (
            <>
              {editing && showGroup ? (
                <div className="flex flex-col gap-2">
                  <GroupFields
                    value={buffer.group}
                    onChange={(group) => change({ ...buffer, group })}
                    errors={showErrors ? projection.errors.group : undefined}
                    disabled={blocked}
                  />
                  <Button secondary onClick={() => setShowGroup(false)}>
                    Xong ngân sách
                  </Button>
                </div>
              ) : null}
              <Budget
                trip={trip}
                onEditCost={openEditor}
                disabled={blocked || readOnly}
                onBudget={() => (editing ? setShowGroup(true) : startEdit(null, 'budget'))}
                onAdd={() => {
                  if (day.activities.length >= 12) {
                    setMessage(
                      'Ngày này đã có 12 hoạt động. Chọn ngày khác hoặc xóa bớt một hoạt động trước khi thêm khoản chi.',
                    );
                    return;
                  }
                  if (!editing) {
                    startEdit('__add__', 'itinerary');
                    return;
                  }
                  const id = crypto.randomUUID();
                  mutate((value) => appendActivity(value, day.id, id));
                  openEditor(id);
                }}
              />
            </>
          )}
          {tab === 'map' && (
            <GoogleDayMap
              model={map}
              selectedPlaceId={selection.placeId}
              onSelect={(placeId) => select({ ...selection, placeId })}
              onActivity={(activityId) => {
                select({ ...selection, tab: 'itinerary', activityId });
                document
                  .getElementById(`activity-${activityId}`)
                  ?.scrollIntoView({ block: 'center' });
              }}
            />
          )}
          {typeof extra === 'function'
            ? extra(locked || !projection.ok || !!openActivity || tab === 'budget')
            : extra}
        </MotionRegion>
      </div>
      {editing && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-paper p-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink">{status}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={blocked || saveDisabled || (!dirty && saveStatus !== 'error')}
              onClick={save}
            >
              {baseline ? 'Lưu thay đổi' : 'Giữ chuyến này'} <Icon name="arrow" />
            </Button>
            <Button
              secondary
              disabled={blocked}
              onClick={() => {
                if (!dirty) onCancel();
                else
                  void confirmEdit(
                    {
                      title: 'Bỏ thay đổi chưa lưu?',
                      message: 'Các chỉnh sửa từ lần lưu gần nhất sẽ bị bỏ.',
                      confirmLabel: 'Bỏ thay đổi',
                      cancelLabel: 'Tiếp tục chỉnh sửa',
                      danger: true,
                    },
                    onCancel,
                  );
              }}
            >
              Hủy
            </Button>
          </div>
        </div>
      )}
    </article>
  );
}

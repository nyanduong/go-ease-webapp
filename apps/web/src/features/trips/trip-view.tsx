import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { findTimeOverlaps, type Place, type Trip } from '@goease/contracts';
import {
  activityForm,
  moveActivity,
  removeActivity,
} from '@goease/trip-client/edit-trip-controller';
import { formatVnd } from '@goease/trip-client/budget-controller';
import { projectDayMap } from '@goease/trip-client/map-controller';
import { Button, dateLabel, Notice } from '../../components/ui';
import { useLeaveGuard } from '../../app/router';
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
import { Budget, BudgetSummary } from './budget';
import { TripOverview } from './trip-overview';

export type SaveStatus = 'idle' | 'error' | 'unconfirmed' | 'conflict';
interface TripViewProps {
  trip: Trip;
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
type Selection = { tab: string; dayId: string; activityId: string | null };
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
  const [buffer, setBuffer] = useState(() => editBuffer(source));
  const [openActivity, setOpenActivity] = useState<string | null>(
    editing ? selection.activityId : null,
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
  const encoded = JSON.stringify(projection.trip),
    sourceEncoded = JSON.stringify(source);
  const dirty =
    editing && (initialDirty || !projection.ok || !sameTrip(projection.trip, initial.current));
  const blocked = busy || locked || replacing;
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
      if (current)
        setMessage('Chưa ghi được bản nháp. Nội dung đang nhập vẫn giữ; hãy thử lưu lại.');
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
      else if (projection.errors.group) switchTab('budget');
      else {
        const id = Object.keys(projection.errors.activities)[0];
        const targetDay = buffer.layout.days.find((day) =>
          day.activities.some((activity) => activity.id === id),
        );
        if (id && targetDay) openEditor(id, targetDay.id);
      }
      setMessage('Chưa lưu thay đổi. Kiểm tra các trường được đánh dấu.');
      return;
    }
    void onSave(projection.trip);
  };
  const status = busy
    ? editing
      ? 'Đang lưu…'
      : 'Đang xử lý…'
    : saveStatus === 'unconfirmed'
      ? 'Chưa xác nhận lưu'
      : saveStatus === 'conflict'
        ? 'Có thay đổi từ nơi khác'
        : saveStatus === 'error'
          ? 'Chưa lưu được · Giữ nguyên bản nháp'
          : dirty
            ? 'Có thay đổi chưa lưu'
            : editing
              ? 'Chưa có thay đổi'
              : storage === 'account'
                ? 'Đã lưu vào tài khoản'
                : 'Đã lưu trên thiết bị';
  return (
    <article className="flex min-w-0 flex-col gap-5">
      <header className="flex flex-col gap-2 py-1">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs font-bold tracking-widest text-teal uppercase">
            Đà Lạt · Việt Nam
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
          {!editing && (
            <div className="flex flex-wrap gap-2">
              <Button secondary disabled={blocked} onClick={() => startEdit()}>
                Chỉnh sửa lịch trình
              </Button>
              <Button secondary danger disabled={blocked} onClick={onDelete}>
                Xóa chuyến
              </Button>
            </div>
          )}
        </div>
        <small className={editing ? undefined : 'hidden sm:block'}>
          {storage === 'account'
            ? 'Chuyến tài khoản · Bản nháp hợp lệ được giữ riêng trên thiết bị; chỉ gửi máy chủ khi bạn lưu.'
            : 'Chuyến khách · Lưu trong trình duyệt trên thiết bị này.'}
        </small>
      </header>
      <div
        role="tablist"
        aria-label="Chi tiết chuyến"
        className="sticky top-20 z-20 flex overflow-x-auto border-b border-line bg-cream py-1 [&>button]:min-h-11 [&>button]:flex-1 [&>button]:border-b-2 [&>button]:border-transparent [&>button]:px-2 [&>button]:py-3 [&>button]:text-sm [&>button]:font-bold [&>button]:whitespace-nowrap [&>button]:transition-colors motion-reduce:[&>button]:transition-none [&>button[aria-selected=true]]:border-teal [&>button[aria-selected=true]]:text-teal"
      >
        {[
          ['itinerary', 'Lịch trình'],
          ['budget', 'Ngân sách'],
          ['map', 'Bản đồ'],
          ['info', 'Thông tin'],
        ].map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            disabled={busy}
            onClick={() => switchTab(key)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="xl:hidden">
        <BudgetSummary trip={trip} compact disabled={busy} onBudget={() => switchTab('budget')} />
      </div>
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <MotionRegion className="flex min-w-0 flex-col gap-5" motionKey={`${tab}:${day.id}`}>
          {message && <Notice error>{message}</Notice>}
          {editing && !projection.ok && (
            <p className="text-xs text-amber-900">
              Có trường chưa hợp lệ. Nội dung đang nhập chỉ giữ trong màn hình này cho đến khi sửa
              đúng.
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
                  className={`flex min-w-23 shrink-0 flex-col gap-1 rounded-2xl px-4 py-3 text-sm transition-colors motion-reduce:transition-none ${item.id === day.id ? 'bg-teal font-bold text-white' : 'bg-mint text-teal-dark hover:bg-teal/15'}`}
                >
                  <b>Ngày {index + 1}</b>
                  <span className="text-xs">{dateLabel(item.date).slice(0, 5)}</span>
                </button>
              ))}
            </div>
          )}
          {tab === 'itinerary' && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl">
                    Ngày {trip.days.findIndex((item) => item.id === day.id) + 1} ·{' '}
                    {dateLabel(day.date).slice(0, 5)}
                  </h2>
                  <p className="mt-1 text-xs text-muted">Lịch trình trong ngày</p>
                </div>
                <span className="rounded-xl bg-mint px-3 py-2 text-xs text-teal-dark">
                  {day.activities.length} hoạt động
                </span>
              </div>
              {findTimeOverlaps(day).length > 0 && (
                <Notice error>Có hoạt động trùng giờ. Kiểm tra lại trước khi đi.</Notice>
              )}
              <div className="flex flex-col gap-4">
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
                      className="flex min-w-0 flex-col gap-4 rounded-3xl border border-line bg-paper p-5 sm:p-6"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-teal">
                          {activity.startTime ?? 'Chưa đặt giờ'}
                          {activity.endTime ? `–${activity.endTime}` : ''}
                        </span>
                        <span
                          className={`rounded-lg px-2 py-1 text-xs font-semibold ${activity.costVnd === null ? 'bg-sand text-amber-900' : 'bg-mint text-teal-dark'}`}
                        >
                          {activity.costVnd === null
                            ? 'Chưa có giá'
                            : activity.costVnd === 0
                              ? 'Miễn phí'
                              : `${formatVnd(activity.costVnd)} · cả nhóm`}
                        </span>
                      </div>
                      <div>
                        <h3 className="text-lg text-ink">{activity.name}</h3>
                        <p className="mt-1 text-xs text-muted">
                          {activity.location.kind === 'catalog'
                            ? 'Địa điểm tham quan'
                            : 'Hoạt động của bạn'}
                        </p>
                      </div>
                      {activity.notes && (
                        <details className="text-xs text-muted">
                          <summary className="text-xs font-normal">Ghi chú hoạt động</summary>
                          <p className="whitespace-pre-wrap">{activity.notes}</p>
                        </details>
                      )}
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
                          disabled={blocked}
                          onClose={() => setOpenActivity(null)}
                        />
                      ) : (
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <Button
                            secondary
                            disabled={blocked || saveDisabled}
                            aria-label={`Sửa ${activity.name}`}
                            onClick={() => openEditor(activity.id)}
                          >
                            Sửa hoạt động
                          </Button>
                          {editing && (
                            <>
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
                                  if (confirm(`Xóa hoạt động “${activity.name}” khỏi bản nháp?`))
                                    mutate((value) => ({
                                      ...value,
                                      layout: removeActivity(value.layout, activity.id),
                                    }));
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
                            </>
                          )}
                        </div>
                      )}
                    </section>
                  );
                })}
              </div>
              {!day.activities.length && <Notice>Ngày này chưa có hoạt động.</Notice>}
              {editing && (
                <Button
                  secondary
                  disabled={blocked || day.activities.length >= 12}
                  onClick={() => {
                    const id = crypto.randomUUID();
                    mutate((value) => appendActivity(value, day.id, id));
                    setOpenActivity(id);
                  }}
                >
                  + Thêm hoạt động
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
              {editing ? (
                <GroupFields
                  value={buffer.group}
                  onChange={(group) => change({ ...buffer, group })}
                  errors={showErrors ? projection.errors.group : undefined}
                  disabled={blocked}
                />
              ) : (
                <Button secondary disabled={blocked} onClick={() => startEdit(null, 'budget')}>
                  Đổi ngân sách / số người
                </Button>
              )}
              <Budget trip={trip} onEditCost={openEditor} disabled={blocked} />
            </>
          )}
          {tab === 'map' && <GoogleDayMap model={map} />}
          {tab === 'info' && (
            <div className="flex flex-col gap-4 rounded-3xl border border-line bg-paper p-5">
              <h2>Thông tin hành trình</h2>
              <p>
                Đà Lạt · {dateLabel(trip.startDate)} đến {dateLabel(trip.days.at(-1)!.date)}
              </p>
              <p>
                {trip.people} người · {trip.durationDays} ngày
              </p>
              <Notice>
                {trip.generationSource === 'ai'
                  ? 'Lịch trình gợi ý bằng AI'
                  : 'Lịch trình mẫu local'}{' '}
                · Hãy kiểm tra giờ mở cửa và giá trước khi đi.
              </Notice>
              <p className="text-sm text-muted">
                {storage === 'account'
                  ? 'Chuyến được quản lý qua tài khoản. Bản nháp và yêu cầu chưa xác nhận được giữ riêng theo tài khoản.'
                  : 'Chuyến khách được lưu trên trình duyệt của thiết bị này.'}
              </p>
            </div>
          )}
          {typeof extra === 'function'
            ? extra(locked || !projection.ok || !!openActivity || tab === 'budget')
            : extra}
        </MotionRegion>
        <TripOverview trip={trip} disabled={busy} onBudget={() => switchTab('budget')} />
      </div>
      {editing && (
        <div className="sticky bottom-22 z-20 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-teal/20 bg-paper/95 p-4 shadow-md backdrop-blur lg:bottom-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink">{status}</p>
            <small>
              {storage === 'account'
                ? 'Lưu thay đổi để cập nhật chuyến tài khoản.'
                : 'Lưu thay đổi để cập nhật chuyến trên thiết bị.'}
            </small>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={blocked || saveDisabled || (!dirty && saveStatus !== 'error')}
              onClick={save}
            >
              Lưu thay đổi
            </Button>
            <Button
              secondary
              disabled={blocked}
              onClick={() => {
                if (!dirty || confirm('Bỏ mọi thay đổi trong bản nháp này?')) onCancel();
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

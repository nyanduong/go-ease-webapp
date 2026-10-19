import { useMemo, useState, type ReactNode } from 'react';
import { findTimeOverlaps, type Place, type Trip } from '@goease/contracts';
import {
  activityForm,
  putActivity,
  removeActivity,
  moveActivity,
  type ActivityForm,
} from '@goease/trip-client/edit-trip-controller';
import { formatVnd } from '@goease/trip-client/budget-controller';
import { projectDayMap } from '@goease/trip-client/map-controller';
import { Button, dateLabel, Notice } from '../../components/ui';
import { useLeaveGuard } from '../../app/router';
import { ActivityEditor, GroupEditor } from './activity-form';
import { InlineName } from './trip-form';
import { Budget } from './budget';
import { MotionRegion } from '../../components/motion';
import { TripOverview } from './trip-overview';
import { GoogleDayMap } from '../maps/google-map';

export function TripView({
  trip,
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
  saveLabel = 'Lưu chuyến',
  saveDisabled = false,
  hideName = false,
}: {
  trip: Trip;
  editing: boolean;
  busy?: boolean;
  locked?: boolean;
  places: Place[];
  activePlaceIds?: Set<string>;
  onChange: (trip: Trip) => void;
  onSave: () => void;
  onCancel: () => void;
  onEdit: () => void;
  onDelete: () => void;
  extra?: ReactNode | ((blocked: boolean) => ReactNode);
  saveLabel?: string;
  saveDisabled?: boolean;
  hideName?: boolean;
}) {
  const [dayId, setDayId] = useState(''),
    [tab, setTab] = useState('itinerary');
  const [form, setForm] = useState<{
    id: string;
    editingId?: string;
    dayId: string;
    initial: ActivityForm;
  } | null>(null);
  const [group, setGroup] = useState(false),
    [nameDirty, setNameDirty] = useState(false),
    [message, setMessage] = useState('');
  const day = trip.days.find((day) => day.id === dayId) ?? trip.days[0];
  const model = useMemo(() => projectDayMap(trip, day.id, places), [trip, day.id, places]);
  const formOpen = !!form || group || nameDirty;
  const blocked = busy || locked;
  const originalLocation = form?.editingId
    ? trip.days.flatMap((day) => day.activities).find((activity) => activity.id === form.editingId)
        ?.location
    : undefined;
  const editablePlaces = activePlaceIds
    ? places.filter(
        (place) =>
          activePlaceIds.has(place.id) ||
          (originalLocation?.kind === 'catalog' && originalLocation.placeId === place.id),
      )
    : places;
  useLeaveGuard(formOpen, busy);
  const mutate = (work: () => Trip) => {
    try {
      onChange(work());
      setMessage('');
      return true;
    } catch {
      setMessage(
        'Kiểm tra giới hạn 12 hoạt động/ngày và nội dung hợp lệ. Bản nháp trước vẫn được giữ.',
      );
      return false;
    }
  };
  return (
    <article className="flex min-w-0 flex-col gap-5">
      <div className="relative flex min-h-60 items-end overflow-hidden rounded-3xl bg-[url('/dalat-illustration.png')] bg-cover bg-center sm:min-h-72 [&>div]:flex [&>div]:w-full [&>div]:flex-col [&>div]:gap-3 [&>div]:bg-linear-to-t [&>div]:from-ink/90 [&>div]:to-transparent [&>div]:p-6 [&>div]:pt-20 [&>div]:text-white sm:[&>div]:p-8">
        <div>
          <span className="inline-flex w-fit rounded-full bg-mint px-3 py-1 text-xs font-bold text-teal-dark">
            {editing ? 'Bản nháp · Chưa lưu' : 'Chuyến đã lưu'}
          </span>
          <h1>{trip.name}</h1>
          <p>
            {dateLabel(trip.startDate)} · {trip.durationDays} ngày · {trip.people} người
          </p>
        </div>
      </div>
      <div
        className="flex overflow-x-auto border-b border-line [&>button]:min-h-12 [&>button]:flex-1 [&>button]:border-b-2 [&>button]:border-transparent [&>button]:px-2 [&>button]:py-3 [&>button]:text-sm [&>button]:font-bold [&>button]:whitespace-nowrap [&>button]:transition-colors [&>button]:duration-200 motion-reduce:[&>button]:transition-none [&>button[aria-selected=true]]:border-teal [&>button[aria-selected=true]]:text-teal"
        role="tablist"
        aria-label="Chi tiết chuyến"
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
            disabled={blocked || formOpen}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_17rem]">
        <MotionRegion className="flex min-w-0 flex-col gap-5" motionKey={`${tab}:${day.id}`}>
          {editing && (
            <div className="flex min-w-0 flex-col gap-5 rounded-3xl border border-teal/20 bg-mint/40 p-3">
              {!hideName && (
                <InlineName
                  key={`${trip.id}:${editing}`}
                  initial={trip.name}
                  disabled={blocked || !!form || group}
                  onApply={(name) => mutate(() => ({ ...trip, name }))}
                  onDirty={setNameDirty}
                />
              )}
              <div className="flex flex-wrap items-center gap-3">
                <Button disabled={blocked || formOpen || saveDisabled} onClick={onSave}>
                  {busy ? 'Đang lưu…' : saveLabel}
                </Button>
                <Button
                  secondary
                  disabled={blocked}
                  onClick={() => {
                    if (window.confirm('Bỏ bản nháp đang chỉnh?')) {
                      setForm(null);
                      setGroup(false);
                      setNameDirty(false);
                      onCancel();
                    }
                  }}
                >
                  Hủy chỉnh sửa
                </Button>
              </div>
              <small>Áp dụng form hoạt động/ngân sách trước khi lưu chuyến.</small>
            </div>
          )}
          {message && <Notice error>{message}</Notice>}
          {typeof extra === 'function' ? extra(formOpen || locked) : extra}
          {(tab === 'itinerary' || tab === 'map') && (
            <div
              className="flex gap-3 overflow-x-auto py-2 [&>button]:flex [&>button]:min-w-24 [&>button]:shrink-0 [&>button]:flex-col [&>button]:gap-1 [&>button]:rounded-3xl [&>button]:bg-mint [&>button]:px-4 [&>button]:py-3 [&>button]:transition-colors [&>button]:duration-200 motion-reduce:[&>button]:transition-none [&>button[aria-pressed=true]]:bg-teal [&>button[aria-pressed=true]]:text-white [&>button[aria-pressed=true]>small]:text-white/80"
              aria-label="Ngày trong chuyến"
            >
              {trip.days.map((item, index) => (
                <button
                  className={item.id === day.id ? 'font-bold' : ''}
                  aria-pressed={item.id === day.id}
                  disabled={blocked || formOpen}
                  key={item.id}
                  onClick={() => setDayId(item.id)}
                >
                  <b>Ngày {index + 1}</b>
                  <small>{dateLabel(item.date).slice(0, 5)}</small>
                </button>
              ))}
            </div>
          )}
          {tab === 'itinerary' && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-4 pt-3">
                <div>
                  <span className="text-xs font-bold tracking-widest text-teal-dark uppercase">
                    Những điểm dừng chân
                  </span>
                  <h2>
                    {dateLabel(day.date)} · {day.activities.length} hoạt động
                  </h2>
                </div>
                {editing && (
                  <Button
                    secondary
                    disabled={blocked || formOpen || day.activities.length >= 12}
                    onClick={() =>
                      setForm({
                        id: crypto.randomUUID(),
                        dayId: day.id,
                        initial: activityForm(),
                      })
                    }
                  >
                    + Thêm hoạt động
                  </Button>
                )}
              </div>
              {findTimeOverlaps(day).length > 0 && (
                <Notice error>Có hoạt động trùng giờ. Hãy kiểm tra lại trước khi đi.</Notice>
              )}
              {form && (
                <ActivityEditor
                  key={form.id}
                  initial={form.initial}
                  id={form.id}
                  places={editablePlaces}
                  disabled={blocked}
                  onApply={(activity) => {
                    if (mutate(() => putActivity(trip, form.dayId, activity, form.editingId)))
                      setForm(null);
                  }}
                  onCancel={() => setForm(null)}
                />
              )}
              {!form && (
                <div className="flex flex-col">
                  {day.activities.map((activity, index) => (
                    <section key={activity.id} className="flex min-w-0 gap-3 sm:gap-6">
                      <div className="relative flex w-14 shrink-0 flex-col items-center gap-3 pt-4 text-sm font-bold text-teal after:mb-0 after:block after:w-px after:flex-1 after:bg-teal/20 sm:w-20 [&>span]:size-2 [&>span]:rounded-full [&>span]:bg-teal">
                        {activity.startTime ?? '—'}
                        <span />
                      </div>
                      <div className="mb-4 flex min-w-0 flex-1 flex-col gap-3 rounded-3xl border border-line bg-paper p-4 sm:p-6">
                        <span className="text-xs font-bold tracking-widest text-teal-dark uppercase">
                          {activity.location.kind === 'catalog'
                            ? 'Địa điểm tham quan'
                            : 'Hoạt động của bạn'}
                        </span>
                        <h3>{activity.name}</h3>
                        <p>
                          {activity.startTime ?? 'Chưa đặt giờ'}
                          {activity.endTime ? ` – ${activity.endTime}` : ''} ·{' '}
                          {activity.costVnd === null
                            ? 'Chưa có giá'
                            : activity.costVnd === 0
                              ? 'Miễn phí'
                              : formatVnd(activity.costVnd)}
                        </p>
                        {activity.notes && (
                          <p className="text-sm break-words whitespace-pre-wrap text-muted">
                            {activity.notes}
                          </p>
                        )}
                        {editing && (
                          <div className="flex flex-wrap items-center gap-3 [&>button]:min-h-10 [&>button]:px-2 [&>button]:py-2 [&>button]:text-xs [&>button]:whitespace-nowrap">
                            <Button
                              secondary
                              disabled={blocked || group || nameDirty}
                              onClick={() =>
                                setForm({
                                  id: activity.id,
                                  editingId: activity.id,
                                  dayId: day.id,
                                  initial: activityForm(activity),
                                })
                              }
                            >
                              Sửa {activity.name}
                            </Button>
                            <Button
                              secondary
                              aria-label={`Đưa lên ${activity.name}`}
                              disabled={blocked || formOpen || index === 0}
                              onClick={() =>
                                mutate(() => moveActivity(trip, activity.id, day.id, index - 1))
                              }
                            >
                              ↑
                            </Button>
                            <Button
                              secondary
                              aria-label={`Đưa xuống ${activity.name}`}
                              disabled={blocked || formOpen || index === day.activities.length - 1}
                              onClick={() =>
                                mutate(() => moveActivity(trip, activity.id, day.id, index + 1))
                              }
                            >
                              ↓
                            </Button>
                            <Button
                              secondary
                              danger
                              aria-label={`Xóa hoạt động ${activity.name}`}
                              disabled={blocked || formOpen}
                              onClick={() => {
                                if (
                                  window.confirm(`Xóa hoạt động “${activity.name}” khỏi bản nháp?`)
                                )
                                  mutate(() => removeActivity(trip, activity.id));
                              }}
                            >
                              Xóa
                            </Button>
                            {trip.days.length > 1 && (
                              <label className="max-w-40 text-xs">
                                Chuyển ngày
                                <select
                                  aria-label={`Chuyển ngày ${activity.name}`}
                                  value={day.id}
                                  disabled={blocked || formOpen}
                                  onChange={(event) =>
                                    mutate(() =>
                                      moveActivity(trip, activity.id, event.target.value),
                                    )
                                  }
                                >
                                  {trip.days.map((item, order) => (
                                    <option
                                      value={item.id}
                                      key={item.id}
                                      disabled={item.activities.length >= 12 && item.id !== day.id}
                                    >
                                      Ngày {order + 1}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            )}
                          </div>
                        )}
                      </div>
                    </section>
                  ))}
                </div>
              )}
              {!day.activities.length && (
                <Notice>Ngày này chưa có hoạt động. Bắt đầu thêm một điểm dừng chân.</Notice>
              )}
              <Notice>
                Giờ và chi phí là gợi ý. Hãy kiểm tra giờ mở cửa, giá và thời gian di chuyển trước
                khi đi.
              </Notice>
            </>
          )}
          {tab === 'budget' && (
            <>
              <Budget trip={trip} />
              {editing && !group && (
                <Button secondary disabled={blocked} onClick={() => setGroup(true)}>
                  Đổi ngân sách / số người
                </Button>
              )}
              {group && (
                <GroupEditor
                  trip={trip}
                  disabled={blocked}
                  onApply={(input) => {
                    if (mutate(() => input)) setGroup(false);
                  }}
                  onCancel={() => setGroup(false)}
                />
              )}
            </>
          )}
          {tab === 'map' && <GoogleDayMap model={model} />}
          {tab === 'info' && (
            <div className="flex min-w-0 flex-col gap-5 rounded-3xl border border-line bg-paper p-5 sm:p-6">
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
              <p>
                Giờ chỉ là gợi ý, chưa kiểm tra giờ mở cửa hoặc tối ưu tuyến. Chi phí là ước tính
                tổng nhóm.
              </p>
            </div>
          )}
          {!editing && (
            <div className="sticky bottom-22 z-10 flex flex-wrap items-center gap-3 rounded-3xl border border-line bg-paper/95 p-3 shadow-sm backdrop-blur lg:bottom-3">
              <Button disabled={blocked} onClick={onEdit}>
                Chỉnh sửa lịch trình
              </Button>
              <Button secondary danger disabled={blocked} onClick={onDelete}>
                Xóa chuyến
              </Button>
            </div>
          )}
        </MotionRegion>
        <TripOverview
          trip={trip}
          disabled={blocked || formOpen}
          onBudget={() => setTab('budget')}
        />
      </div>
    </article>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { getDalatCatalog, getDalatPlaces } from '@goease/catalog';
import {
  createTripSubmission,
  initialTripForm,
  type FormErrors,
} from '@goease/trip-client/create-trip-controller';
import { createTripEditor } from '@goease/trip-client/edit-trip-controller';
import { Link, navigate, useLeaveGuard } from '../../app/router';
import { Button, dateLabel, Notice, PageTitle } from '../../components/ui';
import { TripForm } from './trip-form';
import { TripView } from './trip-view';
import { guestTrips, useGuestTrips } from './guest-store';
import { MotionRegion } from '../../components/motion';
import { HomeOverview } from './home-overview';
import { PlanningGuide } from './planning-guide';
import { AiPlanner } from '../ai/ai-planner';

export function GuestList({ home = false }: { home?: boolean }) {
  const state = useGuestTrips();
  return (
    <div className="flex min-w-0 flex-col gap-5">
      {home ? (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_18rem]">
          <section className="relative isolate flex min-h-[29rem] items-start overflow-hidden rounded-3xl bg-[url('/dalat-illustration.png')] bg-cover bg-center p-6 before:absolute before:inset-0 before:-z-10 before:bg-linear-to-b before:from-cream/95 before:via-cream/55 before:to-transparent sm:min-h-[31rem] sm:p-10 xl:min-h-[26rem] xl:p-8 [&_h1]:text-4xl sm:[&_h1]:text-5xl [&_p]:max-w-sm [&>div]:flex [&>div]:max-w-lg [&>div]:flex-col [&>div]:items-start [&>div]:gap-5">
            <div>
              <span className="text-xs font-bold tracking-widest text-teal-dark uppercase">
                Xin chào, người bạn đồng hành
              </span>
              <h1>
                Sẵn sàng cho
                <br />
                hành trình mới?
              </h1>
              <p>Những chuyến đi tuyệt vời luôn bắt đầu bằng một kế hoạch tốt.</p>
              <Link
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-linear-to-r from-amber-500 to-orange px-5 py-3 text-center text-sm font-bold text-white hover:from-orange hover:to-amber-600"
                href="/trips/new"
              >
                + Tạo chuyến đi
              </Link>
            </div>
            <span className="absolute right-6 bottom-8 text-right text-2xl text-white italic drop-shadow-lg">
              Just go.
              <br />
              We’ll plan.
            </span>
          </section>
          <HomeOverview trips={state.trips} />
        </div>
      ) : (
        <PageTitle
          eyebrow="Hành trình của bạn"
          description="Chuyến khách được lưu trong trình duyệt trên thiết bị này."
        >
          Chuyến đi của tôi
        </PageTitle>
      )}
      <div className="flex flex-wrap items-center justify-between gap-4 pt-3">
        <div>
          <span className="text-xs font-bold tracking-widest text-teal-dark uppercase">
            Lên kế hoạch cùng nhau
          </span>
          <h2>{home ? 'Chuyến đi của bạn' : `${state.trips.length} chuyến đã lưu`}</h2>
        </div>
        <Link
          href="/trips/new"
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-mint px-5 py-3 text-center text-sm font-bold text-teal-dark hover:bg-teal/15"
        >
          + Tạo chuyến
        </Link>
      </div>
      {(state.loadStatus === 'idle' || state.loadStatus === 'loading') && (
        <Notice>Đang đọc chuyến đã lưu…</Notice>
      )}
      {state.readError && (
        <Notice error>
          {state.readError.message}
          <Button
            secondary
            onClick={() => {
              void guestTrips.load();
            }}
          >
            Thử đọc lại kho chuyến
          </Button>
        </Notice>
      )}
      {!!state.issues.length && (
        <Notice error>
          Kho có {state.issues.length} bản ghi lỗi. Tạm chặn ghi để giữ nguyên dữ liệu.
        </Notice>
      )}
      {state.writeError && <Notice error>{state.writeError.message}</Notice>}
      {state.loadStatus === 'ready' && !state.trips.length && (
        <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed border-teal/25 bg-mint/40 px-5 py-10 text-center [&>p]:max-w-md [&>p]:text-muted [&>span]:text-4xl">
          <span aria-hidden="true">✧</span>
          <h3>Hành trình đầu tiên đang chờ bạn</h3>
          <p>Tạo một chuyến Đà Lạt, thêm những điểm yêu thích và lên ngân sách cho cả nhóm.</p>
        </div>
      )}
      <MotionRegion
        className="grid min-w-0 gap-5 sm:grid-cols-2 xl:grid-cols-3"
        stagger
        motionKey={state.trips.map((item) => item.trip.id).join(':')}
      >
        {state.trips.map(({ trip }) => (
          <Link
            key={trip.id}
            className="group overflow-hidden rounded-3xl border border-line bg-paper transition-[transform,box-shadow] duration-200 hover:shadow-lg motion-safe:hover:-translate-y-1 motion-safe:active:scale-[.99] motion-reduce:transition-none [&>div:last-child]:relative [&>div:last-child]:flex [&>div:last-child]:flex-col [&>div:last-child]:gap-2 [&>div:last-child]:p-5"
            href={`/trips/${encodeURIComponent(trip.id)}`}
          >
            <div className="h-44 bg-[url('/dalat-illustration.png')] bg-cover bg-center p-4">
              <span className="inline-flex w-fit rounded-full bg-mint px-3 py-1 text-xs font-bold text-teal-dark">
                {trip.generationSource === 'ai' ? 'Gợi ý AI' : 'Lịch trình mẫu'}
              </span>
            </div>
            <div>
              <h3>{trip.name}</h3>
              <p>Đà Lạt · {dateLabel(trip.startDate)}</p>
              <small>
                {trip.durationDays} ngày · {trip.people} người
              </small>
              <span className="absolute right-5 bottom-5 text-xl text-teal" aria-hidden="true">
                ↗
              </span>
            </div>
          </Link>
        ))}
      </MotionRegion>
      <Button
        secondary
        className="self-start"
        onClick={() => {
          void guestTrips.load();
        }}
      >
        Tải lại chuyến trên thiết bị
      </Button>
      {home && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-4 pt-3">
            <h2>Khám phá cùng GoEase</h2>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:gap-4 [&_h3]:text-xs sm:[&_h3]:text-lg [&_p]:hidden [&_p]:text-sm [&_p]:text-muted sm:[&_p]:block [&_span]:text-3xl [&_span]:text-teal [&>a]:flex [&>a]:flex-col [&>a]:gap-3 [&>a]:rounded-3xl [&>a]:bg-sand [&>a]:p-3 sm:[&>a]:p-6 [&>a:nth-child(2)]:bg-mint">
            <Link href="/trips">
              <span>◈</span>
              <h3>Quản lý ngân sách</h3>
              <p>Biết mình đã chi bao nhiêu, còn bao nhiêu.</p>
            </Link>
            <Link href="/trips/new">
              <span>⌖</span>
              <h3>Lên kế hoạch chuyến đi</h3>
              <p>Lịch trình riêng cho nhóm bạn của bạn.</p>
            </Link>
            <Link href="/travel-services">
              <span>✈</span>
              <h3>Chỗ nghỉ & chuyến bay</h3>
              <p>Tham khảo website cho hành trình trọn vẹn.</p>
            </Link>
          </div>
        </>
      )}
      <Notice>
        Chuyến trên Expo Go và trên trình duyệt lưu ở hai nơi riêng. Để chuyển chuyến từ Expo Go,
        nhập bản sao chuyến khách vào tài khoản trên điện thoại rồi đăng nhập trên web.
      </Notice>
    </div>
  );
}
export function NewGuestTrip() {
  const state = useGuestTrips(),
    [initial] = useState(() => initialTripForm(new Date()));
  const [form, setForm] = useState(initial),
    [errors, setErrors] = useState<FormErrors>({}),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  const [completed, setCompleted] = useState<string | null>(null),
    [aiLocked, setAiLocked] = useState(false),
    [aiBusy, setAiBusy] = useState(false);
  const [submission] = useState(() =>
    createTripSubmission({
      store: guestTrips,
      getCatalog: getDalatCatalog,
      now: () => new Date(),
      newId: () => crypto.randomUUID(),
    }),
  );
  useLeaveGuard(
    !completed && (JSON.stringify(form) !== JSON.stringify(initial) || aiLocked),
    busy || aiBusy,
  );
  useEffect(
    () => () => {
      submission.discard();
    },
    [submission],
  );
  useEffect(() => {
    if (completed && !busy && !aiBusy) navigate(`/trips/${completed}`, true);
  }, [completed, busy, aiBusy]);
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <PageTitle
        eyebrow="Thông tin → Lịch trình → Hoàn tất"
        description="Vài thông tin để bắt đầu. Bạn có thể chỉnh sửa lịch trình sau khi tạo."
      >
        Bắt đầu hành trình của bạn
      </PageTitle>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_17rem]">
        <div className="flex min-w-0 flex-col gap-5">
          <form
            className="flex min-w-0 flex-col gap-5 rounded-3xl border border-line bg-paper p-5 sm:p-6"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              if (busy || aiBusy || aiLocked) return;
              setBusy(true);
              setMessage('');
              void submission
                .submit(form)
                .then((result) => {
                  if (result.ok) {
                    setCompleted(result.tripId);
                    return;
                  }
                  setErrors(result.errors ?? {});
                  setMessage(result.message);
                })
                .finally(() => setBusy(false));
            }}
          >
            <TripForm
              values={form}
              onChange={setForm}
              errors={errors}
              disabled={busy || aiBusy || aiLocked}
            />
            {message && <Notice error>{message}</Notice>}
            <Button
              type="submit"
              disabled={
                busy || aiBusy || aiLocked || state.loadStatus !== 'ready' || !!state.issues.length
              }
            >
              {busy ? 'Đang tạo và lưu…' : 'Tạo lịch trình mẫu'}
            </Button>
            <small>Lưu trên thiết bị · Có thể chỉnh sửa sau</small>
          </form>
          <Notice>
            Lịch trình mẫu từ danh mục demo Đà Lạt, không phải giá hoặc giờ mở cửa trực tiếp.
          </Notice>
          <AiPlanner
            form={form}
            disabled={busy}
            onLocked={setAiLocked}
            onBusy={setAiBusy}
            onSaved={setCompleted}
          />
        </div>
        <PlanningGuide />
      </div>
    </div>
  );
}
export function GuestTrip({ id }: { id: string }) {
  const state = useGuestTrips(),
    saved = state.trips.find((item) => item.trip.id === id);
  const [editor] = useState(() => {
      const editor = createTripEditor(guestTrips);
      editor.adoptNew(id);
      return editor;
    }),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [deleted, setDeleted] = useState(false),
    [aiLocked, setAiLocked] = useState(false),
    [aiBusy, setAiBusy] = useState(false);
  const trip = state.draft?.trip.id === id ? state.draft.trip : saved?.trip;
  const editing = editor.owns();
  const places = useMemo(() => getDalatPlaces(), []);
  useLeaveGuard(editor.dirty(), busy || aiBusy);
  useEffect(
    () => () => {
      editor.cancel();
    },
    [editor],
  );
  useEffect(() => {
    if (deleted && !busy) navigate('/trips', true);
  }, [deleted, busy]);
  if (!trip)
    return (
      <div className="flex min-w-0 flex-col gap-5">
        <PageTitle>Chuyến đi</PageTitle>
        <Notice>
          {state.loadStatus === 'ready'
            ? 'Không tìm thấy chuyến trên trình duyệt này.'
            : 'Đang đọc chuyến…'}
        </Notice>
        <Link href="/trips">Về danh sách</Link>
      </div>
    );
  return (
    <div className="flex min-w-0 flex-col gap-5">
      {message && <Notice>{message}</Notice>}
      <TripView
        trip={trip}
        editing={editing}
        busy={busy || aiBusy}
        saveDisabled={aiLocked}
        places={places}
        onChange={(input) => editor.change(input)}
        onEdit={() => {
          try {
            if (saved) editor.begin(saved);
          } catch {
            setMessage('Có bản nháp khác. Hãy xử lý trước khi mở chỉnh sửa.');
          }
        }}
        onSave={() => {
          setBusy(true);
          void editor
            .save()
            .then((result) => setMessage(result.message))
            .finally(() => setBusy(false));
        }}
        onCancel={() => {
          editor.cancel();
          setMessage('Đã bỏ chỉnh sửa.');
        }}
        onDelete={() => {
          if (!saved || !window.confirm(`Xóa chuyến “${trip.name}” trên thiết bị này?`)) return;
          setBusy(true);
          void guestTrips
            .deleteSaved(id, saved.revision)
            .then((ok) => setDeleted(ok))
            .finally(() => setBusy(false));
        }}
        extra={(blocked) => (
          <AiPlanner
            target={editing ? trip : undefined}
            disabled={busy || blocked || !editing}
            onLocked={setAiLocked}
            onBusy={setAiBusy}
            onApply={(input) => editor.change(input)}
          />
        )}
      />
      {state.writeError && <Notice error>{state.writeError.message}</Notice>}
    </div>
  );
}

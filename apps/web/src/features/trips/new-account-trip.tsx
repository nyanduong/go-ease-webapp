import { useEffect, useRef, useState } from 'react';
import {
  addCalendarDays,
  getDestination,
  todayAtDestination,
  tripSchema,
  summarizeBudget,
  type Trip,
  type DiscoveryPreviewResponse,
  type DiscoveryPreviewRequest,
} from '@goease/contracts';
import { generateSampleTrip } from '@goease/itinerary';
import { notesAfterPlaceChange } from '@goease/trip-client/edit-trip-controller';
import {
  initialTripForm,
  validateTripForm,
  type FormErrors,
} from '@goease/trip-client/create-trip-controller';
import { Button, Notice } from '../../components/ui';
import { Icon } from '../../components/icon';
import { useLeaveGuard } from '../../app/router';
import { accountSession, accountTrips, useAccount } from '../account/session';
import { TripForm } from './trip-form';
import { DiscoveryReview } from './discovery-review';
import { confirmAction } from '../../platform/confirmation';
import { offlineDev } from '../../platform/dev-mode';
import { contentDetail } from '../content/content-api';
import { clearCreation, restoreCreation, saveCreation } from './creation-cache';

const interests = [
  ['heritage', 'Di sản'],
  ['religious', 'Tâm linh'],
  ['nature', 'Thiên nhiên'],
  ['garden', 'Vườn hoa'],
  ['market', 'Chợ địa phương'],
  ['public-space', 'Không gian công cộng'],
  ['food', 'Ẩm thực'],
  ['cafe', 'Cà phê'],
] as const;

export function NewAccountTrip({
  disabled,
  onCancel,
  onCreate,
}: {
  disabled: boolean;
  onCancel: () => void;
  onCreate: (trip: Trip) => Promise<void>;
}) {
  const { catalog, trips } = useAccount();
  const owner = trips.owner!;
  const [contentId] = useState(() => new URLSearchParams(location.search).get('content'));
  const [restored] = useState(() => {
    const saved = restoreCreation(sessionStorage, owner);
    return (saved?.contentId ?? null) === contentId ? saved : null;
  });
  const [initial] = useState(() => {
    const base = initialTripForm(new Date());
    const query = new URLSearchParams(location.search);
    const destination = getDestination(query.get('destination') ?? '');
    return {
      ...base,
      name: 'Chuyến đi của tôi',
      ...(destination
        ? { destinationId: destination.id, destination }
        : query.has('choose') || query.has('destination') || query.has('content')
          ? { destinationId: '', destination: undefined }
          : {}),
    };
  });
  const [pace, setPace] = useState<'relaxed' | 'balanced' | 'active'>(restored?.pace ?? 'relaxed');
  const [form, setForm] = useState(restored?.form ?? initial),
    [errors, setErrors] = useState<FormErrors>({});
  const [selectedInterests, setInterests] = useState<
    NonNullable<DiscoveryPreviewRequest['interests']>
  >(restored?.interests ?? []);
  const [reviewing, setReviewing] = useState(restored?.reviewing ?? false);
  const [preview, setPreview] = useState<DiscoveryPreviewResponse | null>(
    restored?.preview ?? null,
  );
  const [previewAt, setPreviewAt] = useState<number | null>(restored?.previewAt ?? null);
  const [cacheFailed, setCacheFailed] = useState(false);
  const completed = useRef(false);
  const cacheMounted = useRef(false);
  useEffect(() => {
    if (!cacheMounted.current) {
      cacheMounted.current = true;
      if (restored) return; // A reload must not extend the last edit's lifetime.
    }
    if (completed.current || accountTrips.getSnapshot().owner !== owner) return;
    setCacheFailed(
      !saveCreation(sessionStorage, owner, {
        contentId,
        form,
        pace,
        interests: selectedInterests,
        preview,
        previewAt,
        reviewing,
      }),
    );
  }, [owner, form, pace, selectedInterests, preview, previewAt, reviewing, restored]);
  const formHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (preview && !reviewing) formHeading.current?.focus({ preventScroll: true });
  }, [preview, reviewing]);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  const [destinationBusy, setDestinationBusy] = useState(false);
  const [editorial, setEditorial] = useState(!!contentId);
  const [editorialLoading, setEditorialLoading] = useState(!!contentId);
  useEffect(() => {
    if (!contentId) return;
    const request = new AbortController();
    setEditorialLoading(true);
    void (async () => {
      const selected = await contentDetail(contentId, request.signal);
      const parent =
        selected.entry.kind === 'destination'
          ? selected
          : selected.entry.destinationId
            ? await contentDetail(selected.entry.destinationId, request.signal)
            : null;
      if (!parent?.entry.destination) throw Error('Nội dung chưa có điểm đến để lập kế hoạch.');
      if (request.signal.aborted || accountTrips.getSnapshot().owner !== owner) return;
      if (!restored)
        setForm((current) => ({
          ...current,
          destinationId: parent.entry.destination!.id,
          destination: parent.entry.destination!,
        }));
      setPreview(null);
      setEditorial(true);
      setMessage(
        'Đã chọn điểm đến từ nội dung GoEase. Tạo lịch trống để tự thêm những địa điểm bạn muốn ghé.',
      );
    })()
      .catch(() => {
        if (!request.signal.aborted)
          setMessage('Chưa mở được điểm đến từ nội dung này. Hãy chọn lại điểm đến để tiếp tục.');
      })
      .finally(() => {
        if (!request.signal.aborted) setEditorialLoading(false);
      });
    return () => request.abort();
  }, [contentId, owner, restored]);
  const submitting = useRef(false);
  async function createDraft(trip: Trip) {
    if (submitting.current || disabled) return;
    submitting.current = true;
    setBusy(true);
    try {
      await onCreate(trip);
      const current = accountTrips.getSnapshot();
      if (current.owner === owner && current.draft?.trip.id === trip.id) {
        completed.current = true;
        clearCreation(sessionStorage, owner);
      }
    } finally {
      submitting.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  const controller = useRef<AbortController | null>(null);
  const confirming = useRef(false),
    mounted = useRef(true),
    current = useRef({ form, selectedInterests, disabled, busy, destinationBusy });
  current.current = { form, selectedInterests, disabled, busy, destinationBusy };
  const changed =
    JSON.stringify(form) !== JSON.stringify(initial) ||
    selectedInterests.length > 0 ||
    pace !== 'relaxed';
  useLeaveGuard(changed, disabled || busy || destinationBusy);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      controller.current?.abort();
    };
  }, []);
  async function cancel() {
    if (confirming.current || disabled || busy || destinationBusy) return;
    const snapshot = current.current,
      owner = accountTrips.getSnapshot().owner;
    confirming.current = true;
    try {
      if (
        changed &&
        !(await confirmAction({
          title: 'Hủy tạo chuyến đi?',
          message: 'Thông tin chuyến đi bạn đang nhập sẽ không được lưu.',
          confirmLabel: 'Bỏ thông tin',
          cancelLabel: 'Tiếp tục nhập',
          danger: true,
        }))
      )
        return;
      const latest = current.current,
        account = accountTrips.getSnapshot();
      if (
        !mounted.current ||
        latest.disabled ||
        latest.busy ||
        latest.destinationBusy ||
        latest.form !== snapshot.form ||
        latest.selectedInterests !== snapshot.selectedInterests ||
        !account.ready ||
        account.busy ||
        account.pending ||
        account.draft ||
        account.owner !== owner
      )
        return;
      onCancel();
      completed.current = true;
      clearCreation(sessionStorage, owner);
    } finally {
      confirming.current = false;
    }
  }
  const validate = () => {
    const destination = form.destination ?? getDestination(form.destinationId ?? 'da-lat');
    const result = validateTripForm(form, todayAtDestination(new Date(), destination));
    setErrors(result.ok ? {} : result.errors);
    if (!result.ok) setMessage('Kiểm tra các thông tin được đánh dấu.');
    return result;
  };
  async function discover() {
    if (offlineDev || editorial) return manual();
    const parsed = validate();
    if (!parsed.ok || busy || destinationBusy || editorialLoading || disabled) return;
    const request = new AbortController();
    controller.current = request;
    setBusy(true);
    setPreview(null);
    setMessage('');
    try {
      const result = await accountSession.discoverTrip(
        {
          input: parsed.input,
          pace,
          ...(selectedInterests.length ? { interests: selectedInterests } : {}),
        },
        request.signal,
      );
      if (!request.signal.aborted) {
        setPreview(result);
        setPreviewAt(Date.now());
        setReviewing(true);
      }
    } catch (error) {
      if (!request.signal.aborted)
        setMessage(
          error instanceof Error ? error.message : 'Chưa tìm được địa điểm. Bạn có thể thử lại.',
        );
    } finally {
      if (controller.current === request) {
        controller.current = null;
        setBusy(false);
      }
    }
  }
  async function manual() {
    const parsed = validate();
    if (!parsed.ok || busy || destinationBusy || editorialLoading || disabled) return;
    const destination = parsed.input.destination ?? getDestination(parsed.input.destinationId);
    if (!destination) return;
    const id = crypto.randomUUID();
    const trip = tripSchema.parse({
      schemaVersion: 1,
      id,
      ...parsed.input,
      destination,
      timeZone: destination.timeZone,
      currency: destination.currency,
      days: Array.from({ length: parsed.input.durationDays }, (_, index) => ({
        id: `${id}-day-${index + 1}`,
        date: addCalendarDays(parsed.input.startDate, index),
        activities: [],
      })),
    });
    await createDraft(trip);
  }
  async function sample() {
    const parsed = validate();
    if (
      !parsed.ok ||
      parsed.input.destinationId !== 'da-lat' ||
      busy ||
      destinationBusy ||
      disabled
    )
      return;
    const result = generateSampleTrip(
      parsed.input,
      catalog.filter((place) => place.enabled).map((place) => place.entry),
      { tripId: crypto.randomUUID(), today: todayAtDestination(new Date()) },
    );
    if (!result.ok) {
      setMessage(result.message);
      return;
    }
    await createDraft(result.trip);
  }
  function replacePlace(activityId: string, placeId: string) {
    if (!preview) return;
    const place = preview.places.find((item) => item.id === placeId);
    if (!place) return;
    const trip = tripSchema.parse({
      ...preview.result.trip,
      days: preview.result.trip.days.map((day) => ({
        ...day,
        activities: day.activities.map((current) =>
          current.id === activityId
            ? {
                ...current,
                name: place.name,
                location: { kind: 'discovered', placeId: place.id, placeSnapshot: place },
                costVnd: null,
                notes: notesAfterPlaceChange(current.notes),
              }
            : current,
        ),
      })),
    });
    const warning =
      'Bạn đã thay địa điểm. Hãy kiểm tra lại giờ tham quan và thời gian di chuyển trước khi lưu.';
    setPreview({
      ...preview,
      result: {
        ...preview.result,
        trip,
        budget: summarizeBudget(trip),
        warnings: [...preview.result.warnings.filter((item) => item !== warning), warning],
        explanations: [
          'Bạn đã thay địa điểm thủ công. Giờ trong lịch được giữ nguyên để bạn chỉnh lại; thời gian di chuyển chưa được xếp lại.',
        ],
      },
    });
  }
  if (preview && reviewing)
    return (
      <DiscoveryReview
        preview={preview}
        disabled={disabled || busy}
        onBack={() => {
          setReviewing(false);
          window.scrollTo({ top: 0, behavior: 'instant' });
        }}
        onReplace={replacePlace}
        onContinue={(trip) => void createDraft(trip)}
      />
    );
  return (
    <section
      className="mx-auto flex w-full max-w-2xl min-w-0 flex-col gap-6"
      aria-label="Lên kế hoạch chuyến đi"
    >
      <div>
        <button type="button" className="text-action mb-4" onClick={() => void cancel()}>
          <Icon name="back" /> Tạo chuyến đi
        </button>
        <h1 ref={formHeading} tabIndex={-1} className="outline-none">
          Chuyến đi của bạn
        </h1>
      </div>
      {preview && (
        <Button secondary onClick={() => setReviewing(true)} disabled={disabled || busy}>
          Xem lại lịch gợi ý
        </Button>
      )}
      <p className="text-sm text-muted">
        Thông tin đang nhập được giữ trong tab này tối đa 24 giờ sau lần sửa cuối; lịch gợi ý tối đa
        1 giờ. Chỉ chuyến đã lưu mới đồng bộ tài khoản. Đăng xuất hoặc đóng tab sẽ bỏ dữ liệu tạm.
      </p>
      {cacheFailed && (
        <Notice error>
          Trình duyệt chưa giữ được thông tin tạm. Hãy hoàn tất chuyến trước khi tải lại trang.
        </Notice>
      )}
      <form
        noValidate
        className="flex flex-col gap-5"
        onSubmit={(event) => {
          event.preventDefault();
          void discover();
        }}
      >
        <TripForm
          values={form}
          onChange={(value) => {
            setForm(value);
            if (value.destinationId !== form.destinationId) setEditorial(false);
            setPreview(null);
            setMessage('');
            setErrors({});
          }}
          pace={pace}
          onPace={(value) => {
            setPace(value);
            setPreview(null);
          }}
          errors={errors}
          disabled={disabled || busy || editorialLoading}
          searchDestinations={accountSession.searchDestinations}
          onSearchBusyChange={setDestinationBusy}
          options={
            !offlineDev && (
              <fieldset disabled={disabled || busy} className="flex flex-wrap gap-2">
                <legend className="mb-3 font-semibold">
                  Bạn thích trải nghiệm gì?{' '}
                  <span className="text-sm font-normal text-muted">(tối đa 6, không bắt buộc)</span>
                </legend>
                {interests.map(([id, label]) => (
                  <label
                    key={id}
                    className={`flex min-h-11 cursor-pointer flex-row items-center gap-2 rounded-full border px-4 py-2 text-sm ${selectedInterests.includes(id) ? 'border-teal bg-mint text-teal-dark' : 'border-line'}`}
                  >
                    <input
                      type="checkbox"
                      className="size-4 w-auto"
                      checked={selectedInterests.includes(id)}
                      disabled={selectedInterests.length >= 6 && !selectedInterests.includes(id)}
                      onChange={(event) => {
                        setInterests((value) =>
                          event.target.checked
                            ? [...value, id]
                            : value.filter((item) => item !== id),
                        );
                        setPreview(null);
                      }}
                    />
                    {label}
                  </label>
                ))}
              </fieldset>
            )
          }
        />
        {message && (
          <Notice error>{message} Bạn vẫn có thể tạo lịch trống và tự thêm hoạt động.</Notice>
        )}
        {busy && (
          <Notice>
            <span role="status">Đang tìm địa điểm và sắp xếp hành trình…</span> Thông tin giá và giờ
            mở cửa có thể chưa đầy đủ.
            <Button
              secondary
              onClick={() => {
                controller.current?.abort();
                controller.current = null;
                setBusy(false);
                setMessage('Đã dừng tìm địa điểm. Thông tin bạn nhập vẫn được giữ.');
              }}
            >
              Dừng tìm
            </Button>
          </Notice>
        )}
        <div className="flex flex-col gap-3">
          {!offlineDev && !editorial && (
            <Button type="submit" disabled={disabled || busy || destinationBusy}>
              {busy ? 'Đang tạo lịch trình…' : 'Tạo lịch trình'} <Icon name="arrow" />
            </Button>
          )}
          <Button
            secondary
            disabled={disabled || busy || destinationBusy}
            onClick={() => void manual()}
          >
            Tạo lịch trống
          </Button>
          <Button
            secondary
            disabled={disabled || busy || destinationBusy}
            onClick={() => {
              void cancel();
            }}
          >
            Hủy tạo chuyến
          </Button>
        </div>
        <p className="text-center text-sm text-muted">Bạn có thể chỉnh lại sau.</p>
      </form>
      {!busy && !preview && (form.destinationId ?? 'da-lat') === 'da-lat' && (
        <details className="rounded-2xl bg-cream p-4 text-sm text-muted">
          <summary className="cursor-pointer font-semibold text-teal-dark">
            Dùng lịch mẫu Đà Lạt
          </summary>
          <p className="my-3">
            Lịch mẫu có 2 điểm/ngày, từ bộ địa điểm GoEase đã biên tập; không áp dụng nhịp đi hoặc
            truy vấn dữ liệu mới. Giá và giờ cần được kiểm tra trước khi đi.
          </p>
          <Button secondary disabled={disabled || destinationBusy} onClick={() => void sample()}>
            Tạo lịch mẫu Đà Lạt
          </Button>
        </details>
      )}
    </section>
  );
}

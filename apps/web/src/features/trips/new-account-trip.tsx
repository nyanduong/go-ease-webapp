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
import { Button, Notice, dateLabel } from '../../components/ui';
import { Icon } from '../../components/icon';
import { useLeaveGuard } from '../../app/router';
import { accountSession, accountTrips, useAccount } from '../account/session';
import { TripForm } from './trip-form';
import { confirmAction } from '../../platform/confirmation';
import { offlineDev } from '../../platform/dev-mode';

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
  const { catalog } = useAccount();
  const [initial] = useState(() => {
    const base = initialTripForm(new Date());
    const query = new URLSearchParams(location.search);
    const destination = getDestination(query.get('destination') ?? '');
    return {
      ...base,
      name: 'Chuyến đi của tôi',
      ...(destination
        ? { destinationId: destination.id, destination }
        : query.has('choose') || query.has('destination')
          ? { destinationId: '', destination: undefined }
          : {}),
    };
  });
  const [pace, setPace] = useState<'relaxed' | 'balanced' | 'active'>('relaxed');
  const [form, setForm] = useState(initial),
    [errors, setErrors] = useState<FormErrors>({});
  const [selectedInterests, setInterests] = useState<
    NonNullable<DiscoveryPreviewRequest['interests']>
  >([]);
  const [preview, setPreview] = useState<DiscoveryPreviewResponse | null>(null);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  const [destinationBusy, setDestinationBusy] = useState(false);
  const submitting = useRef(false);
  async function createDraft(trip: Trip) {
    if (submitting.current || disabled) return;
    submitting.current = true;
    setBusy(true);
    try {
      await onCreate(trip);
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
    if (offlineDev) return manual();
    const parsed = validate();
    if (!parsed.ok || busy || destinationBusy || disabled) return;
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
      if (!request.signal.aborted) setPreview(result);
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
    if (!parsed.ok || busy || destinationBusy || disabled) return;
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
  return (
    <section
      className="mx-auto flex w-full max-w-2xl min-w-0 flex-col gap-6"
      aria-label="Lên kế hoạch chuyến đi"
    >
      <div>
        <button type="button" className="text-action mb-4" onClick={() => void cancel()}>
          <Icon name="back" /> Tạo chuyến đi
        </button>
        <h1>Chuyến đi của bạn</h1>
      </div>
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
          disabled={disabled || busy}
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
          {!offlineDev && (
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
      {preview && (
        <section
          aria-label="Xem trước lịch trình"
          className="flex min-w-0 flex-col gap-4 border-t border-line pt-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-xl">Gợi ý cho {preview.destination.name}</h3>
            <span className="rounded-full bg-mint px-3 py-2 text-xs font-semibold text-teal-dark">
              Chưa lưu vào tài khoản
            </span>
          </div>
          <p className="text-sm text-muted">
            {preview.result.label} ·{' '}
            {preview.source === 'cache'
              ? 'Dữ liệu đã lưu tạm'
              : preview.source === 'catalog'
                ? 'Bộ địa điểm GoEase'
                : 'Nguồn địa điểm: SerpApi / Google Maps'}
          </p>
          <p className="text-sm text-muted">
            Giờ tham quan và di chuyển là ước tính. Khoản chưa biết giá được giữ trống, không tính
            là miễn phí.
          </p>
          <div className="grid gap-3 rounded-2xl bg-mint/50 p-4 sm:grid-cols-2">
            <div>
              <p className="text-xs text-muted">Ngân sách cả nhóm</p>
              <p className="mt-1 font-semibold text-teal-dark">
                {preview.result.trip.budgetVnd === null
                  ? 'Chưa đặt ngân sách'
                  : `${preview.result.trip.budgetVnd.toLocaleString('vi-VN')} đ`}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted">Chi phí đã biết</p>
              <p className="mt-1 font-semibold text-teal-dark">
                {preview.result.budget.knownCostVnd === 0 &&
                preview.result.budget.unknownCostCount > 0
                  ? 'Chưa có giá để ước tính'
                  : `${preview.result.budget.knownCostVnd.toLocaleString('vi-VN')} đ`}
              </p>
              {preview.result.budget.unknownCostCount > 0 && (
                <p className="mt-1 text-xs text-muted">
                  {preview.result.budget.unknownCostCount} hoạt động chưa có giá
                </p>
              )}
            </div>
          </div>
          {preview.result.warnings.map((warning, index) => (
            <Notice key={`${index}-${warning}`}>{warning}</Notice>
          ))}
          {!!preview.result.explanations.length && (
            <details className="rounded-2xl bg-cream p-4">
              <summary className="cursor-pointer text-sm font-semibold">
                Vì sao sắp xếp lịch như vậy?
              </summary>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-muted">
                {preview.result.explanations.map((text, index) => (
                  <li key={index}>{text}</li>
                ))}
              </ul>
            </details>
          )}
          <div className="grid min-w-0 gap-4 md:grid-cols-2">
            {preview.result.trip.days.map((day, index) => (
              <article key={day.id} className="min-w-0 rounded-2xl border border-line p-4">
                <h4 className="font-bold text-teal-dark">
                  Ngày {index + 1} · {dateLabel(day.date)}
                </h4>
                <ol className="mt-3 flex flex-col gap-3">
                  {day.activities.map((activity) => (
                    <li key={activity.id} className="text-sm">
                      <span className="mr-2 font-semibold text-teal">
                        {activity.startTime ?? 'Chưa đặt giờ'}
                      </span>
                      {activity.name}
                      {activity.location.kind === 'discovered' && (
                        <p className="mt-1 text-xs text-muted">
                          {activity.location.placeSnapshot.address || 'Chưa có địa chỉ'} ·{' '}
                          {activity.costVnd === null
                            ? 'Chưa có giá'
                            : `${activity.costVnd.toLocaleString('vi-VN')} đ`}
                        </p>
                      )}
                      {activity.location.kind === 'discovered' && preview.places.length > 1 && (
                        <label className="mt-3 text-xs text-muted">
                          Thay địa điểm
                          <select
                            aria-label={`Thay địa điểm ${activity.name}`}
                            value={activity.location.placeId}
                            onChange={(event) => replacePlace(activity.id, event.target.value)}
                          >
                            {preview.places.map((place) => (
                              <option key={place.id} value={place.id}>
                                {place.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                    </li>
                  ))}
                </ol>
                {!day.activities.length && (
                  <p className="mt-3 text-sm text-muted">
                    Chưa đủ địa điểm phù hợp. Bạn có thể tự bổ sung.
                  </p>
                )}
              </article>
            ))}
          </div>
          <Button disabled={disabled || busy} onClick={() => void createDraft(preview.result.trip)}>
            Chỉnh sửa và lưu lịch này
          </Button>
        </section>
      )}
    </section>
  );
}

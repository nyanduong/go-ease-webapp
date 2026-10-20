import {
  createTripInputSchemaFor,
  DESTINATION,
  getDestination,
  todayAtDestination,
  type CreateTripInput,
  type Destination,
} from '@goease/contracts';
import { generateSampleTrip } from '@goease/itinerary';
import type { createTripStore } from '@goease/trip-storage';

export interface TripFormValues {
  destinationId?: string;
  destination?: Destination;
  name: string;
  startDate: string;
  durationDays: string;
  people: string;
  budgetVnd: string;
}
export type TripFormField = Exclude<keyof TripFormValues, 'destination'>;
export type FormErrors = Partial<Record<TripFormField, string>>;
export function initialTripForm(now: Date): TripFormValues {
  return {
    destinationId: DESTINATION.id,
    name: '',
    startDate: todayAtDestination(now),
    durationDays: '1',
    people: '1',
    budgetVnd: '',
  };
}
const number = (text: string) => (/^\d+$/.test(text.trim()) ? Number(text.trim()) : NaN);
export function validateTripForm(
  form: TripFormValues,
  today: string,
): { ok: true; input: CreateTripInput } | { ok: false; errors: FormErrors } {
  if (form.destination && form.destination.countryCode !== 'VN')
    return {
      ok: false,
      errors: {
        destinationId:
          'GoEase hiện hỗ trợ điểm đến tại Việt Nam. Hãy tìm và chọn lại địa phương trong nước.',
      },
    };
  if (!form.destination && !getDestination(form.destinationId ?? DESTINATION.id))
    return { ok: false, errors: { destinationId: 'Tìm và chọn một điểm đến trước khi lên lịch.' } };
  const result = createTripInputSchemaFor(today).safeParse({
    name: form.name,
    destinationId: form.destinationId ?? DESTINATION.id,
    ...(form.destination ? { destination: form.destination } : {}),
    startDate: form.startDate.trim(),
    durationDays: number(form.durationDays),
    people: number(form.people),
    budgetVnd: form.budgetVnd.trim() === '' ? null : number(form.budgetVnd),
  });
  if (result.success) return { ok: true, input: result.data };
  const messages: Record<TripFormField, string> = {
    destinationId: 'Tìm và chọn một điểm đến trước khi lên lịch.',
    name: 'Nhập tên chuyến từ 1 đến 80 ký tự.',
    startDate: 'Chọn ngày từ hôm nay trở đi; chuyến đi cần kết thúc trước năm 2101.',
    durationDays: 'Chọn từ 1 đến 5 ngày, không nhập số lẻ.',
    people: 'Nhập từ 1 đến 20 người, không nhập số lẻ.',
    budgetVnd: 'Nhập ngân sách tối đa 1 tỷ đồng, chỉ gồm chữ số; hoặc để trống.',
  };
  const errors: FormErrors = {};
  result.error.issues.forEach((issue) => {
    const key =
      issue.path[0] === 'destination' ? 'destinationId' : (issue.path[0] as TripFormField);
    if (key in messages) errors[key] = messages[key];
  });
  return { ok: false, errors };
}

type Store = ReturnType<typeof createTripStore>;
export type SubmitResult =
  { ok: true; tripId: string } | { ok: false; message: string; errors?: FormErrors };
export function createTripSubmission(deps: {
  store: Store;
  getCatalog: () => unknown;
  newId: () => string;
  now: () => Date;
}) {
  let busy = false;
  let pendingId: string | null = null;
  return {
    async submit(form: TripFormValues): Promise<SubmitResult> {
      if (busy) return { ok: false, message: 'Đang tạo chuyến, hãy chờ.' };
      busy = true;
      try {
        const today = todayAtDestination(deps.now());
        const validation = validateTripForm(form, today);
        if (!validation.ok)
          return {
            ok: false,
            message: 'Kiểm tra các trường được đánh dấu.',
            errors: validation.errors,
          };
        if (deps.store.getSnapshot().loadStatus !== 'ready')
          return {
            ok: false,
            message: 'Chưa đọc được kho chuyến. Hãy tải lại trước khi tạo.',
          };
        if (deps.store.getSnapshot().issues.length)
          return {
            ok: false,
            message: 'Kho có dữ liệu lỗi, tạm chặn ghi để giữ nguyên dữ liệu.',
          };
        pendingId ??= deps.newId();
        const generated = generateSampleTrip(validation.input, deps.getCatalog(), {
          tripId: pendingId,
          today,
        });
        if (!generated.ok) return { ok: false, message: generated.message };
        const activeDraft = deps.store.getSnapshot().draft;
        if (activeDraft && (activeDraft.trip.id !== pendingId || activeDraft.baseRevision !== null))
          return {
            ok: false,
            message: 'Có draft khác chưa lưu. Quay lại xử lý draft đó trước.',
          };
        // Re-read before retry: a native write may persist and still report an error.
        if (activeDraft) {
          if (!(await deps.store.load()))
            return {
              ok: false,
              message: 'Không kiểm tra được lần lưu trước. Giữ form và thử lại sau.',
            };
          const existing = deps.store
            .getSnapshot()
            .trips.find((saved) => saved.trip.id === pendingId);
          if (existing) {
            if (JSON.stringify(existing.trip) !== JSON.stringify(generated.trip))
              return {
                ok: false,
                message:
                  'Lần trước đã lưu chuyến với nội dung khác. Quay về danh sách để kiểm tra.',
              };
            deps.store.cancelDraft();
            return { ok: true, tripId: pendingId };
          }
          deps.store.changeDraft(generated.trip);
        } else deps.store.beginNew(generated.trip);
        if (!(await deps.store.saveDraft()))
          return {
            ok: false,
            message:
              deps.store.getSnapshot().writeError?.message ??
              'Chưa lưu được. Nội dung nhập vẫn được giữ để thử lại.',
          };
        return { ok: true, tripId: pendingId };
      } catch {
        return {
          ok: false,
          message: 'Không tạo được chuyến. Nội dung nhập vẫn được giữ; hãy thử lại.',
        };
      } finally {
        busy = false;
      }
    },
    discard() {
      if (busy) return false;
      if (pendingId !== null && deps.store.getSnapshot().draft?.trip.id === pendingId)
        deps.store.cancelDraft();
      pendingId = null;
      return true;
    },
  };
}

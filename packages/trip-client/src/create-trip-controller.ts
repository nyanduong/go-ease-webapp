import {
  createTripInputSchemaFor,
  DESTINATION,
  todayAtDestination,
  type CreateTripInput,
} from '@goease/contracts';
import { generateSampleTrip } from '@goease/itinerary';
import type { createTripStore } from '@goease/trip-storage';

export interface TripFormValues {
  name: string;
  startDate: string;
  durationDays: string;
  people: string;
  budgetVnd: string;
}
export type FormErrors = Partial<Record<keyof TripFormValues, string>>;
export function initialTripForm(now: Date): TripFormValues {
  return {
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
  const result = createTripInputSchemaFor(today).safeParse({
    name: form.name,
    destinationId: DESTINATION.id,
    startDate: form.startDate.trim(),
    durationDays: number(form.durationDays),
    people: number(form.people),
    budgetVnd: form.budgetVnd.trim() === '' ? null : number(form.budgetVnd),
  });
  if (result.success) return { ok: true, input: result.data };
  const messages: Record<keyof TripFormValues, string> = {
    name: 'Nhập tên chuyến từ 1 đến 80 ký tự.',
    startDate: 'Nhập ngày có thật dạng YYYY-MM-DD, từ hôm nay; ngày cuối không quá năm 2100.',
    durationDays: 'Số ngày phải là số nguyên từ 1 đến 5.',
    people: 'Số người phải là số nguyên từ 1 đến 20.',
    budgetVnd:
      'Nhập số nguyên VND từ 0 đến 1.000.000.000, không dùng dấu phân cách; hoặc để trống.',
  };
  const errors: FormErrors = {};
  result.error.issues.forEach((issue) => {
    const key = issue.path[0] as keyof TripFormValues;
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

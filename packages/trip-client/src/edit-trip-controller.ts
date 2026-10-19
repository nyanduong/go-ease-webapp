import {
  activitySchema,
  moveActivity,
  tripSchema,
  type Activity,
  type Place,
  type Trip,
} from '@goease/contracts';
import type { createTripStore, SavedTrip } from '@goease/trip-storage';

export interface ActivityForm {
  kind: 'catalog' | 'custom';
  placeId: string;
  name: string;
  startTime: string;
  endTime: string;
  costVnd: string;
  notes: string;
}
export type ActivityErrors = Partial<Record<keyof ActivityForm, string>>;
export function activityForm(activity?: Activity): ActivityForm {
  return {
    kind: activity?.location.kind ?? 'custom',
    placeId: activity?.location.kind === 'catalog' ? activity.location.placeId : '',
    name: activity?.name ?? '',
    startTime: activity?.startTime ?? '',
    endTime: activity?.endTime ?? '',
    costVnd:
      activity?.costVnd === null || activity?.costVnd === undefined ? '' : String(activity.costVnd),
    notes: activity?.notes ?? '',
  };
}
export function parseActivityForm(
  form: ActivityForm,
  id: string,
  places: Place[],
): { ok: true; activity: Activity } | { ok: false; errors: ActivityErrors } {
  const errors: ActivityErrors = {};
  const place = places.find((item) => item.id === form.placeId);
  if (form.kind === 'catalog' && !place) errors.placeId = 'Chọn một địa điểm trong danh mục.';
  const cost = form.costVnd.trim();
  const result = activitySchema.safeParse({
    id,
    name: form.name,
    location:
      form.kind === 'catalog' ? { kind: 'catalog', placeId: form.placeId } : { kind: 'custom' },
    startTime: form.startTime.trim() || null,
    endTime: form.endTime.trim() || null,
    costVnd: cost === '' ? null : /^\d+$/.test(cost) ? Number(cost) : NaN,
    notes: form.notes,
  });
  if (!result.success) {
    const messages: ActivityErrors = {
      name: 'Tên hoạt động từ 1 đến 120 ký tự.',
      startTime: 'Nhập giờ HH:mm (00:00–23:59).',
      endTime: 'Nhập đủ cặp giờ HH:mm; giờ kết thúc phải sau bắt đầu trong cùng ngày.',
      costVnd: 'Nhập số nguyên 0–100.000.000 VND, không có dấu phân cách; hoặc để trống.',
      notes: 'Ghi chú tối đa 500 ký tự.',
    };
    result.error.issues.forEach((issue) => {
      const key = issue.path[0] as keyof ActivityForm;
      errors[key] = messages[key] ?? 'Giá trị không hợp lệ.';
    });
  }
  if (Object.keys(errors).length || !result.success) return { ok: false, errors };
  return { ok: true, activity: result.data };
}
export function putActivity(
  input: Trip,
  dayId: string,
  activity: Activity,
  editingId?: string,
): Trip {
  const trip = tripSchema.parse(input),
    day = trip.days.find((item) => item.id === dayId);
  if (!day) throw Error('Không tìm thấy ngày.');
  if (editingId) {
    const index = day.activities.findIndex((item) => item.id === editingId);
    if (index < 0 || activity.id !== editingId)
      throw Error('Không tìm thấy hoạt động; không đổi ID khi sửa.');
    day.activities[index] = activity;
  } else day.activities.push(activity);
  return tripSchema.parse(trip);
}
export function removeActivity(input: Trip, activityId: string): Trip {
  const trip = tripSchema.parse(input);
  const day = trip.days.find((item) =>
    item.activities.some((activity) => activity.id === activityId),
  );
  if (!day) throw Error('Không tìm thấy hoạt động.');
  day.activities = day.activities.filter((activity) => activity.id !== activityId);
  return tripSchema.parse(trip);
}
export { moveActivity };

// Own one editor session; never discard another screen's draft or bypass revisions.
export function createTripEditor(store: ReturnType<typeof createTripStore>) {
  let original: { trip: Trip; revision: number | null } | null = null,
    attempted: Trip | null = null,
    busy = false;
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  const ownDraft = () => {
    const draft = store.getSnapshot().draft;
    return original &&
      draft?.trip.id === original.trip.id &&
      draft.baseRevision === original.revision
      ? draft
      : null;
  };
  return {
    begin(saved: SavedTrip) {
      store.beginEdit(saved);
      original = saved;
      attempted = null;
    },
    adoptNew(id: string) {
      const draft = store.getSnapshot().draft;
      if (original) return original.revision === null && ownDraft()?.trip.id === id;
      if (!draft || draft.baseRevision !== null || draft.trip.id !== id) return false;
      original = { trip: draft.trip, revision: null };
      attempted = null;
      return true;
    },
    owns: () => ownDraft() !== null,
    dirty: () =>
      !!original &&
      !!ownDraft() &&
      (original.revision === null || !same(original.trip, ownDraft()!.trip)),
    change(trip: Trip) {
      if (!ownDraft()) throw Error('Phiên chỉnh sửa không còn.');
      store.changeDraft(trip);
    },
    cancel() {
      if (busy) return false;
      try {
        if (ownDraft()) store.cancelDraft();
      } catch {
        return false;
      }
      original = null;
      attempted = null;
      return true;
    },
    async save(): Promise<{ ok: boolean; message: string }> {
      if (busy || !original || !ownDraft())
        return { ok: false, message: 'Chưa có phiên chỉnh sửa hoặc đang lưu.' };
      busy = true;
      try {
        const draft = ownDraft()!;
        if (!(await store.load()))
          return {
            ok: false,
            message: 'Không đọc được kho chuyến. Draft vẫn giữ, hãy thử lưu lại.',
          };
        const snapshot = store.getSnapshot();
        if (!ownDraft() || !same(ownDraft()!.trip, draft.trip))
          return {
            ok: false,
            message: 'Draft đã đổi trong lúc kiểm tra lần lưu trước; chưa ghi thêm.',
          };
        if (snapshot.issues.length)
          return {
            ok: false,
            message: 'Kho có dữ liệu lỗi; giữ draft và tạm chặn ghi.',
          };
        const latest = snapshot.trips.find((item) => item.trip.id === original!.trip.id);
        if (original.revision === null) {
          if (latest) {
            if (
              attempted &&
              latest.revision === 1 &&
              same(latest.trip, attempted) &&
              same(draft.trip, attempted)
            ) {
              store.cancelDraft();
              original = null;
              attempted = null;
              return { ok: true, message: 'Đã lưu chuyến mới.' };
            }
            return {
              ok: false,
              message: 'ID chuyến mới đã có trên máy; không ghi đè. Draft vẫn giữ.',
            };
          }
          attempted = draft.trip;
          if (!(await store.saveDraft()))
            return {
              ok: false,
              message: 'Chưa xác nhận lưu chuyến mới. Giữ draft để thử lưu lại.',
            };
          original = null;
          attempted = null;
          return { ok: true, message: 'Đã lưu chuyến mới.' };
        }
        if (!latest)
          return {
            ok: false,
            message: 'Chuyến đã bị xóa. Draft vẫn giữ; Hủy chỉnh sửa để quay về danh sách.',
          };
        if (latest.revision !== original.revision) {
          if (
            attempted &&
            latest.revision === original.revision + 1 &&
            same(latest.trip, attempted) &&
            same(draft.trip, attempted)
          ) {
            store.cancelDraft();
            original = null;
            attempted = null;
            return { ok: true, message: 'Đã lưu chuyến.' };
          }
          return {
            ok: false,
            message:
              'Chuyến đã thay đổi ở lần ghi khác. Không ghi đè; giữ draft để đối chiếu hoặc Hủy chỉnh sửa và mở lại.',
          };
        }
        attempted = draft.trip;
        if (!(await store.saveDraft()))
          return {
            ok: false,
            message:
              store.getSnapshot().writeError?.message ?? 'Chưa lưu được. Draft vẫn được giữ.',
          };
        original = null;
        attempted = null;
        return { ok: true, message: 'Đã lưu chuyến.' };
      } catch {
        return {
          ok: false,
          message: 'Chưa lưu được. Draft vẫn được giữ; hãy thử lại.',
        };
      } finally {
        busy = false;
      }
    },
  };
}

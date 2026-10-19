import {
  AI_LABEL,
  aiItineraryResponseSchema,
  catalogEntriesSchema,
  createTripInputSchemaFor,
  findTimeOverlaps,
  todayAtDestination,
  tripSchema,
  tripSchemaWithCatalog,
  type AiItineraryResponse,
  type CreateTripInput,
  type Trip,
} from '@goease/contracts';
import { catalogGroupCostVnd } from '@goease/itinerary';
import type { createTripStore } from '@goease/trip-storage';

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
export function aiTripInput(trip: Trip): CreateTripInput {
  return {
    name: trip.name,
    destinationId: trip.destinationId,
    startDate: trip.startDate,
    durationDays: trip.durationDays,
    people: trip.people,
    budgetVnd: trip.budgetVnd,
  };
}
export function tripSourceLabel(trip: Trip) {
  return trip.generationSource === 'ai'
    ? `${AI_LABEL} Nội dung có thể đã được nhóm chỉnh sửa.`
    : trip.generationSource === 'sample'
      ? 'Lịch trình mẫu local — hãy kiểm tra giờ mở cửa và giá trước khi đi.'
      : 'Chuyến cũ chưa ghi nguồn lịch trình; hãy kiểm tra thông tin trước khi đi.';
}
export function validateAiProposal(
  raw: unknown,
  input: CreateTripInput,
  catalogInput: unknown,
): AiItineraryResponse {
  const response = aiItineraryResponseSchema.parse(raw),
    catalog = catalogEntriesSchema.parse(catalogInput);
  const places = catalog.map(({ id, name, destinationId, coordinates, sources }) => ({
    id,
    name,
    destinationId,
    coordinates,
    sources,
  }));
  tripSchemaWithCatalog(places).parse(response.trip);
  if (!same(aiTripInput(response.trip), input)) throw Error('AI không khớp nhu cầu đã gửi.');
  const seen = new Set<string>();
  for (const day of response.trip.days) {
    if (day.activities.length < 1 || day.activities.length > 3 || findTimeOverlaps(day).length)
      throw Error('AI sai hoạt động/giờ.');
    for (const [index, activity] of day.activities.entries()) {
      const id = activity.location.kind === 'catalog' ? activity.location.placeId : '';
      const place = catalog.find((entry) => entry.id === id);
      if (
        !place ||
        seen.has(id) ||
        activity.startTime === null ||
        activity.endTime === null ||
        activity.endTime <= activity.startTime ||
        (index > 0 && (day.activities[index - 1]?.endTime ?? '') > activity.startTime) ||
        activity.costVnd !== catalogGroupCostVnd(place, input.people)
      )
        throw Error('AI sai catalog/giờ/chi phí.');
      seen.add(id);
    }
  }
  return {
    ...response,
    trip: tripSchema.parse({ ...response.trip, generationSource: 'ai' }),
  };
}

export function createAiTripFlow(deps: {
  store: ReturnType<typeof createTripStore>;
  getCatalog: () => unknown;
  newId: () => string;
  now: () => Date;
  request: (input: CreateTripInput, signal: AbortSignal, code: string) => Promise<unknown>;
}) {
  let proposal: AiItineraryResponse | null = null,
    target: Trip | null = null,
    controller: AbortController | null = null;
  let targetRevision: number | null = null;
  let saving = false,
    pendingId: string | null = null;
  const owns = () =>
    pendingId !== null &&
    deps.store.getSnapshot().draft?.trip.id === pendingId &&
    deps.store.getSnapshot().draft?.baseRevision === null;
  return {
    preview: () => proposal,
    busy: () => controller !== null || saving,
    cancelRequest() {
      const previous = controller;
      controller = null;
      previous?.abort();
    },
    async generate(
      input: CreateTripInput,
      code: string,
      existing: Trip | null = null,
      confirmedReplacement = false,
    ): Promise<{ ok: boolean; message: string }> {
      if (controller || saving) return { ok: false, message: 'Đang xử lý AI, hãy chờ.' };
      if (owns())
        return {
          ok: false,
          message: 'Có lần lưu chưa rõ kết quả. Thử lưu lại hoặc bỏ kết quả trước khi gọi AI mới.',
        };
      if (proposal && !confirmedReplacement)
        return {
          ok: false,
          message: 'Xác nhận trước khi thay đề xuất đang xem.',
        };
      const validation = createTripInputSchemaFor(todayAtDestination(deps.now())).safeParse(input);
      if (!validation.success)
        return {
          ok: false,
          message: 'Nhu cầu AI không hợp lệ; ngày bắt đầu phải từ hôm nay.',
        };
      const snapshot = deps.store.getSnapshot();
      if (
        snapshot.loadStatus !== 'ready' ||
        snapshot.issues.length ||
        snapshot.writeStatus === 'saving' ||
        snapshot.writeStatus === 'deleting'
      )
        return {
          ok: false,
          message: 'Kho chuyến chưa sẵn sàng; nội dung hiện tại vẫn giữ.',
        };
      if (snapshot.draft && (!existing || !same(snapshot.draft.trip, existing)))
        return {
          ok: false,
          message: 'Có draft khác chưa xử lý. Lưu hoặc hủy draft đó trước.',
        };
      if (existing && (!snapshot.draft || !same(snapshot.draft.trip, existing)))
        return { ok: false, message: 'Phiên draft không còn; không gọi AI.' };
      const revision = snapshot.draft?.baseRevision ?? null;
      const current = new AbortController();
      controller = current;
      try {
        const raw = await deps.request(validation.data, current.signal, code);
        if (controller !== current || current.signal.aborted)
          return {
            ok: false,
            message: 'Đã hủy; giữ nguyên nội dung hiện tại.',
          };
        const checked = validateAiProposal(raw, validation.data, deps.getCatalog());
        proposal = checked;
        target = existing ? tripSchema.parse(existing) : null;
        targetRevision = revision;
        pendingId = existing ? null : deps.newId();
        return {
          ok: true,
          message: 'Đã nhận đề xuất AI. Xem trước; chưa thay draft hoặc lưu chuyến.',
        };
      } catch {
        return {
          ok: false,
          message: current.signal.aborted
            ? 'Đã hủy; giữ nguyên nội dung hiện tại.'
            : 'Không nhận được đề xuất AI hợp lệ (mạng, quyền/quota hoặc dữ liệu). Input/draft và đề xuất trước vẫn giữ; chỉ thử lại khi bạn bấm, không chuyển sang mẫu.',
        };
      } finally {
        if (controller === current) controller = null;
      }
    },
    applyExisting(current: Trip, confirmed: boolean): Trip {
      const actual = deps.store.getSnapshot().draft;
      if (
        controller ||
        saving ||
        !proposal ||
        !target ||
        !confirmed ||
        !same(target, current) ||
        !actual ||
        actual.baseRevision !== targetRevision ||
        !same(actual.trip, target)
      )
        throw Error('Draft đã đổi hoặc chưa xác nhận; không thay nội dung.');
      return tripSchema.parse({ ...proposal.trip, id: current.id });
    },
    discard() {
      if (controller || saving) return false;
      try {
        if (owns()) deps.store.cancelDraft();
      } catch {
        return false;
      }
      proposal = null;
      target = null;
      pendingId = null;
      return true;
    },
    stageNew(): string {
      const state = deps.store.getSnapshot();
      if (
        controller ||
        saving ||
        !proposal ||
        target ||
        !pendingId ||
        state.draft ||
        state.loadStatus !== 'ready' ||
        state.issues.length
      )
        throw Error('Chưa thể chuyển đề xuất vào editor. Thử lưu lại/bỏ draft đang có trước.');
      const id = pendingId;
      deps.store.beginNew({ ...proposal.trip, id });
      proposal = null;
      pendingId = null;
      target = null;
      return id;
    },
    async saveNew(): Promise<{
      ok: boolean;
      message: string;
      tripId?: string;
    }> {
      if (controller || saving || !proposal || target || !pendingId)
        return {
          ok: false,
          message: 'Chưa có đề xuất AI mới để lưu hoặc đang xử lý.',
        };
      saving = true;
      try {
        const trip = tripSchema.parse({ ...proposal.trip, id: pendingId });
        const before = deps.store.getSnapshot();
        if (before.draft && !owns()) return { ok: false, message: 'Có draft khác, không ghi đè.' };
        if (!(await deps.store.load()) || deps.store.getSnapshot().issues.length)
          return {
            ok: false,
            message: 'Chưa đọc được kho hợp lệ; đề xuất vẫn giữ để thử lưu lại.',
          };
        const latestDraft = deps.store.getSnapshot().draft;
        if (latestDraft && (!owns() || !same(latestDraft.trip, trip)))
          return {
            ok: false,
            message: 'Draft đã đổi ở màn khác; không ghi đè.',
          };
        const existing = deps.store
          .getSnapshot()
          .trips.find((saved) => saved.trip.id === pendingId);
        if (existing) {
          if (!same(existing.trip, trip))
            return {
              ok: false,
              message: 'ID chuyến đã có nội dung khác; không ghi đè.',
            };
          if (owns()) deps.store.cancelDraft();
        } else {
          if (!owns()) deps.store.beginNew(trip);
          if (!(await deps.store.saveDraft()))
            return {
              ok: false,
              message:
                'Chưa xác nhận lưu được. Đề xuất/draft vẫn giữ; Thử lưu lại không gọi Gemini thêm.',
            };
        }
        const tripId = pendingId;
        proposal = null;
        target = null;
        pendingId = null;
        return { ok: true, tripId, message: 'Đã lưu chuyến AI trên thiết bị.' };
      } catch {
        return {
          ok: false,
          message: 'Chưa lưu được. Giữ đề xuất/draft để thử lưu lại, không gọi Gemini thêm.',
        };
      } finally {
        saving = false;
      }
    },
  };
}

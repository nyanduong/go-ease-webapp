import type { Trip } from '@goease/contracts';
import { budgetView } from '@goease/trip-client/budget-controller';

export function budgetPresentation(trip: Trip) {
  const model = budgetView(trip);
  const totalCount = trip.days.reduce((count, day) => count + day.activities.length, 0);
  const knownCount = totalCount - model.summary.unknownCostCount;
  const phase = !totalCount
    ? 'empty'
    : !knownCount
      ? 'unknown'
      : model.summary.unknownCostCount
        ? 'partial'
        : 'complete';
  return {
    ...model,
    totalCount,
    knownCount,
    phase,
    headline:
      phase === 'empty'
        ? 'Chưa có hoạt động'
        : phase === 'unknown'
          ? 'Chưa đủ dữ liệu để dự toán'
          : model.knownText,
    label:
      phase === 'complete' ? 'Tổng chi phí ước tính · cả nhóm' : 'Tổng các khoản đã nhập · cả nhóm',
    progress: `${knownCount} / ${totalCount} hoạt động đã có chi phí`,
  };
}

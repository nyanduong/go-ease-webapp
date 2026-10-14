import { tripSchema, tripDaySchema, type Trip } from './schemas.js';

/** Accept unknown so storage/API callers cannot bypass validation with a TS cast. */
export function summarizeBudget(input: unknown) {
  const trip = tripSchema.parse(input);
  const days = trip.days.map((day) => ({
    dayId: day.id,
    knownCostVnd: day.activities.reduce((sum, activity) => sum + (activity.costVnd ?? 0), 0),
    unknownCostCount: day.activities.filter((activity) => activity.costVnd === null).length,
  }));
  const knownCostVnd = days.reduce((sum, day) => sum + day.knownCostVnd, 0);
  const unknownCostCount = days.reduce((sum, day) => sum + day.unknownCostCount, 0);
  const remainingVnd = trip.budgetVnd === null ? null : trip.budgetVnd - knownCostVnd;
  return {
    days, knownCostVnd, unknownCostCount, isComplete: unknownCostCount === 0,
    budgetVnd: trip.budgetVnd, remainingVnd,
    overBudgetVnd: remainingVnd === null ? null : Math.max(0, -remainingVnd),
  };
}

/** Warnings only; touching boundaries and activities without hours do not overlap. */
export function findTimeOverlaps(input: unknown) {
  const day = tripDaySchema.parse(input);
  const pairs: { activityIds: [string, string] }[] = [];
  day.activities.forEach((first, index) => {
    const { startTime, endTime } = first;
    if (startTime === null || endTime === null) return;
    day.activities.slice(index + 1).forEach((second) => {
      if (second.startTime !== null && second.endTime !== null
        && startTime < second.endTime && second.startTime < endTime) {
        pairs.push({ activityIds: [first.id, second.id] });
      }
    });
  });
  return pairs;
}

/** Returns a validated copy. Moving within the same day uses a zero-based position. */
export function moveActivity(input: unknown, activityId: string, targetDayId: string, position?: number): Trip {
  const trip = tripSchema.parse(input);
  const source = trip.days.find((day) => day.activities.some((activity) => activity.id === activityId));
  const target = trip.days.find((day) => day.id === targetDayId);
  if (!source || !target) throw new RangeError('Không tìm thấy hoạt động hoặc ngày đích');
  const sourceIndex = source.activities.findIndex((activity) => activity.id === activityId);
  if (position !== undefined && !Number.isInteger(position)) throw new RangeError('Vị trí phải là số nguyên');
  if (source !== target && position !== undefined) throw new RangeError('Chuyển ngày luôn đưa xuống cuối ngày đích');
  const targetPosition = position ?? (source === target ? target.activities.length - 1 : target.activities.length);
  const maxPosition = source === target ? target.activities.length - 1 : target.activities.length;
  if (!Number.isInteger(targetPosition) || targetPosition < 0 || targetPosition > maxPosition) throw new RangeError('Vị trí không hợp lệ');
  const [activity] = source.activities.splice(sourceIndex, 1);
  if (!activity) throw new RangeError('Không tìm thấy hoạt động');
  target.activities.splice(targetPosition, 0, activity);
  return tripSchema.parse(trip);
}

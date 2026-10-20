import { summarizeBudget, tripSchema, type Trip } from '@goease/contracts';

const vnd = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 });
export function formatVnd(value: number): string {
  if (!Number.isSafeInteger(value) || Math.abs(value) > 1_000_000_000)
    throw new RangeError('Tiền vượt giới hạn hoặc không phải số nguyên VND.');
  return `${vnd.format(value)} đ`;
}
export function budgetView(input: unknown) {
  const trip = tripSchema.parse(input),
    summary = summarizeBudget(trip);
  const completeness = (unknown: number, count: number) =>
    unknown > 0
      ? `Còn ${unknown} khoản chưa có giá; tổng chưa đầy đủ.`
      : count === 0
        ? 'Thêm hoạt động để bắt đầu tính chi phí.'
        : 'Đã đủ chi phí ước tính. Giá thực tế có thể thay đổi.';
  let difference: string;
  if (summary.remainingVnd === null) difference = 'Bạn chưa đặt ngân sách cho chuyến đi.';
  else if (summary.remainingVnd < 0)
    difference = `Các khoản đã nhập vượt ngân sách ${formatVnd(-summary.remainingVnd)}.`;
  else if (summary.remainingVnd === 0) difference = 'Các khoản đã nhập bằng ngân sách nhóm.';
  else difference = `Còn lại sau các khoản đã nhập: ${formatVnd(summary.remainingVnd)}.`;
  return {
    summary,
    budgetText: summary.budgetVnd === null ? 'Chưa đặt' : formatVnd(summary.budgetVnd),
    knownText: formatVnd(summary.knownCostVnd),
    difference,
    warning: (summary.overBudgetVnd ?? 0) > 0,
    completeness: completeness(
      summary.unknownCostCount,
      trip.days.reduce((count, day) => count + day.activities.length, 0),
    ),
    days: summary.days.map((day, index) => ({
      ...day,
      date: trip.days[index]!.date,
      knownText: formatVnd(day.knownCostVnd),
      completeness: completeness(day.unknownCostCount, trip.days[index]!.activities.length),
    })),
  };
}
export interface GroupForm {
  people: string;
  budgetVnd: string;
}
export type GroupErrors = Partial<Record<keyof GroupForm, string>>;
export function groupForm(trip: Trip): GroupForm {
  return {
    people: String(trip.people),
    budgetVnd: trip.budgetVnd === null ? '' : String(trip.budgetVnd),
  };
}
export function parseGroupForm(
  input: Trip,
  form: GroupForm,
): { ok: true; trip: Trip } | { ok: false; errors: GroupErrors } {
  const integer = (text: string) => (/^\d+$/.test(text.trim()) ? Number(text.trim()) : NaN);
  const result = tripSchema.safeParse({
    ...input,
    people: integer(form.people),
    budgetVnd: form.budgetVnd.trim() === '' ? null : integer(form.budgetVnd),
  });
  if (result.success) return { ok: true, trip: result.data };
  const errors: GroupErrors = {};
  result.error.issues.forEach((issue) => {
    if (issue.path[0] === 'people') errors.people = 'Nhập từ 1 đến 20 người, không nhập số lẻ.';
    if (issue.path[0] === 'budgetVnd')
      errors.budgetVnd = 'Nhập ngân sách tối đa 1 tỷ đồng, chỉ gồm chữ số; hoặc để trống.';
  });
  return { ok: false, errors };
}

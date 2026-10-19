import type { Trip } from '@goease/contracts';
import { budgetView } from '@goease/trip-client/budget-controller';
import { Button, dateLabel } from '../../components/ui';

export function TripOverview({
  trip,
  disabled,
  onBudget,
}: {
  trip: Trip;
  disabled: boolean;
  onBudget: () => void;
}) {
  const budget = budgetView(trip);
  return (
    <aside
      aria-label="Tóm tắt chuyến đi"
      className="hidden self-start xl:sticky xl:top-28 xl:flex xl:flex-col xl:gap-4"
    >
      <div className="rounded-3xl border border-line bg-paper p-5">
        <span className="text-xs font-bold tracking-widest text-muted uppercase">
          Cả hành trình trong tầm tay
        </span>
        <h2 className="mt-3 text-xl">Đà Lạt cùng nhau</h2>
        <dl className="mt-5 flex flex-col gap-4 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Khởi hành</dt>
            <dd className="font-semibold">{dateLabel(trip.startDate)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Thời gian</dt>
            <dd className="font-semibold">{trip.durationDays} ngày</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Nhóm bạn</dt>
            <dd className="font-semibold">{trip.people} người</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Điểm dừng & hoạt động</dt>
            <dd className="font-semibold">
              {trip.days.reduce((count, day) => count + day.activities.length, 0)}
            </dd>
          </div>
        </dl>
      </div>
      <div className="flex flex-col gap-3 rounded-3xl bg-sand p-5">
        <span className="text-xs font-bold tracking-widest text-amber-900 uppercase">
          Ngân sách nhóm
        </span>
        <strong className="text-2xl text-teal-dark">{budget.budgetText}</strong>
        <p className="text-xs leading-relaxed text-amber-900">
          {budget.summary.unknownCostCount > 0
            ? `${budget.summary.unknownCostCount} hoạt động chưa cập nhật chi phí.`
            : 'Chi phí đã nhập đầy đủ; hãy kiểm tra giá trước khi đi.'}
        </p>
        <Button secondary disabled={disabled} onClick={onBudget}>
          Xem ngân sách chi tiết →
        </Button>
      </div>
      <p className="px-2 text-xs leading-relaxed text-muted">
        Giờ, giá và thời gian di chuyển cần được kiểm tra lại trước chuyến đi.
      </p>
    </aside>
  );
}

import type { Trip } from '@goease/contracts';
import { Button, dateLabel } from '../../components/ui';
import { budgetPresentation } from './budget-presentation';

export function BudgetSummary({
  trip,
  compact = false,
  onBudget,
  disabled = false,
}: {
  trip: Trip;
  compact?: boolean;
  onBudget?: () => void;
  disabled?: boolean;
}) {
  const model = budgetPresentation(trip);
  if (compact)
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={onBudget}
        className="flex w-full min-w-0 items-center justify-between gap-3 rounded-2xl border border-line bg-sand p-4 text-left text-teal-dark"
      >
        <span className="min-w-0">
          <span className="block text-xs font-bold tracking-wider uppercase">
            Ngân sách nhóm · {model.budgetText}
          </span>
          <strong className="mt-1 block text-sm">{model.headline}</strong>
          <small className="mt-1 block">{model.progress}</small>
        </span>
        <span aria-hidden="true">→</span>
      </button>
    );
  return (
    <div className="overflow-hidden rounded-3xl border border-line bg-paper">
      <div className="flex flex-col gap-2 bg-sand p-5">
        <span className="text-xs font-bold tracking-widest text-amber-900 uppercase">
          Ngân sách chuyến đi
        </span>
        <strong className="text-2xl text-teal-dark">{model.headline}</strong>
        <p className="text-xs text-amber-900">
          {model.phase === 'unknown'
            ? `${model.summary.unknownCostCount} hoạt động chưa có giá`
            : model.label}
        </p>
      </div>
      <div className="flex flex-col gap-4 p-5 text-sm">
        <div>
          <p className="text-xs text-muted">Ngân sách đặt ra · cả nhóm</p>
          <b className="mt-1 block text-lg text-ink">{model.budgetText}</b>
        </div>
        <p className="border-t border-line pt-4 text-xs font-semibold text-teal-dark">
          {model.progress}
        </p>
        {model.warning ? (
          <p className="text-xs text-error">{model.difference}</p>
        ) : model.phase === 'complete' ? (
          <p className="text-xs text-muted">{model.difference}</p>
        ) : (
          <p className="text-xs leading-relaxed text-muted">
            Tổng này chưa gồm các hoạt động chưa có giá.
          </p>
        )}
        {onBudget && (
          <Button secondary disabled={disabled} onClick={onBudget}>
            Xem ngân sách chi tiết →
          </Button>
        )}
      </div>
    </div>
  );
}

export function Budget({
  trip,
  onEditCost,
  disabled = false,
}: {
  trip: Trip;
  onEditCost: (activityId: string, dayId: string) => void;
  disabled?: boolean;
}) {
  const model = budgetPresentation(trip);
  return (
    <section className="flex min-w-0 flex-col gap-5" aria-label="Ngân sách chuyến đi">
      <div className="flex flex-col gap-3 rounded-3xl bg-sand p-6">
        <span className="text-xs font-bold tracking-widest text-amber-900 uppercase">
          {model.label}
        </span>
        <strong className="text-3xl text-teal-dark">{model.headline}</strong>
        <p>{model.completeness}</p>
      </div>
      <div className="rounded-3xl border border-line bg-paper p-5 sm:p-6">
        <h3>Ngân sách đặt ra: {model.budgetText}</h3>
        <p className={model.warning ? 'text-error' : 'text-muted'}>
          {model.warning || model.phase === 'complete'
            ? model.difference
            : 'Bổ sung chi phí còn thiếu để biết ngân sách có đủ không.'}
        </p>
      </div>
      {model.summary.unknownCostCount > 0 && (
        <div className="rounded-3xl border border-line bg-paper p-5">
          <h3>Bổ sung chi phí còn thiếu</h3>
          <ul className="mt-4 divide-y divide-line">
            {trip.days.flatMap((day, index) =>
              day.activities
                .filter((activity) => activity.costVnd === null)
                .map((activity) => (
                  <li
                    key={activity.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-3"
                  >
                    <span className="min-w-0 flex-1 text-sm">
                      <small className="block">Ngày {index + 1}</small>
                      {activity.name}
                    </span>
                    <Button
                      secondary
                      disabled={disabled}
                      aria-label={`Bổ sung chi phí: ${activity.name}`}
                      onClick={() => onEditCost(activity.id, day.id)}
                    >
                      Nhập chi phí
                    </Button>
                  </li>
                )),
            )}
          </ul>
        </div>
      )}
      <div className="grid min-w-0 gap-4 md:grid-cols-2">
        {model.days.map((day) => (
          <div key={day.dayId} className="rounded-3xl border border-line bg-paper p-5">
            <h3>{dateLabel(day.date)}</h3>
            <b>
              {day.unknownCostCount ===
                trip.days.find((item) => item.id === day.dayId)!.activities.length &&
              day.unknownCostCount > 0
                ? 'Chưa có chi phí đã nhập'
                : day.knownText}
            </b>
            <p className="mt-2 text-xs text-muted">{day.completeness}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

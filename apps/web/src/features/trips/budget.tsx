import type { Trip } from '@goease/contracts';
import { Icon } from '../../components/icon';
import { Button, Notice } from '../../components/ui';
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
  onBudget,
  onAdd,
  disabled = false,
}: {
  trip: Trip;
  onEditCost: (activityId: string, dayId: string) => void;
  onBudget: () => void;
  onAdd: () => void;
  disabled?: boolean;
}) {
  const model = budgetPresentation(trip);
  return (
    <section className="flex min-w-0 flex-col gap-4" aria-label="Chi phí chuyến đi">
      <div className="flex items-start justify-between gap-3 rounded-2xl bg-sand p-5 sm:p-7">
        <div className="min-w-0">
          <p className="text-base text-muted">Ngân sách cả nhóm</p>
          <strong className="mt-2 block text-3xl tracking-tight sm:text-4xl">
            {model.budgetText}
          </strong>
          <p className="mt-2 text-sm text-muted">
            {trip.people} người · {trip.durationDays} ngày
          </p>
        </div>
        <Button secondary disabled={disabled} onClick={onBudget} aria-label="Sửa ngân sách">
          Sửa
        </Button>
      </div>
      <div className="surface overflow-hidden px-5 sm:px-7">
        <div className="border-b border-line py-5">
          <p className="text-base text-muted">Các khoản đã có giá · cả nhóm</p>
          <strong className="mt-1 block text-3xl">
            {model.phase === 'empty'
              ? 'Chưa có khoản chi'
              : model.phase === 'unknown'
                ? 'Chưa có giá'
                : model.knownText}
          </strong>
          <p className="mt-2 text-sm text-muted">{model.progress}</p>
        </div>
        <ul className="divide-y divide-line">
          {trip.days.flatMap((day, index) =>
            day.activities.map((activity) => (
              <li key={activity.id}>
                <button
                  type="button"
                  disabled={disabled}
                  className="flex min-h-20 w-full items-center gap-3 py-4 text-left"
                  aria-label={`Sửa chi phí: ${activity.name}`}
                  onClick={() => onEditCost(activity.id, day.id)}
                >
                  <Icon name="file" className="shrink-0 text-muted" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-muted">Ngày {index + 1}</span>
                    <span className="block break-words">{activity.name}</span>
                  </span>
                  <span
                    className={`shrink-0 text-sm sm:text-base ${activity.costVnd === null ? 'text-muted' : 'font-medium'}`}
                  >
                    {activity.costVnd === null
                      ? 'Chưa rõ'
                      : activity.costVnd === 0
                        ? 'Miễn phí'
                        : `${activity.costVnd.toLocaleString('vi-VN')} đ`}
                  </span>
                  <Icon name="chevron" className="shrink-0 text-muted" width="16" />
                </button>
              </li>
            )),
          )}
        </ul>
      </div>
      {model.summary.unknownCostCount > 0 && (
        <Notice>
          <div className="flex items-start gap-3">
            <Icon name="info" className="mt-1 shrink-0" />
            <div>
              <p className="font-semibold">
                Còn {model.summary.unknownCostCount} khoản chưa có giá
              </p>
              <p>Chưa đủ thông tin để tính tổng chuyến đi. Chọn từng khoản để bổ sung.</p>
            </div>
          </div>
        </Notice>
      )}
      {model.phase === 'complete' && (
        <p className={model.warning ? 'text-error' : 'text-muted'}>
          {model.difference} Đây là các khoản trong lịch trình; có thể còn chi phí khác.
        </p>
      )}
      <Button disabled={disabled} onClick={onAdd}>
        <Icon name="plus" />
        Thêm chi phí
      </Button>
      <p className="text-sm text-muted">
        Mỗi khoản là chi phí cả nhóm, không nhân lại số người. Khoản chi mới được thêm vào lịch
        trình để bạn dễ theo dõi.
      </p>
    </section>
  );
}

import type { Trip } from '@goease/contracts';
import { BudgetSummary } from './budget';

export function TripOverview({
  trip,
  disabled,
  onBudget,
}: {
  trip: Trip;
  disabled: boolean;
  onBudget: () => void;
}) {
  return (
    <aside
      aria-label="Tóm tắt chuyến đi"
      className="hidden self-start xl:sticky xl:top-28 xl:flex xl:flex-col xl:gap-4"
    >
      <BudgetSummary trip={trip} disabled={disabled} onBudget={onBudget} />
      <p className="px-2 text-xs leading-relaxed text-muted">
        Giờ, giá và thời gian di chuyển cần được kiểm tra lại trước chuyến đi.
      </p>
    </aside>
  );
}

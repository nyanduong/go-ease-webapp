import type { Trip } from '@goease/contracts';
import { budgetView } from '@goease/trip-client/budget-controller';

export function Budget({ trip }: { trip: Trip }) {
  const model = budgetView(trip);
  return (
    <section className="flex min-w-0 flex-col gap-5" aria-label="Ngân sách chuyến đi">
      <div className="flex flex-col gap-3 rounded-3xl bg-sand p-6 [&>strong]:text-4xl [&>strong]:text-teal-dark">
        <span className="text-xs font-bold tracking-widest text-teal-dark uppercase">
          Chi phí đã biết toàn chuyến
        </span>
        <strong>{model.knownText}</strong>
        <p>{model.completeness}</p>
      </div>
      <div className="rounded-3xl border border-line bg-paper p-5 sm:p-6">
        <h3>Ngân sách đặt ra: {model.budgetText}</h3>
        <p className={model.warning ? 'text-error' : ''}>{model.difference}</p>
        <small>
          Chênh lệch chưa tính các khoản chưa có giá. Mỗi khoản là tổng nhóm, không nhân lại với{' '}
          {trip.people} người.
        </small>
      </div>
      <div className="grid min-w-0 gap-4 md:grid-cols-2">
        {model.days.map((day) => (
          <div key={day.dayId} className="rounded-3xl border border-line bg-paper p-5 sm:p-6">
            <h3>{day.date.split('-').reverse().join('/')}</h3>
            <b>{day.knownText}</b>
            <p>{day.completeness}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

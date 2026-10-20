import type { Trip } from '@goease/contracts';
import { Link } from '../../app/router';
import { dateLabel } from '../../components/ui';
import { Icon } from '../../components/icon';

export function HomeOverview({
  trips,
  placeCount,
}: {
  trips: Pick<Trip, 'id' | 'name' | 'startDate' | 'durationDays' | 'people'>[];
  placeCount: number;
}) {
  const latest = trips[0];
  return (
    <aside aria-label="Tổng quan chuyến đi" className="hidden flex-col gap-4 xl:flex">
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-3xl bg-mint p-5">
          <span className="text-3xl font-extrabold text-teal-dark">{trips.length}</span>
          <p className="mt-2 text-xs font-semibold text-muted">Chuyến đã lưu</p>
        </div>
        <div className="rounded-3xl bg-sand p-5">
          <span className="text-3xl font-extrabold text-amber-800">{placeCount}</span>
          <p className="mt-2 text-xs font-semibold text-muted">Địa điểm gợi ý</p>
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-4 rounded-3xl border border-line bg-paper p-6">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold tracking-widest text-muted uppercase">
            Hành trình của bạn
          </span>
          <Icon name="trips" />
        </div>
        <h2 className="text-xl">{latest ? latest.name : 'Điểm đến mới đang chờ bạn'}</h2>
        <p className="text-sm leading-relaxed text-muted">
          {latest
            ? `${dateLabel(latest.startDate)} · ${latest.durationDays} ngày · ${latest.people} người`
            : 'Một vài thông tin, một kế hoạch để cùng nhau hoàn thiện.'}
        </p>
        <Link
          className="mt-auto inline-flex items-center justify-between rounded-2xl bg-teal px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-teal-dark"
          href={latest ? `/trips/${encodeURIComponent(latest.id)}` : '/trips/new'}
        >
          {latest ? 'Mở chuyến đã lưu' : 'Tạo chuyến đầu tiên'}
          <span aria-hidden="true">→</span>
        </Link>
      </div>
    </aside>
  );
}

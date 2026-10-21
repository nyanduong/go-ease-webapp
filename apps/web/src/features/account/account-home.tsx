import { useState } from 'react';
import { POPULAR_DESTINATIONS } from '@goease/contracts';
import { Link } from '../../app/router';
import { useAccount } from './session';
import { Icon } from '../../components/icon';

export function AccountHome() {
  const { trips } = useAccount();
  const [destinationId, setDestinationId] = useState('');
  const latest = trips.draft?.trip ?? trips.items[0];
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-9 py-3 sm:py-6">
      <div className="min-w-0">
        <section className="flex min-w-0 flex-col items-start gap-5">
          <span className="hidden text-sm font-semibold tracking-wider text-teal lg:block">
            ĐI MỘT CHUYẾN, THÊM MỘT CÂU CHUYỆN
          </span>
          <h1 className="max-w-lg text-[clamp(2.75rem,6vw,4.5rem)] leading-[1.12] tracking-[-.045em]">
            Bạn muốn
            <br />
            đi đâu?
          </h1>
          <p className="max-w-sm text-base text-muted sm:text-lg">
            Chọn điểm đến, lên lịch theo cách bạn thích.
          </p>
          <div className="mt-2 flex w-full flex-col gap-3">
            <label htmlFor="home-destination" className="sr-only">
              Chọn điểm đến
            </label>
            <div className="relative">
              <Icon
                name="search"
                className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-muted"
              />
              <select
                id="home-destination"
                className="min-h-15 appearance-none pr-12 pl-12"
                value={destinationId}
                onChange={(event) => setDestinationId(event.target.value)}
              >
                <option value="">Chọn điểm đến</option>
                {POPULAR_DESTINATIONS.map((destination) => (
                  <option value={destination.id} key={destination.id}>
                    {destination.name}
                  </option>
                ))}
                <option value="search">Tìm một nơi khác tại Việt Nam…</option>
              </select>
              <Icon
                name="chevron"
                className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-muted"
              />
            </div>
            <Link
              className="primary-link min-h-14"
              href={`/trips/new${destinationId && destinationId !== 'search' ? `?destination=${encodeURIComponent(destinationId)}` : '?choose=1'}`}
            >
              Tạo chuyến đi <Icon name="arrow" />
            </Link>
          </div>
        </section>
      </div>
      {trips.ready && latest && (
        <section className="border-t border-line pt-6">
          <h2 className="mb-3 text-lg">Tiếp tục chuyến gần nhất</h2>
          <Link
            href={`/trips/${encodeURIComponent(latest.id)}`}
            className="surface flex min-h-20 items-center justify-between gap-4 p-5"
          >
            <div>
              <h3>{latest.name}</h3>
              <p className="text-sm text-muted">
                {trips.draft
                  ? 'Bản nháp · Tiếp tục chỉnh sửa'
                  : `${latest.durationDays} ngày · ${latest.people} người`}
              </p>
            </div>
            <Icon name="arrow" />
          </Link>
        </section>
      )}
    </div>
  );
}

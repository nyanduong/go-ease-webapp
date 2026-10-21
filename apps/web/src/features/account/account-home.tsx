import { useState } from 'react';
import { POPULAR_DESTINATIONS } from '@goease/contracts';
import { Link } from '../../app/router';
import { useAccount } from './session';
import { ScenicImage } from '../../components/scenic-image';
import { Icon } from '../../components/icon';

export function AccountHome() {
  const { trips } = useAccount();
  const [destinationId, setDestinationId] = useState('');
  const latest = trips.draft?.trip ?? trips.items[0];
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-9 py-3 sm:py-6">
      <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
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
        <section className="min-w-0" aria-labelledby="sample-heading">
          <h2 id="sample-heading" className="mb-4 text-2xl">
            Xem thử một chuyến
          </h2>
          <Link href="/sample" className="surface group block overflow-hidden shadow-sm">
            <ScenicImage
              priority
              className="aspect-[16/10] w-full object-cover transition-transform duration-200 motion-safe:group-hover:scale-[1.02]"
            />
            <div className="flex items-center justify-between gap-3 p-5">
              <div>
                <p className="text-xs font-medium tracking-wider text-muted uppercase">
                  Lịch trình mẫu
                </p>
                <h3 className="mt-1 text-2xl">Đà Lạt cuối tuần</h3>
                <p className="mt-1 text-sm text-muted">2 ngày · 2 người · Đi thong thả</p>
              </div>
              <Icon name="chevron" className="shrink-0 text-muted" />
            </div>
          </Link>
          <p className="mt-3 text-sm text-muted">
            Xem cách GoEase sắp xếp một chuyến đi. Chưa cần tài khoản.
          </p>
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

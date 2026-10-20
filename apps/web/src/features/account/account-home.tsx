import { Link } from '../../app/router';
import { HomeOverview } from '../trips/home-overview';
import { AccountWorkspace } from './account-workspace';
import { useAccount } from './session';
import { ScenicImage } from '../../components/scenic-image';
export function AccountHome() {
  const { trips, catalog } = useAccount();
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <section className="relative flex min-h-80 flex-col items-start justify-center gap-5 overflow-hidden rounded-3xl p-6 sm:p-10">
          <ScenicImage
            decorative
            priority
            className="absolute inset-0 size-full object-cover object-center"
            sizes="(max-width: 1023px) 100vw, 900px"
          />
          <div className="relative max-w-lg rounded-3xl bg-cream/95 p-6">
            <span className="text-xs font-bold tracking-widest text-teal-dark uppercase">
              Lên kế hoạch cùng GoEase
            </span>
            <h1 className="mt-3">
              Chuyến đi tiếp theo,
              <br />
              cùng nhau lên kế hoạch.
            </h1>
            <p className="mt-4 text-muted">
              Từ những điểm đến yêu thích tới một lịch trình của cả nhóm.
            </p>
            <Link
              href="/trips/new"
              className="mt-5 inline-flex min-h-11 items-center rounded-full bg-orange px-6 py-3 font-bold text-white"
            >
              + Tạo chuyến đi
            </Link>
          </div>
        </section>
        <HomeOverview
          trips={trips.items}
          placeCount={catalog.filter((place) => place.enabled).length}
        />
      </div>
      <AccountWorkspace />
    </div>
  );
}

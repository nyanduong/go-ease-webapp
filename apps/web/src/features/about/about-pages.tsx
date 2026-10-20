import { travelLinks } from '@goease/trip-client/travel-links-controller';
import { getDalatPlaces } from '@goease/catalog';
import { Link } from '../../app/router';
import { PageTitle } from '../../components/ui';
import { ScenicImage } from '../../components/scenic-image';

export function AboutPage() {
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <PageTitle eyebrow="Về GoEase">
        Đi cùng nhau,
        <br />
        khám phá nhiều hơn.
      </PageTitle>
      <div className="relative flex min-h-60 items-end overflow-hidden rounded-3xl sm:min-h-72 [&>div]:flex [&>div]:w-full [&>div]:flex-col [&>div]:gap-3 [&>div]:bg-linear-to-t [&>div]:from-ink/90 [&>div]:to-transparent [&>div]:p-6 [&>div]:pt-20 [&>div]:text-white sm:[&>div]:p-8">
        <ScenicImage
          decorative
          className="absolute inset-0 size-full object-cover object-center"
          sizes="(max-width: 1023px) 100vw, 1100px"
        />
        <div className="relative">
          <h2>
            Một kế hoạch,
            <br />
            cùng nhau hoàn thiện.
          </h2>
        </div>
      </div>
      <div className="flex min-w-0 flex-col gap-5 rounded-3xl border border-line bg-paper p-5 sm:p-6">
        <h2>Just go. We’ll plan.</h2>
        <p>
          GoEase giúp nhóm bạn lên kế hoạch du lịch tại Việt Nam, chỉnh lịch trình và theo dõi ngân
          sách chung.
        </p>
        <p>Lưu chuyến đi vào tài khoản để mở lại trên các thiết bị của bạn.</p>
        <span className="inline-flex w-fit rounded-full bg-mint px-3 py-1 text-xs font-bold text-teal-dark">
          Nhiều thành phố · 1–5 ngày · Tối đa 20 người
        </span>
        <Link
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-mint px-5 py-3 text-center text-sm font-bold text-teal-dark hover:bg-teal/15"
          href="/travel-services"
        >
          Chỗ nghỉ & chuyến bay ↗
        </Link>
      </div>
      <details className="rounded-3xl border border-line bg-paper p-5 sm:p-6">
        <summary>Tham khảo {getDalatPlaces().length} địa điểm tại Đà Lạt</summary>
        <p>Giờ mở cửa và giá có thể thay đổi. Hãy kiểm tra trước khi đi.</p>
        <div className="flex min-w-0 flex-col gap-5">
          {getDalatPlaces().map((place) => (
            <div key={place.id}>
              <h3>{place.name}</h3>
              {place.sources.map((source, index) => (
                <a
                  key={index}
                  className="mr-3 text-sm text-teal underline underline-offset-4"
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  referrerPolicy="no-referrer"
                >
                  Nguồn tham khảo {index + 1} ↗
                </a>
              ))}
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
export function TravelServices() {
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <PageTitle
        eyebrow="Chỗ nghỉ & chuyến bay"
        description="Tìm thêm chỗ nghỉ và chuyến bay cho hành trình của bạn."
      >
        Một chuyến đi trọn vẹn
      </PageTitle>
      <div className="grid min-w-0 gap-4 md:grid-cols-2">
        {travelLinks.map((link) => (
          <div
            className="flex min-w-0 flex-col gap-5 rounded-3xl border border-line bg-paper p-5 sm:p-6"
            key={link.id}
          >
            <h2>{link.title}</h2>
            <span className="text-xs font-bold tracking-widest text-teal-dark uppercase">
              {link.domain}
            </span>
            <p>{link.description}</p>
            <a
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              referrerPolicy="no-referrer"
              className="inline-flex min-h-11 items-center justify-center rounded-full bg-mint px-5 py-3 text-sm font-bold text-teal-dark hover:bg-teal/15"
            >
              Mở {link.name} ↗
            </a>
          </div>
        ))}
      </div>
      <p className="text-sm text-muted">
        Bạn sẽ đặt chỗ và thanh toán trực tiếp trên trang được mở.
      </p>
    </div>
  );
}

import { useState } from 'react';
import { travelLinks, createTravelLinkFlow } from '@goease/trip-client/travel-links-controller';
import { getDalatPlaces } from '@goease/catalog';
import { Link } from '../../app/router';
import { Button, Notice, PageTitle } from '../../components/ui';

export function AboutPage() {
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <PageTitle eyebrow="Về GoEase">
        Đi cùng nhau,
        <br />
        khám phá nhiều hơn.
      </PageTitle>
      <div className="relative flex min-h-60 items-end overflow-hidden rounded-3xl bg-[url('/dalat-illustration.png')] bg-cover bg-center sm:min-h-72 [&>div]:flex [&>div]:w-full [&>div]:flex-col [&>div]:gap-3 [&>div]:bg-linear-to-t [&>div]:from-ink/90 [&>div]:to-transparent [&>div]:p-6 [&>div]:pt-20 [&>div]:text-white sm:[&>div]:p-8">
        <div>
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
        <p>
          Tạo, xem và chỉnh chuyến; thêm hoạt động, quản lý ngân sách và xem địa điểm theo ngày.
          Chuyến khách được lưu trong trình duyệt và có thể mở lại khi mất mạng sau lần tải đầu.
        </p>
        <span className="inline-flex w-fit rounded-full bg-mint px-3 py-1 text-xs font-bold text-teal-dark">
          Đà Lạt · 1–5 ngày · Tối đa 20 người
        </span>
        <Link
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-mint px-5 py-3 text-center text-sm font-bold text-teal-dark hover:bg-teal/15"
          href="/travel-services"
        >
          Chỗ nghỉ & chuyến bay ↗
        </Link>
      </div>
      <details className="rounded-3xl border border-line bg-paper p-5 sm:p-6">
        <summary>Dữ liệu và lịch trình gợi ý · {getDalatPlaces().length} địa điểm demo</summary>
        <p>
          Lịch trình mẫu không tối ưu tuyến hoặc kiểm tra giờ mở cửa trực tiếp. Giá chưa biết được
          hiển thị rõ, không coi là miễn phí.
        </p>
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
  const [message, setMessage] = useState('');
  const [flow] = useState(() =>
    createTravelLinkFlow(async (url) => {
      const popup = window.open(url, '_blank', 'noopener,noreferrer');
      void popup;
    }),
  );
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <PageTitle
        eyebrow="Website tham khảo"
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
            <Button
              secondary
              onClick={() => {
                if (!flow.select(link.id)) return;
                if (
                  !window.confirm(
                    `Mở ${link.name} (${link.domain})? Bạn sẽ đặt trực tiếp trên website bên ngoài.`,
                  )
                ) {
                  flow.cancel();
                  return;
                }
                void flow.confirm().then((result) => setMessage(result.message));
              }}
            >
              Mở {link.name} ↗
            </Button>
          </div>
        ))}
      </div>
      {message && <Notice>{message}</Notice>}
      <Notice>
        Giá và điều kiện do website bên ngoài cung cấp. GoEase chỉ mở website, không nhận thanh toán
        hay xác nhận đặt phòng/vé. Liên kết không gửi kèm thông tin chuyến đi hoặc tài khoản.
      </Notice>
    </div>
  );
}

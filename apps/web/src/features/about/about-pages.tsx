import { travelLinks } from '@goease/trip-client/travel-links-controller';
import { getDalatPlaces } from '@goease/catalog';
import { Link } from '../../app/router';
import { PageTitle } from '../../components/ui';

export function AboutPage() {
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <header className="core-page-heading">
        <h1>Giới thiệu & trợ giúp</h1>
        <p>Lên lịch, lưu chuyến và tiếp tục hành trình của bạn.</p>
      </header>
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
      <section className="surface p-5">
        <h2 className="mb-3">Sử dụng GoEase</h2>
        <details>
          <summary>Lưu và mở lại chuyến đi</summary>
          <p>
            Đăng nhập Google, tạo chuyến rồi bấm Lưu. Chờ xác nhận “Đã lưu vào tài khoản” trước khi
            đóng trang. Mở mục Chuyến đi để tiếp tục chỉnh sửa.
          </p>
        </details>
        <details>
          <summary>Khi chưa lưu được thay đổi</summary>
          <p>
            Giữ trang đang mở, kiểm tra kết nối rồi bấm Thử lưu lại. Bản nháp được giữ riêng theo
            tài khoản trên thiết bị; chỉ chuyến được server xác nhận mới đồng bộ.
          </p>
        </details>
        <details>
          <summary>Giá và ngân sách</summary>
          <p>
            Ngân sách là tổng cho cả nhóm. Khoản chưa rõ giá được ghi riêng, không được tính là miễn
            phí. Hãy xác nhận giá và giờ mở cửa trước khi đi.
          </p>
        </details>
      </section>
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

import { ConnectionPanel } from '@/components/connection-panel';
import { AuthPanel } from '@/components/auth-panel';

export function HomePage() {
  return (
    <div className="site-shell">
      <a className="skip-link" href="#main">Đến nội dung chính</a>
      <header className="site-header">
        <a href="/" aria-label="GoEase — Trang chủ" className="brand">
          <svg aria-hidden="true" viewBox="0 0 64 64" className="size-10"><rect width="64" height="64" rx="18" fill="currentColor" /><path d="m42 18-8 22-16 6 8-22z" fill="#f8d69b" /><circle cx="30" cy="32" r="4" fill="currentColor" /></svg>
          GoEase<span className="brand-dot">.</span>
        </a>
        <span className="header-note">Cùng nhau, đi dễ hơn.</span>
      </header>
      <main id="main">
        <div className="hero-grid">
          <section className="hero-copy" aria-labelledby="page-title">
            <p className="eyebrow flex items-center gap-2"><span className="size-2 rounded-full bg-[#ce743f]" /> HÀNH TRÌNH VIỆT NAM</p>
            <h1 id="page-title">Một chuyến đi.<br /><span>Cả nhóm thảnh thơi.</span></h1>
            <p className="hero-description">Từ ý tưởng đến lịch trình, GoEase hướng tới một nơi để cả nhóm lên kế hoạch và khám phá Việt Nam theo cách riêng.</p>
            <div className="trip-note"><span aria-hidden="true">↗</span><p><strong>Khởi đầu từ những chuyến nhỏ</strong><br />MVP dự kiến thử tại một điểm đến, trong 1–5 ngày. Điểm đến sẽ được nhóm chốt sau.</p></div>
          </section>
          <ConnectionPanel />
        </div>
        <AuthPanel />
        <section aria-labelledby="journey-title" className="journey-section">
          <div className="journey-heading"><h2 id="journey-title">Điều chúng mình đang xây dựng</h2><p>Hướng đi của MVP · các tính năng chưa mở</p></div>
          <div className="feature-grid">
            <article><span className="feature-number">01</span><h3>Lịch trình & bản đồ</h3><p>Lên kế hoạch, chỉnh hoạt động và tìm trải nghiệm địa phương ngay trong web.</p></article>
            <article><span className="feature-number">02</span><h3>Ngân sách cả nhóm</h3><p>Cùng nhìn một ngân sách chung để hành trình phù hợp với mọi người.</p></article>
            <article><span className="feature-number">03</span><h3>Kết nối đối tác</h3><p>Khách sạn và vé máy bay nằm trong MVP. M0 đang xác minh phương án hợp tác.</p></article>
          </div>
        </section>
      </main>
      <footer><span>GoEase · Bắt đầu từ một nền tảng vững.</span><span>Web & API · GE-M0-01</span></footer>
    </div>
  );
}

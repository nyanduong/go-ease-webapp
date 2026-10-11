import { useEffect, useRef, useSyncExternalStore, type ComponentProps } from 'react';
import { AdminCatalog } from '@/components/admin-catalog';
import { AuthPanel } from '@/components/auth-panel';
import { ConnectionPanel } from '@/components/connection-panel';
import { useWebAuth } from '@/lib/auth-context';
import { WebAuthProvider } from '@/lib/auth-provider';

function subscribeRoute(listener: () => void) { window.addEventListener('popstate', listener); return () => window.removeEventListener('popstate', listener); }
function RouteLink({ href, onClick, ...props }: ComponentProps<'a'> & { href: string }) {
  return <a {...props} href={href} onClick={event => {
    onClick?.(event);
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault(); window.history.pushState({}, '', href); window.dispatchEvent(new PopStateEvent('popstate'));
  }} />;
}
export function AdminShell() {
  const path = useSyncExternalStore(subscribeRoute, () => window.location.pathname), main = useRef<HTMLElement>(null);
  const { state: session } = useWebAuth();
  const catalog = path === '/' || path === '/admin/catalog', requests = path === '/admin/requests', technical = path === '/technical/health';
  const adminRoute = catalog || requests, allowed = session.kind === 'signedIn' && session.user?.role === 'ADMIN';
  useEffect(() => { main.current?.focus(); }, [path]);
  return <div className="admin-shell">
    <a className="skip-link" href="#main">Đến nội dung chính</a>
    <aside className="admin-sidebar">
      <RouteLink href="/admin/catalog" className="brand" aria-label="GoEase — Quản trị"><span className="admin-brand-mark" aria-hidden="true">g</span>GoEase<span className="brand-dot">.</span></RouteLink>
      <p className="eyebrow">KHÔNG GIAN VẬN HÀNH</p>
      <nav aria-label="Điều hướng quản trị" className="admin-nav">
        <RouteLink href="/admin/catalog" aria-current={catalog ? 'page' : undefined}>Dữ liệu tham chiếu</RouteLink>
        <RouteLink href="/admin/requests" aria-current={requests ? 'page' : undefined}>Yêu cầu dịch vụ</RouteLink>
        <RouteLink href="/technical/health" aria-current={technical ? 'page' : undefined}>Kết nối kỹ thuật</RouteLink>
      </nav>
      <p className="admin-sidebar-note">Quyền quản trị danh mục không cấp quyền xem chuyến riêng của người khác.</p>
    </aside>
    <div className="admin-content">
      <header className="admin-topbar"><span>GoEase / Quản trị</span><span>{allowed ? 'Phiên nhân viên đã xác minh' : 'Cần phiên được cấp quyền'}</span></header>
      <main id="main" className="admin-body" tabIndex={-1} ref={main}>
        {technical ? <>
          <p className="eyebrow">KIỂM TRA KẾT NỐI</p><h1>Kết nối kỹ thuật</h1>
          <p className="admin-description">Health chỉ kiểm tra API, không chứng minh DB, OAuth hay dịch vụ đối tác hoạt động.</p>
          <div className="admin-health"><ConnectionPanel /></div>
        </> : !adminRoute ? <section className="admin-card"><p className="eyebrow">404</p><h1>Không tìm thấy trang</h1><p>Đường dẫn này không thuộc khu quản trị.</p><RouteLink href="/admin/catalog">Về dữ liệu tham chiếu</RouteLink></section>
          : !allowed ? <section className="admin-login">
            <p className="eyebrow">GOEASE / QUẢN TRỊ</p>
            <h1>{session.kind === 'signedIn' ? 'Tài khoản chưa có quyền' : session.kind === 'restoring' ? 'Đang kiểm tra phiên' : 'Không gian vận hành'}</h1>
            <p>{session.kind === 'signedIn' ? '403 · Quyền quản trị phải được người vận hành cấp tại máy chủ. Đổi role trên trình duyệt hoặc biết đường dẫn không cấp quyền.' : 'Đăng nhập bằng tài khoản được cấp quyền để xem dữ liệu tham chiếu. Không có tài khoản quản trị mặc định.'}</p>
            <AuthPanel />
          </section> : <>
            <p className="eyebrow">{catalog ? 'DANH MỤC / M0' : 'ĐỊNH HƯỚNG SAU M0'}</p>
            <h1>{catalog ? 'Dữ liệu tham chiếu' : 'Yêu cầu khách sạn & vé máy bay'}</h1>
            <p className="admin-description">{catalog ? 'Danh mục dùng chung cho chuyến mẫu. Không chứa lịch trình hoặc dữ liệu riêng của khách.' : 'Thông tin định hướng; chưa có luồng tiếp nhận hoặc xử lý yêu cầu ở M0.'}</p>
            <AuthPanel />
            {catalog ? <>
              <div className="admin-notice"><strong>Dữ liệu thử có nguồn</strong><p>Hà Nội là bộ mẫu kỹ thuật, chưa chốt điểm đến mở thử. Chỉ đọc dữ liệu lưu trong DB; không xác nhận giá, giờ mở cửa hay tồn chỗ.</p></div>
            </> : <section className="admin-card"><span className="admin-pill">Chưa triển khai trong M0</span><h2>Từ yêu cầu đến xác nhận</h2><p>Nhận yêu cầu → xác minh quyền và đối tác → chuyển đối tác → chờ phản hồi → xác nhận có bằng chứng.</p><p>Chưa có danh sách yêu cầu hoặc booking thật ở đây. Không gửi thông tin, giữ chỗ, thu tiền hoặc phát hành vé.</p></section>}
          </>}
        {/* Keep the rejection latch alive while auth restores; the component hides data before rendering. */}
        {catalog && <AdminCatalog />}
        {allowed && adminRoute && <div className="admin-info-grid"><section className="admin-notice"><h2>Quyền có giới hạn</h2><p>Server kiểm tra phiên và quyền hiện tại trên mỗi request. Khu này không đọc hoặc sửa chuyến riêng.</p></section><section className="admin-notice"><h2>Tình trạng tích hợp</h2><p>Chưa có số liệu AI, Maps, doanh thu hoặc booking live trong shell này.</p></section></div>}
      </main>
    </div>
  </div>;
}
export function HomePage() { return <WebAuthProvider><AdminShell /></WebAuthProvider>; }

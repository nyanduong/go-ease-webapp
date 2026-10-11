import { useRef } from 'react';
import { useWebAuth } from '@/lib/auth-context';
import { Button } from './ui/button';

export function AuthPanel() {
  const target = useRef<HTMLDivElement>(null);
  const { store, state } = useWebAuth();
  return <section aria-labelledby="auth-title" className="auth-panel">
    <h2 id="auth-title">Tài khoản nhân viên</h2>
    <p role="status">{state.kind === 'blocked' ? 'Đăng nhập nhân viên chưa được cấu hình cho môi trường này. Liên hệ người vận hành.' : state.message}</p>
    {state.user && <p>Tài khoản: {state.user.displayName ?? 'Người dùng GoEase'} · Quyền máy chủ cấp: {state.user.role}</p>}
    <div ref={target} />
    {state.kind === 'signedOut' && <Button type="button" onClick={() => { if (target.current) void store.prepare(target.current); }}>Chuẩn bị đăng nhập Google</Button>}
    {(state.kind === 'preparing' || state.kind === 'awaitingGoogle') && <Button type="button" variant="outline" onClick={store.cancel}>Hủy đăng nhập</Button>}
    {state.kind === 'signedIn' && <Button type="button" variant="outline" onClick={() => { void store.logout(); }}>Đăng xuất GoEase</Button>}
    {state.kind === 'error' && <Button type="button" onClick={() => { void store.restore(); }}>Kiểm tra phiên lại</Button>}
    <p className="admin-muted">Đăng nhập không tự cấp quyền quản trị. Quyền do máy chủ kiểm tra mỗi yêu cầu.</p>
  </section>;
}

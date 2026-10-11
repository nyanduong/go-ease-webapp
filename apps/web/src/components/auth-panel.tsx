import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { API_BASE_URL } from '@/lib/health';
import { createWebAuthClient, webAuthConfig } from '@/lib/auth-client';
import { createWebGoogleProvider } from '@/lib/auth-google';
import { createWebAuthStore } from '@/lib/auth-store';

export function AuthPanel() {
  const target = useRef<HTMLDivElement>(null);
  const store = useMemo(() => {
    try {
      const configuration = webAuthConfig(import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID, API_BASE_URL, window.location.origin);
      return createWebAuthStore(createWebAuthClient(configuration.apiBase), createWebGoogleProvider(configuration.clientId));
    } catch { return createWebAuthStore(createWebAuthClient(''), createWebGoogleProvider(''), true); }
  }, []);
  const state = useSyncExternalStore(store.subscribe, store.snapshot);
  useEffect(() => {
    void store.restore();
    const refresh = () => { if (document.visibilityState === 'visible') void store.restore(); };
    document.addEventListener('visibilitychange', refresh);
    return () => { document.removeEventListener('visibilitychange', refresh); store.dispose(); };
  }, [store]);
  return <section aria-labelledby="auth-title" className="journey-section" style={{ maxWidth: 640 }}>
    <h2 id="auth-title">Đăng nhập kỹ thuật M0</h2>
    <p role="status">{state.message}</p>
    {state.user && <p>Tài khoản: {state.user.displayName ?? 'Người dùng GoEase'} · Quyền máy chủ cấp: {state.user.role}</p>}
    <div ref={target} />
    {state.kind === 'signedOut' && <button type="button" onClick={() => { if (target.current) void store.prepare(target.current); }}>Chuẩn bị đăng nhập Google</button>}
    {(state.kind === 'preparing' || state.kind === 'awaitingGoogle') && <button type="button" onClick={store.cancel}>Hủy đăng nhập</button>}
    {state.kind === 'signedIn' && <button type="button" onClick={() => { void store.logout(); }}>Đăng xuất GoEase</button>}
    {state.kind === 'error' && <button type="button" onClick={() => { void store.restore(); }}>Kiểm tra phiên lại</button>}
    <p>Quyền được backend xác minh mỗi request. Phần này chưa phải shell quản trị; đăng nhập không tự cấp quyền admin.</p>
  </section>;
}

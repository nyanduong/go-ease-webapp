import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { AdminShell, HomePage } from './home-page';
import { WebAuthContext } from '@/lib/auth-context';
import { adminUser, authFixture, catalog, deferred } from '@/lib/admin-fixture.test-support';

afterEach(() => { window.history.replaceState({}, '', '/'); });
it('root is admin login, not a customer landing; missing config has no fake Google or API call', () => {
  const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher); render(<HomePage />);
  expect(screen.getByRole('heading', { level: 1, name: 'Không gian vận hành' })).toBeVisible();
  expect(screen.getByText(/Đăng nhập nhân viên chưa được cấu hình/)).toBeVisible();
  expect(screen.queryByRole('button')).not.toBeInTheDocument(); expect(fetcher).not.toHaveBeenCalled();
  expect(screen.queryByText('Một chuyến đi.')).not.toBeInTheDocument();
});
it('customer cannot fetch catalog even when persistent storage claims ADMIN', async () => {
  const storage = vi.spyOn(Storage.prototype, 'getItem').mockReturnValue('{"role":"ADMIN"}');
  const auth = authFixture({ ...adminUser, role: 'CUSTOMER' }), fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
  await auth.store.restore();
  try {
    render(<WebAuthContext.Provider value={auth.store}><AdminShell /></WebAuthContext.Provider>);
    expect(screen.getByRole('heading', { name: 'Tài khoản chưa có quyền' })).toBeVisible();
    expect(screen.getByText(/403 · Quyền quản trị/)).toBeVisible(); expect(fetcher).not.toHaveBeenCalled(); expect(storage).not.toHaveBeenCalled();
  } finally { auth.store.dispose(); storage.mockRestore(); }
});
it('verified admin renders escaped API catalog/inactive state, and keyboard navigation works', async () => {
  const auth = authFixture(); await auth.store.restore();
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ ...catalog, places: [{ ...catalog.places[0]!, name: '<script>TEST ONLY</script>', isActive: false }] })));
  try {
    render(<WebAuthContext.Provider value={auth.store}><AdminShell /></WebAuthContext.Provider>);
    expect(await screen.findByRole('heading', { name: '<script>TEST ONLY</script>' })).toBeVisible();
    expect(screen.getByText('Đã ngừng dùng')).toBeVisible(); expect(document.querySelector('main script')).toBeNull();
    const link = screen.getByRole('link', { name: 'Yêu cầu dịch vụ' }); link.focus(); await userEvent.keyboard('{Enter}');
    expect(window.location.pathname).toBe('/admin/requests'); expect(screen.getByRole('heading', { level: 1, name: 'Yêu cầu khách sạn & vé máy bay' })).toBeVisible();
    expect(screen.getByText('Chưa triển khai trong M0')).toBeVisible(); expect(screen.queryByText('<script>TEST ONLY</script>')).not.toBeInTheDocument();
  } finally { auth.store.dispose(); }
});
it('deep links and unknown routes render correctly without loading catalog on requests page', async () => {
  const auth = authFixture(); await auth.store.restore(); const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
  window.history.replaceState({}, '', '/admin/requests');
  try {
    const { unmount } = render(<WebAuthContext.Provider value={auth.store}><AdminShell /></WebAuthContext.Provider>);
    expect(screen.getByText('Chưa triển khai trong M0')).toBeVisible(); expect(fetcher).not.toHaveBeenCalled(); unmount();
    window.history.replaceState({}, '', '/not-an-admin-route');
    render(<WebAuthContext.Provider value={auth.store}><AdminShell /></WebAuthContext.Provider>);
    expect(screen.getByRole('heading', { name: 'Không tìm thấy trang' })).toBeVisible(); expect(fetcher).not.toHaveBeenCalled();
  } finally { auth.store.dispose(); }
});
it('logout immediately hides catalog and ignores a late request completion', async () => {
  const auth = authFixture(); await auth.store.restore(); const pending = deferred<Response>();
  vi.stubGlobal('fetch', vi.fn(() => pending.promise));
  try {
    render(<WebAuthContext.Provider value={auth.store}><AdminShell /></WebAuthContext.Provider>);
    await userEvent.click(screen.getByRole('button', { name: 'Đăng xuất GoEase' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Không gian vận hành' })).toBeVisible();
    await act(async () => { pending.resolve(Response.json(catalog)); });
    expect(screen.queryByRole('heading', { name: catalog.places[0]!.name })).not.toBeInTheDocument();
  } finally { auth.store.dispose(); }
});
it.each([401, 403])('persistent catalog HTTP%s with ADMIN me checks session once, then requires an explicit retry', async status => {
  const auth = authFixture(); await auth.store.restore();
  const current = vi.spyOn(auth.client, 'current'), fetcher = vi.fn(async () => new Response('TEST ONLY refused', { status }));
  vi.stubGlobal('fetch', fetcher);
  try {
    render(<WebAuthContext.Provider value={auth.store}><AdminShell /></WebAuthContext.Provider>);
    expect(await screen.findByRole('alert')).toHaveTextContent('Phiên đã được kiểm tra lại');
    expect(current).toHaveBeenCalledTimes(1); expect(fetcher).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: 'Đọc danh mục lại' }));
    await waitFor(() => expect(current).toHaveBeenCalledTimes(2));
    expect(fetcher).toHaveBeenCalledTimes(2);
  } finally { auth.store.dispose(); }
});
it('technical health remains a separate public route and uses the existing health component', async () => {
  window.history.replaceState({}, '', '/technical/health');
  const fetcher = vi.fn(async (_url: string | URL | Request) => Response.json({ status: 'ok', service: 'goease-api', scope: 'api-only', timestamp: '2026-10-11T08:00:00.000Z' }));
  vi.stubGlobal('fetch', fetcher); render(<HomePage />);
  expect(await screen.findByRole('heading', { name: 'API đang hoạt động' })).toBeVisible();
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
  expect(String(fetcher.mock.calls[0]?.[0])).toMatch(/\/health$/);
});

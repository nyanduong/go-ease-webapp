import type { AuthUser } from '@goease/contracts';
import { WebAuthFailure, type createWebAuthClient } from './auth-client';
import type { createWebGoogleProvider } from './auth-google';

export type WebAuthState = { kind: 'blocked' | 'restoring' | 'signedOut' | 'preparing' | 'awaitingGoogle' | 'exchanging' | 'signedIn' | 'signingOut' | 'error'; message: string; user?: AuthUser };
export function createWebAuthStore(client: ReturnType<typeof createWebAuthClient>, provider: ReturnType<typeof createWebGoogleProvider>, blocked = false) {
  let state: WebAuthState = { kind: blocked ? 'blocked' : 'restoring', message: blocked ? new WebAuthFailure('configuration').message : 'Đang kiểm tra phiên…' };
  let csrf: string | undefined, expiresAt: string | undefined, active: AbortController | undefined, generation = 0, element: HTMLElement | undefined, clearingCookie = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const listeners = new Set<() => void>();
  const publish = (next: WebAuthState) => { state = next; listeners.forEach(listener => listener()); };
  function begin() { active?.abort(); clearTimeout(timer); provider.cancel(element); active = new AbortController(); return { signal: active.signal, id: ++generation }; }
  function expireAtDeadline() { clearTimeout(timer); if (expiresAt) timer = setTimeout(() => { void restore(); }, Math.max(1, Date.parse(expiresAt) - Date.now())); }
  const accepted = (session: { user: AuthUser; csrfToken: string; expiresAt: string }) => {
    csrf = session.csrfToken; expiresAt = session.expiresAt; publish({ kind: 'signedIn', message: 'Phiên GoEase đã được máy chủ xác minh.', user: session.user });
    expireAtDeadline();
  };
  async function restore() {
    if (blocked || clearingCookie || ['preparing', 'awaitingGoogle', 'exchanging', 'signingOut'].includes(state.kind)) return;
    const operation = begin(); publish({ kind: 'restoring', message: 'Đang kiểm tra phiên…' });
    try { const session = await client.current(operation.signal); if (operation.id === generation) accepted(session); }
    catch (error) {
      if (operation.id !== generation) return;
      if (error instanceof WebAuthFailure && error.code === 'expired') {
        clearingCookie = true;
        try {
          // An expired HttpOnly cookie can still be present and would block a fresh challenge.
          await client.logout(operation.signal);
          if (operation.id === generation) { csrf = undefined; publish({ kind: 'signedOut', message: 'Chưa có phiên GoEase hợp lệ.' }); }
        } catch { if (operation.id === generation) publish({ kind: 'error', message: 'Chưa xóa được cookie phiên cũ. Thử kiểm tra phiên lại.' }); }
        finally { clearingCookie = false; }
      } else publish({ kind: 'error', message: error instanceof WebAuthFailure ? error.message : new WebAuthFailure('network').message });
    }
  }
  async function prepare(target: HTMLElement) {
    if (blocked || state.kind !== 'signedOut') return;
    element = target; const operation = begin(); publish({ kind: 'preparing', message: 'Đang chuẩn bị đăng nhập Google…' });
    try {
      const challenge = await client.challenge(operation.signal); let used = false;
      await provider.render(challenge, target, operation.signal, credential => {
        if (used || operation.id !== generation || operation.signal.aborted) return;
        used = true; clearTimeout(timer); provider.cancel(element); publish({ kind: 'exchanging', message: 'Đang xác minh phiên với máy chủ…' });
        void client.exchange(challenge, credential, operation.signal).then(session => {
          if (operation.id === generation) accepted(session);
        }).catch(error => {
          // A lost exchange response may already have set the cookie: restore/clear before a new login.
          if (operation.id === generation) publish({ kind: 'error', message: error instanceof WebAuthFailure ? error.message : new WebAuthFailure('network').message });
        });
      });
      if (operation.id !== generation || operation.signal.aborted || used) return;
      publish({ kind: 'awaitingGoogle', message: 'Dùng nút Google chính thức bên dưới. Có thể hủy và bắt đầu lại.' });
      timer = setTimeout(() => { active?.abort(); generation++; provider.cancel(element); publish({ kind: 'signedOut', message: 'Lượt đăng nhập đã hết hạn. Hãy bắt đầu lại.' }); }, Math.max(1, Math.min(120_000, Date.parse(challenge.expiresAt) - Date.now())));
    } catch (error) {
      if (operation.id === generation) publish({ kind: 'signedOut', message: error instanceof WebAuthFailure ? error.message : new WebAuthFailure('provider').message });
    }
  }
  async function logout() {
    if (blocked || state.kind !== 'signedIn') return;
    const user = state.user; const operation = begin(); publish({ kind: 'signingOut', message: 'Đang thu hồi phiên…', ...(user ? { user } : {}) });
    try {
      await client.logout(operation.signal, csrf); csrf = undefined; expiresAt = undefined;
      try { provider.signOut(); } catch { /* Google UI cache cleanup cannot undo acknowledged GoEase revocation. */ }
      if (operation.id === generation) publish({ kind: 'signedOut', message: 'Máy chủ đã xác nhận đăng xuất GoEase.' });
    } catch {
      if (operation.id === generation) { publish({ kind: 'signedIn', message: 'Chưa thu hồi phiên trên máy chủ. Vui lòng thử đăng xuất lại.', ...(user ? { user } : {}) }); expireAtDeadline(); }
    }
  }
  return {
    snapshot: () => state, subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; }, restore, prepare, logout,
    cancel() { if (['preparing', 'awaitingGoogle'].includes(state.kind)) { active?.abort(); generation++; clearTimeout(timer); provider.cancel(element); publish({ kind: 'signedOut', message: new WebAuthFailure('cancelled').message }); } },
    dispose() { active?.abort(); generation++; clearTimeout(timer); provider.cancel(element); },
  };
}

import { isOpaqueToken, type AuthUser } from '@goease/contracts';
import { AuthFailure, safeAuthFailure, type createNativeAuthClient } from './client.ts';

export interface SessionVault { get(): Promise<string | null>; set(token: string): Promise<void>; delete(): Promise<void> }
export interface CredentialProvider { credential(nonce: string, signal: AbortSignal): Promise<string>; signOut(): Promise<void> }
export type NativeAuthState = { kind: 'blocked' | 'restoring' | 'signedOut' | 'signingIn' | 'signedIn' | 'signingOut' | 'error' | 'cleanupRequired'; message: string; user?: AuthUser };
export function createNativeAuthStore(client: ReturnType<typeof createNativeAuthClient>, provider: CredentialProvider, vault: SessionVault, blocked = false) {
  let state: NativeAuthState = { kind: blocked ? 'blocked' : 'restoring', message: blocked ? new AuthFailure('configuration').message : 'Đang kiểm tra phiên…' };
  let token: string | null = null, revoked = false, active: AbortController | undefined, generation = 0, loggingIn = false, clearingVault = false;
  let expiry: ReturnType<typeof setTimeout> | undefined;
  const listeners = new Set<() => void>();
  const publish = (next: NativeAuthState) => { state = next; listeners.forEach(listener => listener()); };
  const authenticated = (user: AuthUser, expiresAt: string) => {
    clearTimeout(expiry); publish({ kind: 'signedIn', message: 'Phiên GoEase đã được máy chủ xác minh.', user });
    expiry = setTimeout(() => { void restore(); }, Math.max(1, Date.parse(expiresAt) - Date.now()));
  };
  function begin() { active?.abort(); active = new AbortController(); return { signal: active.signal, id: ++generation }; }
  async function restore() {
    if (blocked || loggingIn || clearingVault || state.kind === 'signingOut' || state.kind === 'cleanupRequired') return;
    const operation = begin(); clearTimeout(expiry); publish({ kind: 'restoring', message: 'Đang kiểm tra phiên…' });
    try {
      const restoredToken = await vault.get();
      if (operation.id !== generation) return;
      token = restoredToken; revoked = false;
      if (token && !isOpaqueToken(token)) {
        revoked = true; clearingVault = true;
        try { await vault.delete(); } finally { clearingVault = false; }
        if (operation.id !== generation) return;
        token = null;
      }
      if (!token) { publish({ kind: 'signedOut', message: 'Chưa đăng nhập GoEase.' }); return; }
      const current = await client.current(token, operation.signal);
      if (operation.id === generation) authenticated(current.user, current.expiresAt);
    } catch (error) {
      if (operation.id !== generation) return;
      if (error instanceof AuthFailure && error.code === 'expired') {
        clearingVault = true;
        try { await vault.delete(); if (operation.id === generation) { token = null; publish({ kind: 'signedOut', message: error.message }); } }
        catch { if (operation.id === generation) publish({ kind: 'cleanupRequired', message: new AuthFailure('storage').message }); }
        finally { clearingVault = false; }
      } else publish({ kind: 'error', message: error instanceof AuthFailure ? error.message : new AuthFailure('storage').message });
    }
  }
  async function clearSession(signal: AbortSignal) {
    if (token && !revoked) { await client.logout(token, signal); revoked = true; }
    await vault.delete(); token = null; revoked = false;
    try { await provider.signOut(); } catch { /* Google cache cleanup cannot undo acknowledged GoEase revocation. */ }
  }
  async function logout() {
    if (blocked || loggingIn || clearingVault || !['signedIn', 'cleanupRequired'].includes(state.kind)) return;
    const operation = begin(); clearTimeout(expiry);
    const user = state.user; publish({ kind: 'signingOut', message: 'Đang thu hồi phiên trên máy chủ…', ...(user ? { user } : {}) });
    try { await clearSession(operation.signal); if (operation.id === generation) publish({ kind: 'signedOut', message: 'Máy chủ đã xác nhận đăng xuất GoEase.' }); }
    catch { if (operation.id === generation) publish({ kind: 'cleanupRequired', message: new AuthFailure('cleanup').message, ...(user ? { user } : {}) }); }
  }
  async function login() {
    if (blocked || loggingIn || clearingVault || state.kind !== 'signedOut') return;
    loggingIn = true;
    const operation = begin(); publish({ kind: 'signingIn', message: 'Đang đăng nhập Google…' });
    async function discardIssuedSession() {
      try {
        await clearSession(new AbortController().signal);
        if (operation.id === generation) publish({ kind: 'signedOut', message: 'Phiên vừa cấp đã được thu hồi; hãy bắt đầu lại.' });
      } catch { if (operation.id === generation) publish({ kind: 'cleanupRequired', message: new AuthFailure('cleanup').message }); }
    }
    try {
      const challenge = await client.challenge(operation.signal);
      const credential = await provider.credential(challenge.nonce, operation.signal);
      if (operation.id !== generation || operation.signal.aborted) return;
      const session = await client.exchange(challenge, credential, operation.signal);
      // If cancellation races an issued session, revoke it instead of orphaning its token.
      token = session.accessToken; revoked = false;
      if (operation.id !== generation || operation.signal.aborted) { await discardIssuedSession(); return; }
      try { await vault.set(token); }
      catch { if (operation.id === generation) publish({ kind: 'cleanupRequired', message: new AuthFailure('storage').message }); await discardIssuedSession(); return; }
      if (operation.id !== generation || operation.signal.aborted) { await discardIssuedSession(); return; }
      authenticated(session.user, session.expiresAt);
    } catch (error) {
      if (operation.id === generation) publish({ kind: 'signedOut', message: safeAuthFailure(error).message });
    } finally { loggingIn = false; }
  }
  return {
    snapshot: () => state, subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; }, restore, login, logout,
    cancel() { if (state.kind === 'signingIn') { active?.abort(); publish({ kind: 'signedOut', message: new AuthFailure('cancelled').message }); } },
    dispose() { active?.abort(); generation++; clearTimeout(expiry); },
  };
}

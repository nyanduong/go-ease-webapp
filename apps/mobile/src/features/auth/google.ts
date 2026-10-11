import { isOpaqueToken } from '@goease/contracts';
import { abortable, AuthFailure } from './client.ts';

export interface GoogleConfig { webClientId: string; iosClientId?: string }
export function googleClientId(value: string | undefined): string | undefined {
  return value && /^[0-9]+-[a-z0-9-]+\.apps\.googleusercontent\.com$/.test(value) ? value : undefined;
}
export function googleConfig(web: string | undefined, ios: string | undefined, platform: string): GoogleConfig {
  const webClientId = googleClientId(web), iosClientId = googleClientId(ios);
  if (!webClientId || platform !== 'android' && platform !== 'ios' || platform === 'ios' && !iosClientId) throw new AuthFailure('configuration');
  return { webClientId, ...(iosClientId ? { iosClientId } : {}) };
}
export interface GoogleSdk {
  configure(options: { webClientId: string; iosClientId?: string; nonce: string; offlineAccess: false; autoSelectOnSignIn: false }): void;
  checkPlayServices(showErrorResolutionDialog: boolean): Promise<void>;
  presentExplicitSignIn(): Promise<{ type: string; data: { idToken: string } | null }>;
  signOut(): Promise<void>;
}
export function createGoogleCredentialProvider(config: GoogleConfig, sdk: GoogleSdk, timeoutMs = 120_000) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 10 || timeoutMs > 120_000) throw new AuthFailure('configuration');
  let active = false;
  return {
    async credential(nonce: string, signal: AbortSignal): Promise<string> {
      if (active || !isOpaqueToken(nonce)) throw new AuthFailure('provider');
      if (signal.aborted) throw new AuthFailure('cancelled');
      active = true;
      const controller = new AbortController(); let timedOut = false;
      const cancel = () => controller.abort(); signal.addEventListener('abort', cancel, { once: true });
      const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
      // Native dialogs cannot be forcibly cancelled through this SDK. Keep its lock until it actually settles.
      const operation = (async () => {
        try {
          sdk.configure({ ...config, nonce, offlineAccess: false, autoSelectOnSignIn: false });
          await sdk.checkPlayServices(false);
          if (controller.signal.aborted) throw new AuthFailure('cancelled');
          const response = await sdk.presentExplicitSignIn();
          if (response.type === 'cancelled') throw new AuthFailure('cancelled');
          if (response.type !== 'success' || !response.data || typeof response.data.idToken !== 'string') throw new AuthFailure('provider');
          return response.data.idToken;
        } catch (error) {
          if (error instanceof AuthFailure) throw error;
          if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'SIGN_IN_CANCELLED') throw new AuthFailure('cancelled');
          throw new AuthFailure('provider');
        } finally { active = false; }
      })();
      try { return await abortable(operation, controller.signal); }
      catch (error) { if (signal.aborted) throw new AuthFailure('cancelled'); if (timedOut) throw new AuthFailure('timeout'); throw error; }
      finally { clearTimeout(timer); signal.removeEventListener('abort', cancel); }
    },
    async signOut() { try { await sdk.signOut(); } catch { /* GoEase revocation is separate from Google's cached SDK account. */ } },
  };
}

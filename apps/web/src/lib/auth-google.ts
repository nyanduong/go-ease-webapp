import { WebAuthFailure, webAbortable } from './auth-client';
import type { AuthChallengeResponse } from '@goease/contracts';

export interface GoogleIdentityServices {
  initialize(configuration: { client_id: string; nonce: string; auto_select: false; ux_mode: 'popup'; callback: (response: { credential?: string }) => void }): void;
  renderButton(element: HTMLElement, options: { type: 'standard'; theme: 'outline'; size: 'large'; text: 'signin_with' }): void;
  cancel(): void;
  disableAutoSelect(): void;
}
declare global { interface Window { google?: { accounts?: { id?: GoogleIdentityServices } } } }
const GIS_URL = 'https://accounts.google.com/gsi/client';
export function loadGoogleIdentityServices(signal: AbortSignal): Promise<GoogleIdentityServices> {
  if (signal.aborted) return Promise.reject(new WebAuthFailure('cancelled'));
  if (window.google?.accounts?.id) return Promise.resolve(window.google.accounts.id);
  const operation = new Promise<GoogleIdentityServices>((resolve, reject) => {
    const script = document.createElement('script'); script.src = GIS_URL; script.async = true;
    const finish = () => { clearTimeout(timer); script.onload = null; script.onerror = null; signal.removeEventListener('abort', cancel); };
    const cancel = () => { finish(); script.remove(); reject(new WebAuthFailure('cancelled')); };
    const timer = setTimeout(() => { finish(); script.remove(); reject(new WebAuthFailure('timeout')); }, 10_000);
    script.onload = () => { finish(); const sdk = window.google?.accounts?.id; if (sdk) resolve(sdk); else { script.remove(); reject(new WebAuthFailure('provider')); } };
    script.onerror = () => { finish(); script.remove(); reject(new WebAuthFailure('provider')); };
    signal.addEventListener('abort', cancel, { once: true }); document.head.append(script);
  });
  return webAbortable(operation, signal);
}
export function createWebGoogleProvider(clientId: string, load = loadGoogleIdentityServices) {
  let sdk: GoogleIdentityServices | undefined;
  return {
    async render(challenge: AuthChallengeResponse, element: HTMLElement, signal: AbortSignal, receive: (credential: string) => void) {
      sdk = await load(signal);
      if (signal.aborted) throw new WebAuthFailure('cancelled');
      element.replaceChildren();
      sdk.initialize({ client_id: clientId, nonce: challenge.nonce, auto_select: false, ux_mode: 'popup', callback(response) {
        if (!signal.aborted) receive(typeof response.credential === 'string' ? response.credential : '');
      } });
      sdk.renderButton(element, { type: 'standard', theme: 'outline', size: 'large', text: 'signin_with' });
    },
    cancel(element?: HTMLElement) { try { sdk?.cancel(); } catch { /* Local Google UI cleanup is best-effort. */ } element?.replaceChildren(); },
    signOut() { sdk?.disableAutoSelect(); },
  };
}

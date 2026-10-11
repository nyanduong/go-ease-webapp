import { isAdminPlacesResponse, type AdminPlacesResponse } from '@goease/contracts';
import { webAbortable } from './auth-client';
import { resolveApiBase } from './api-base';

export type AdminFailureCode = 'configuration' | 'network' | 'timeout' | 'cancelled' | 'expired' | 'forbidden' | 'unavailable' | 'contract';
const messages: Record<AdminFailureCode, string> = {
  configuration: 'Danh mục chưa được cấu hình cho môi trường này.', network: 'Chưa kết nối được máy chủ. Vui lòng thử lại.',
  timeout: 'Đọc danh mục quá thời gian. Vui lòng thử lại.', cancelled: 'Đã hủy đọc danh mục.',
  expired: 'Phiên không còn hợp lệ. Cần kiểm tra phiên hoặc đăng nhập lại.', forbidden: 'Máy chủ từ chối quyền quản trị của phiên này.',
  unavailable: 'Danh mục hiện chưa sẵn sàng. Vui lòng thử lại sau.', contract: 'Chưa đọc được danh mục hợp lệ. Vui lòng thử lại.',
};
export class AdminFailure extends Error {
  constructor(readonly code: AdminFailureCode) { super(messages[code]); }
}
const MAX_BYTES = 1024 * 1024;
async function readJson(response: Response, signal: AbortSignal, assertDeadline: () => void) {
  if (!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '')
    || Number(response.headers.get('content-length')) > MAX_BYTES) {
    void response.body?.cancel().catch(() => {}); throw new AdminFailure('contract');
  }
  let text = '';
  if (response.body) {
    const reader = response.body.getReader(), decoder = new TextDecoder('utf-8', { fatal: true });
    let bytes = 0, complete = false;
    try {
      for (;;) {
        assertDeadline();
        const part = await webAbortable(reader.read(), signal);
        assertDeadline();
        if (part.done) break;
        bytes += part.value.byteLength;
        if (bytes > MAX_BYTES) throw new AdminFailure('contract');
        text += decoder.decode(part.value, { stream: true });
      }
      text += decoder.decode(); complete = true;
    } catch (error) {
      if (error instanceof TypeError) throw new AdminFailure('contract');
      throw error;
    } finally { if (!complete) void reader.cancel().catch(() => {}); }
  } else {
    text = await webAbortable(response.text(), signal);
    assertDeadline();
    if (new TextEncoder().encode(text).byteLength > MAX_BYTES) throw new AdminFailure('contract');
  }
  try { return JSON.parse(text) as unknown; } catch { throw new AdminFailure('contract'); }
}
export function createAdminClient(apiBase: string, fetcher: typeof fetch = fetch, timeoutMs = 8000, pageOrigin?: string) {
  let configured = false;
  try {
    if (pageOrigin !== undefined) apiBase = resolveApiBase(apiBase, pageOrigin);
    const url = new URL(apiBase); configured = ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash;
  } catch { /* Fixed error below. */ }
  if (!Number.isInteger(timeoutMs) || timeoutMs < 10 || timeoutMs > 30_000) throw new AdminFailure('configuration');
  return {
    async catalog(signal: AbortSignal): Promise<AdminPlacesResponse> {
      if (!configured) throw new AdminFailure('configuration');
      if (signal.aborted) throw new AdminFailure('cancelled');
      const controller = new AbortController(), started = performance.now(); let timedOut = false;
      const cancel = () => controller.abort(); signal.addEventListener('abort', cancel, { once: true });
      const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
      const assertDeadline = () => {
        if (signal.aborted) throw new AdminFailure('cancelled');
        if (performance.now() - started >= timeoutMs) { timedOut = true; controller.abort(); throw new AdminFailure('timeout'); }
      };
      try {
        const response = await webAbortable(fetcher(`${apiBase.replace(/\/+$/, '')}/admin/places`, {
          method: 'GET', headers: { Accept: 'application/json' }, credentials: 'include', cache: 'no-store', redirect: 'error', signal: controller.signal,
        }), controller.signal);
        if (!response.ok) {
          void response.body?.cancel().catch(() => {});
          throw new AdminFailure(response.status === 401 ? 'expired' : response.status === 403 ? 'forbidden' : 'unavailable');
        }
        assertDeadline();
        const value = await readJson(response, controller.signal, assertDeadline);
        if (!isAdminPlacesResponse(value)) throw new AdminFailure('contract');
        assertDeadline();
        return value;
      } catch (error) {
        if (signal.aborted) throw new AdminFailure('cancelled');
        if (timedOut) throw new AdminFailure('timeout');
        throw error instanceof AdminFailure ? error : new AdminFailure('network');
      } finally { clearTimeout(timer); signal.removeEventListener('abort', cancel); controller.abort(); }
    },
  };
}

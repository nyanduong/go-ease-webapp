import { contentPageSchema, contentRecordSchema, type ContentRecord } from '@goease/contracts';
import { isAccountApiOrigin } from '@goease/trip-client/api-origin';

export async function publicContent(path: string, signal?: AbortSignal): Promise<unknown> {
  const base = import.meta.env.VITE_API_BASE_URL ?? '';
  if (!isAccountApiOrigin(base)) throw Error('Chưa cấu hình kho nội dung.');
  const response = await fetch(base + '/v1/content' + path, {
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(10000)])
      : AbortSignal.timeout(10000),
    redirect: 'error',
    credentials: 'omit',
  });
  if (!response.ok)
    throw Error(
      response.status === 404
        ? 'Nội dung chưa được công bố hoặc không còn hiển thị.'
        : 'Chưa tải được nội dung. Hãy thử lại.',
    );
  const raw = await response.text();
  if (raw.length > 2_000_000) throw Error('Nội dung vượt giới hạn tải.');
  return JSON.parse(raw);
}
export async function contentPage(query: URLSearchParams, signal?: AbortSignal) {
  const page = contentPageSchema.parse(await publicContent('?' + query.toString(), signal));
  return { ...page, items: page.items.filter((record) => record.entry.status === 'published') };
}
export async function contentDetail(id: string, signal?: AbortSignal): Promise<ContentRecord> {
  const record = contentRecordSchema.parse(
    await publicContent('/' + encodeURIComponent(id), signal),
  );
  if (record.entry.status !== 'published')
    throw Error('Nội dung chưa được công bố hoặc không còn hiển thị.');
  return record;
}

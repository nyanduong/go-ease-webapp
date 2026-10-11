export type AppVariant = 'development' | 'preview';

export function apiBaseUrl(value: string | undefined, variant: AppVariant): string {
  if (!value?.trim()) throw new Error('Thiếu EXPO_PUBLIC_API_BASE_URL. Xem hướng dẫn cấu hình mobile.');
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('Địa chỉ API không hợp lệ.'); }
  const ipv4 = /^\d+\.\d+\.\d+\.\d+$/.test(url.hostname) ? url.hostname.split('.').map(Number) : [];
  const privateIpv4 = ipv4.length === 4 && ipv4.every(part => part >= 0 && part <= 255)
    && (ipv4[0] === 10 || ipv4[0] === 192 && ipv4[1] === 168 || ipv4[0] === 172 && ipv4[1]! >= 16 && ipv4[1]! <= 31);
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]' || privateIpv4;
  if (url.username || url.password || url.search || url.hash
    || !(url.protocol === 'https:' || variant === 'development' && local && url.protocol === 'http:')) {
    throw new Error('API cần HTTPS; HTTP chỉ dùng mạng local trong development build. Không đặt credential trong URL.');
  }
  return url.href.replace(/\/+$/, '');
}

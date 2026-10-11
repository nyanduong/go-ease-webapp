export interface Environment {
  NODE_ENV: 'development' | 'test' | 'production';
  PORT: number;
  WEB_ORIGINS: string[];
  DATABASE_URL?: string;
  GOOGLE_WEB_CLIENT_ID?: string;
}

export function validateEnvironment(input: Record<string, unknown>): Environment {
  const mode = input.NODE_ENV ?? 'development';
  if (mode !== 'development' && mode !== 'test' && mode !== 'production') {
    throw new Error('NODE_ENV phải là development, test hoặc production.');
  }
  const rawPort = String(input.PORT ?? '3000');
  const port = Number(rawPort);
  if (!/^\d+$/.test(rawPort) || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT phải là số nguyên từ 1 đến 65535.');
  }
  const rawOrigins = input.WEB_ORIGINS ?? (mode === 'production' ? '' : 'http://localhost:5173,http://127.0.0.1:5173');
  if (typeof rawOrigins !== 'string' || !rawOrigins.trim()) {
    throw new Error('WEB_ORIGINS phải có ít nhất một origin.');
  }
  const origins = rawOrigins.split(',').map((origin) => origin.trim());
  for (const origin of origins) {
    let url: URL;
    try { url = new URL(origin); } catch { throw new Error('WEB_ORIGINS phải chứa origin HTTP/HTTPS hợp lệ.'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin || url.username || url.password) {
      throw new Error('WEB_ORIGINS chỉ chấp nhận origin HTTP/HTTPS, không chứa path, credentials hoặc wildcard.');
    }
  }
  const database = input.DATABASE_URL;
  const googleClient = input.GOOGLE_WEB_CLIENT_ID;
  if (database !== undefined && (typeof database !== 'string' || !/^postgres(?:ql)?:\/\//.test(database))) {
    throw new Error('DATABASE_URL phải là URL PostgreSQL phía server.');
  }
  if (googleClient !== undefined && (typeof googleClient !== 'string' || !/^[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(googleClient))) {
    throw new Error('GOOGLE_WEB_CLIENT_ID phải là client ID Google phía server.');
  }
  return { NODE_ENV: mode, PORT: port, WEB_ORIGINS: [...new Set(origins)],
    ...(database === undefined ? {} : { DATABASE_URL: database }),
    ...(googleClient === undefined ? {} : { GOOGLE_WEB_CLIENT_ID: googleClient }) };
}

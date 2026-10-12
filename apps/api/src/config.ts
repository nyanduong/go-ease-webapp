export interface Environment {
  NODE_ENV: 'development' | 'test' | 'production';
  PORT: number;
  HOST: '127.0.0.1' | '0.0.0.0';
  WEB_ORIGINS: string[];
  DATABASE_URL?: string;
  GOOGLE_WEB_CLIENT_ID?: string;
  GOOGLE_MAPS_SERVER_API_KEY?: string;
  MAPS_ROUTES_ENABLED?: true;
  GOEASE_NATIVE_TRIAL_EMAILS?: string[];
  GOEASE_LOCAL_STATE_DIR?: string;
}

export function validateEnvironment(input: Record<string, unknown>): Environment {
  const mode = input.NODE_ENV ?? 'development';
  if (mode !== 'development' && mode !== 'test' && mode !== 'production') {
    throw new Error('NODE_ENV phải là development, test hoặc production.');
  }
  const rawPort = String(input.PORT ?? '3000');
  const host = input.HOST ?? '127.0.0.1';
  if (host !== '127.0.0.1' && host !== '0.0.0.0') {
    throw new Error('HOST chỉ chấp nhận 127.0.0.1 hoặc 0.0.0.0 được khai báo rõ ràng.');
  }
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
  const mapsKey = input.GOOGLE_MAPS_SERVER_API_KEY;
  const mapsEnabled = input.MAPS_ROUTES_ENABLED;
  const trial = input.GOEASE_NATIVE_TRIAL_EMAILS;
  const state = input.GOEASE_LOCAL_STATE_DIR;
  let trialEmails: string[] | undefined;
  if (trial !== undefined) {
    if (mode !== 'production' && mode !== 'test') throw new Error('Native trial requires explicit production mode (test only in automated fixtures).');
    if (typeof trial !== 'string' || trial.length > 2560) throw new Error('GOEASE_NATIVE_TRIAL_EMAILS must explicitly list approved verified emails.');
    trialEmails = [...new Set(trial.split(',').map(value => value.trim().toLowerCase()))];
    if (!trialEmails.length || trialEmails.length > 10 || trialEmails.some(value => !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,63}$/.test(value) || value.length > 254)) {
      throw new Error('GOEASE_NATIVE_TRIAL_EMAILS is empty or invalid.');
    }
    if (host !== '127.0.0.1' || mapsEnabled === 'true') throw new Error('Native trial requires loopback and paid Routes disabled.');
    if (typeof state !== 'string' || !state.trim()) throw new Error('Native trial requires GOEASE_LOCAL_STATE_DIR.');
    if (database === undefined || googleClient === undefined) throw new Error('Native trial requires PostgreSQL and Google audience.');
  }
  if (state !== undefined && (typeof state !== 'string' || !state.trim())) throw new Error('GOEASE_LOCAL_STATE_DIR is invalid.');
  if (mapsKey !== undefined && (typeof mapsKey !== 'string' || !/^[A-Za-z0-9_-]{1,512}$/.test(mapsKey))) {
    throw new Error('GOOGLE_MAPS_SERVER_API_KEY phải là cấu hình server hợp lệ.');
  }
  if (mapsEnabled !== undefined && mapsEnabled !== 'true' && mapsEnabled !== 'false') {
    throw new Error('MAPS_ROUTES_ENABLED phải là true hoặc false.');
  }
  if (database !== undefined && (typeof database !== 'string' || !/^postgres(?:ql)?:\/\//.test(database))) {
    throw new Error('DATABASE_URL phải là URL PostgreSQL phía server.');
  }
  if (googleClient !== undefined && (typeof googleClient !== 'string' || !/^[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(googleClient))) {
    throw new Error('GOOGLE_WEB_CLIENT_ID phải là client ID Google phía server.');
  }
  return { NODE_ENV: mode, PORT: port, HOST: host, WEB_ORIGINS: [...new Set(origins)],
    ...(database === undefined ? {} : { DATABASE_URL: database }),
    ...(googleClient === undefined ? {} : { GOOGLE_WEB_CLIENT_ID: googleClient }),
    ...(mapsKey === undefined ? {} : { GOOGLE_MAPS_SERVER_API_KEY: mapsKey }),
    ...(trialEmails === undefined ? {} : { GOEASE_NATIVE_TRIAL_EMAILS: trialEmails }),
    ...(state === undefined ? {} : { GOEASE_LOCAL_STATE_DIR: state as string }),
    ...(mapsEnabled === 'true' ? { MAPS_ROUTES_ENABLED: true as const } : {}) };
}

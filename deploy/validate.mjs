/* global process, console */
import { pathToFileURL } from 'node:url';
export function stagingHost(value) {
  if (typeof value !== 'string' || value.length > 253 || value !== value.toLowerCase()
    || !value.includes('.') || !value.split('.').every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))
    || /^\d+(?:\.\d+){3}$/.test(value) || value.endsWith('.localhost') || value.endsWith('.example') || value.endsWith('.test')
    || value.endsWith('.invalid') || value === 'localhost'
    || ['example.com', 'example.net', 'example.org'].some(domain => value === domain || value.endsWith('.' + domain))) throw new Error('Owner-approved real DNS hostname required');
  return value;
}
export function publicClientId(value) {
  if (value === undefined || value === '') return '';
  if (!/^[0-9]+-[a-z0-9-]+\.apps\.googleusercontent\.com$/.test(value) || value.length > 256) throw new Error('Invalid public OAuth client ID');
  return value;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { publicClientId(process.env.VITE_GOOGLE_WEB_CLIENT_ID); console.info('Public build configuration validated.'); }
  catch { console.error('Invalid public build configuration.'); process.exitCode = 1; }
}

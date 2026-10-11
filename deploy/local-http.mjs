/* global setTimeout, clearTimeout */
import http from 'node:http';
import { URL } from 'node:url';
// CI probes connect only to an owned loopback HTTP fixture. Unlike fetch,
// node:http preserves the explicit Host needed to exercise nginx vhosts.
export function localHttpProbe(address, host) {
  const url = new URL(address);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.username || url.password) {
    throw new Error('HTTP probe requires the owned loopback fixture');
  }
  return new Promise((resolve, reject) => {
    const request = http.get(url, { headers: { Host: host }, timeout: 1000 }, response => {
      response.resume();
      response.once('end', () => resolve({
        status: response.statusCode,
        ok: response.statusCode >= 200 && response.statusCode < 300,
        headers: { get(name) {
          const value = response.headers[name.toLowerCase()];
          return typeof value === 'string' ? value : value?.join(', ') ?? null;
        } },
      }));
      response.once('error', () => reject(new Error('Owned HTTP fixture response failed')));
    });
    request.once('timeout', () => request.destroy(new Error('Owned HTTP fixture timed out')));
    request.once('error', () => reject(new Error('Owned HTTP fixture request failed')));
    const deadline = setTimeout(() => request.destroy(new Error('Owned HTTP fixture deadline exceeded')), 3000);
    request.once('close', () => clearTimeout(deadline));
  });
}

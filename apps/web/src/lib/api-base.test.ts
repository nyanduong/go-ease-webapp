import { describe, expect, it } from 'vitest';
import { resolveApiBase } from './api-base';
import { webAuthConfig } from './auth-client';
import { createAdminClient } from './admin-client';

describe('same-origin staging API configuration', () => {
  it('resolves /api against real HTTPS origin for auth and catalog transport', async () => {
    expect(resolveApiBase('/api/', 'https://admin.test')).toBe('https://admin.test/api');
    expect(webAuthConfig('123-test.apps.googleusercontent.com', '/api', 'https://admin.test').apiBase).toBe('https://admin.test/api');
    let requested = '';
    const client = createAdminClient('/api', async url => { requested = String(url); return new Response(null, { status: 403 }); }, 8000, 'https://admin.test');
    await expect(client.catalog(new AbortController().signal)).rejects.toMatchObject({ code: 'forbidden' });
    expect(requested).toBe('https://admin.test/api/admin/places');
  });
  it('rejects HTTP, other origins, authority-relative, credentials, query/hash and backslash normalization', () => {
    for (const value of ['http://admin.test/api', 'https://other.test/api', '//admin.test/api', '//other.test/api',
      'https://user:password@admin.test/api', '/api?private=value', '/api#x', '/api?', '/api#', '/ap\ni', '\\other.test\\api', ' /api']) {
      expect(() => resolveApiBase(value, 'https://admin.test')).toThrow();
    }
    expect(() => resolveApiBase('/api', 'http://admin.test')).toThrow();
  });
});

import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { test } from 'node:test';
import { OAuth2Client } from 'google-auth-library';
import { verifyGoogleToken, GoogleTokenVerifier } from '../src/modules/auth/google-verifier.js';
import { ApiFault } from '../src/common/api-fault.js';
import { ConfigService } from '@nestjs/config';
import { opaque } from '../src/modules/auth/crypto.js';
import type { Environment } from '../src/config.js';

const audience = 'test-client.apps.googleusercontent.com';
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const pem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
class OfflineGoogleClient extends OAuth2Client {
  override async getFederatedSignonCertsAsync() {
    type Format = Awaited<ReturnType<OAuth2Client['getFederatedSignonCertsAsync']>>['format'];
    return { certs: { 'test-only-key': pem }, format: 'PEM' as Format };
  }
}
const client = new OfflineGoogleClient();
const nonce = opaque();
function jwt(claims: Record<string, unknown> = {}, header: Record<string, unknown> = {}) {
  const now = Math.floor(Date.now() / 1000);
  const content = [JSON.stringify({ alg: 'RS256', kid: 'test-only-key', ...header }),
    JSON.stringify({ iss: 'https://accounts.google.com', aud: audience, sub: 'test-subject', iat: now - 1, exp: now + 3600, nonce, name: ' Người thử ', ...claims })]
    .map(part => Buffer.from(part).toString('base64url')).join('.');
  return `${content}.${sign('RSA-SHA256', Buffer.from(content), privateKey).toString('base64url')}`;
}
function invalid(error: unknown) { return error instanceof ApiFault && error.code === 'AUTH_INVALID_IDENTITY' && !error.message.includes('eyJ'); }

test('Google verifier uses real offline RS256 verification and stable sub, sanitizes display name', async () => {
  assert.deepEqual(await verifyGoogleToken(client, audience, jwt()), { subject: 'test-subject', displayName: 'Người thử', nonce });
  const identity = await verifyGoogleToken(client, audience, jwt({ name: `\u0000 ${'🌿'.repeat(140)}\n` }));
  assert.equal(Array.from(identity.displayName!).length, 120);
  assert.ok(!identity.displayName!.includes('\u0000'));
});
test('Google verifier rejects signature/issuer/audience/expiry/future iat/nonce/algorithm/subject without raw error leakage', async () => {
  const now = Math.floor(Date.now() / 1000);
  for (const token of [jwt().slice(0, -12) + 'AAAAAAAAAAAA', jwt({ iss: 'https://attacker.example' }), jwt({ aud: 'other-client' }),
    jwt({ exp: now - 1 }), jwt({ iat: now + 60 }), jwt({ nonce: undefined }), jwt({ nonce: 'wrong' }),
    jwt({ sub: '' }), jwt({ sub: '\u0000' }), jwt({ exp: String(now + 300) }), jwt({}, { kid: 'unknown' }), jwt({}, { alg: 'none' })]) {
    await assert.rejects(verifyGoogleToken(client, audience, token), invalid);
  }
});
test('verified email only comes from a signed, boolean-verified Google claim; missing/false/string cannot authorize a trial', async () => {
  assert.equal((await verifyGoogleToken(client, audience, jwt({ email: '  APPROVED@test.example ', email_verified: true }))).verifiedEmail, 'approved@test.example');
  for (const claims of [{}, { email: 'approved@test.example' }, { email: 'approved@test.example', email_verified: false },
    { email: 'approved@test.example', email_verified: 'true' }, { email: 'bad\n@test.example', email_verified: true }]) {
    assert.equal((await verifyGoogleToken(client, audience, jwt(claims))).verifiedEmail, undefined);
  }
});
test('Google SDK certificate retrieval is bounded and has no automatic retries; config missing makes no request', async () => {
  const verifier = new GoogleTokenVerifier(new ConfigService<Environment, true>({ GOOGLE_WEB_CLIENT_ID: audience }));
  // Test-only observation of the actual transport. No runtime URL or verification bypass.
  const actual = (verifier as unknown as { client: OAuth2Client }).client;
  let calls = 0;
  actual.transporter.defaults.adapter = async options => {
    calls++;
    assert.equal(options.timeout, 3500);
    assert.equal(options.retryConfig?.retry, 0);
    assert.equal(options.retryConfig?.noResponseRetries, 0);
    throw new Error('TEST ONLY certificate network unavailable');
  };
  await assert.rejects(verifier.verify(jwt()), error => error instanceof ApiFault && error.code === 'AUTH_PROVIDER_UNAVAILABLE');
  assert.equal(calls, 1);
  const missing = new GoogleTokenVerifier(new ConfigService<Environment, true>({}));
  assert.throws(() => missing.verify(jwt()), error => error instanceof ApiFault && error.code === 'AUTH_NOT_CONFIGURED');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readAccountProfile, validateProfile } from '@goease/trip-client/account-profile';
import { createAuthPilot } from '@goease/trip-client/auth-pilot-controller';
const id = '12345678-1234-4234-8234-123456789abc';
const token = {
  access_token: 'fixture.access.signature',
  refresh_token: 'fixture_refresh_123',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: 1800003600,
};
const baseUser = {
  id,
  aud: 'authenticated',
  role: 'authenticated',
  identities: [{ provider: 'google' }],
  email: 'me@example.test',
  user_metadata: {
    full_name: 'Tên Google',
    avatar_url: 'https://lh3.googleusercontent.com/photo',
    unrelated: 'preserve me',
  },
};
const response = (value) => new Response(JSON.stringify(value));
async function fixture() {
  const state = { user: structuredClone(baseUser), writes: [], defer: null };
  const auth = createAuthPilot({
    url: 'https://abcdefghijklmnopqrst.supabase.co',
    key: 'sb_publishable_offline_fixture_00000000',
    requiredProvider: 'google',
    now: () => 1800000000000,
    storage: { get: async () => token.refresh_token, set: async () => {}, remove: async () => {} },
    fetcher: async (url, init) => {
      if (url.endsWith('/user')) {
        if (init.method === 'PUT') {
          const body = JSON.parse(init.body);
          state.writes.push(body);
          if (!state.ignoreUpdate)
            state.user.user_metadata = { ...state.user.user_metadata, ...body.data };
          if (state.defer) await state.defer;
        }
        return response(state.user);
      }
      return response({ apiVersion: '1', identity: { id, provider: 'supabase' } });
    },
  });
  await auth.acceptOAuth(token);
  await auth.verifyBackend('https://api.goease.test');
  return { auth, state };
}
test('profile validates bounds and restricts avatar choices; provider metadata uses safe fallbacks', () => {
  assert.deepEqual(
    validateProfile({ displayName: '  Nyan  ', bio: '  Đi chơi  ', avatar: 'tent', role: 'admin' }),
    { displayName: 'Nyan', bio: 'Đi chơi', avatar: 'tent' },
  );
  for (const input of [
    { displayName: ' ' },
    { displayName: 'x'.repeat(81) },
    { displayName: 'Tên\nkhác' },
    { bio: 'x'.repeat(161) },
    { avatar: 'javascript:alert(1)' },
  ])
    assert.throws(() =>
      validateProfile({ displayName: 'Tên', bio: '', avatar: 'google', ...input }),
    );
  const profile = readAccountProfile(baseUser);
  assert.equal(profile.displayName, 'Tên Google');
  assert.equal(profile.googleAvatarUrl, 'https://lh3.googleusercontent.com/photo');
  for (const avatar_url of [
    'javascript:alert(1)',
    'http://lh3.googleusercontent.com/photo',
    'https://googleusercontent.com.evil.test/a',
    'https://user:pass@lh3.googleusercontent.com/a',
  ])
    assert.equal(
      readAccountProfile({ ...baseUser, user_metadata: { avatar_url } }).googleAvatarUrl,
      null,
    );
  assert.equal(readAccountProfile({}).displayName, 'Bạn đồng hành');
});
test('verified profile updates only display metadata and survives a subsequent provider read', async () => {
  const { auth, state } = await fixture();
  assert.equal((await auth.userProfile()).email, 'me@example.test');
  const input = { displayName: 'Tên mới', bio: 'Thích Đà Lạt', avatar: 'coffee' };
  assert.equal(
    (await auth.userProfile({ ...input, role: 'admin', email: 'other@example.test' })).displayName,
    'Tên mới',
  );
  assert.deepEqual(state.writes, [{ data: { goease_profile: input } }]);
  assert.equal(state.user.user_metadata.unrelated, 'preserve me');
  assert.equal((await auth.userProfile()).avatar, 'coffee');
  assert(!JSON.stringify(auth.snapshot()).includes('me@example.test'));
  await assert.rejects(auth.userProfile({ ...input, displayName: '' }));
  assert.equal(state.writes.length, 1);
});

test('uploaded avatar and cover persist as bounded URLs, rejecting data, script and untrusted paths', async () => {
  const { auth } = await fixture();
  const url =
    'https://api.goease.test/v1/profile-media/' +
    'a'.repeat(24) +
    '-12345678-1234-4234-8234-123456789abc.jpg';
  const fields = {
    displayName: 'Ảnh của tôi',
    bio: '',
    avatar: 'upload',
    avatarUrl: url,
    coverUrl: url,
  };
  assert.equal((await auth.userProfile(fields)).avatarUrl, url);
  assert.equal((await auth.userProfile()).coverUrl, url);
  for (const avatarUrl of [
    'data:image/jpeg;base64,AAAA',
    'javascript:alert(1)',
    'https://user:pass@api.goease.test/v1/profile-media/a.jpg',
    'https://api.goease.test/other.jpg',
    'http://remote.example/v1/profile-media/a.jpg',
  ])
    assert.throws(() => validateProfile({ ...fields, avatarUrl }));
  assert.throws(() => validateProfile({ ...fields, avatarUrl: null }));
});
test('late profile response after cancelling or changing session cannot restore private data', async () => {
  const { auth, state } = await fixture();
  let release;
  state.defer = new Promise((resolve) => {
    release = resolve;
  });
  const operation = auth.userProfile({ displayName: 'Tên trễ', bio: '', avatar: 'sun' });
  auth.cancel();
  release();
  await assert.rejects(operation);
  assert.equal(auth.snapshot().userId, null);
  assert.notEqual(auth.snapshot().phase, 'backend-verified');
  await assert.rejects(auth.userProfile());
});

test('an unconfirmed metadata update never reports successful profile save', async () => {
  const { auth, state } = await fixture();
  state.ignoreUpdate = true;
  await assert.rejects(auth.userProfile({ displayName: 'Chưa xác nhận', bio: '', avatar: 'sun' }));
  assert.equal((await auth.userProfile()).displayName, 'Tên Google');
  assert.equal(auth.snapshot().phase, 'backend-verified');
});

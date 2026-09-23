import assert from 'node:assert/strict';
import test from 'node:test';
import { createAuthService } from '../src/features/auth/service.js';
import { createBrowserSupabase } from '../src/shared/supabase.js';

const userId = '11111111-1111-4111-8111-111111111111';
const identity = {
  user: { id: userId, email: 'user@example.com', private: true },
  profile: {
    id: userId,
    full_name: 'Test User',
    role: 'student',
    created_at: '2026-09-23T00:00:00Z',
    updated_at: '2026-09-23T00:00:00Z',
    private: true,
  },
};

test('registration delegates password handling and profile metadata to Supabase Auth only', async () => {
  let signup;
  const data = { user: { id: userId }, session: null };
  const service = createAuthService({
    supabase: {
      auth: {
        signUp: async (values) => {
          signup = values;
          return { data, error: null };
        },
      },
    },
    redirectUrl: 'http://localhost:3000/login',
  });
  assert.equal(
    await service.register({
      fullName: ' Test User ',
      email: ' user@example.com ',
      password: ' exact password ',
      role: 'student',
    }),
    data,
  );
  assert.deepEqual(signup, {
    email: 'user@example.com',
    password: ' exact password ',
    options: {
      data: { full_name: 'Test User', role: 'student' },
      emailRedirectTo: 'http://localhost:3000/login',
    },
  });
});

test('login and local logout use SDK operations and propagate typed errors', async () => {
  let login;
  let logout;
  const failure = Object.assign(new Error('wrong password'), { code: 'invalid_credentials' });
  const service = createAuthService({
    supabase: {
      auth: {
        signInWithPassword: async (values) => {
          login = values;
          return { data: null, error: failure };
        },
        signOut: async (values) => {
          logout = values;
          return { error: null };
        },
      },
    },
  });
  await assert.rejects(
    service.login({ email: ' user@example.com ', password: 'exact password' }),
    (error) => error === failure,
  );
  assert.deepEqual(login, { email: 'user@example.com', password: 'exact password' });
  await service.logout();
  assert.deepEqual(logout, { scope: 'local' });
});

test('identity requests pass the user token and reject mismatched IDs without exposing private fields', async () => {
  let response = identity;
  let received;
  const service = createAuthService({
    supabase: {},
    apiClient: {
      get: async (...args) => {
        received = args;
        return response;
      },
    },
  });
  const result = await service.getIdentity('access-token');
  assert.deepEqual(received, ['/auth/me', { headers: { Authorization: 'Bearer access-token' } }]);
  assert.equal(result.user.private, undefined);
  assert.equal(result.profile.private, undefined);
  response = {
    ...identity,
    profile: { ...identity.profile, id: '22222222-2222-4222-8222-222222222222' },
  };
  await assert.rejects(service.getIdentity('access-token'), /IDs must match/);
});

test('sessions and subscriptions remain owned by Supabase and disabled auth is explicit', async () => {
  const session = { access_token: 'token' };
  let subscribed;
  let unsubscribed = 0;
  const service = createAuthService({
    supabase: {
      auth: {
        getSession: async () => ({ data: { session }, error: null }),
        onAuthStateChange: (callback) => {
          subscribed = callback;
          return {
            data: {
              subscription: {
                unsubscribe: () => {
                  unsubscribed += 1;
                },
              },
            },
          };
        },
      },
    },
  });
  assert.equal(await service.getSession(), session);
  const listener = () => {};
  service.subscribe(listener)();
  assert.equal(subscribed, listener);
  assert.equal(unsubscribed, 1);
  const disabled = createAuthService({ supabase: null });
  assert.equal(disabled.configured, false);
  assert.equal(await disabled.getSession(), null);
  assert.doesNotThrow(disabled.subscribe(listener));
  await assert.rejects(
    disabled.login({ email: 'test@example.com', password: 'password' }),
    (error) => error.code === 'AUTH_NOT_CONFIGURED',
  );
});

test('browser Supabase config accepts public keys and enables browser session lifecycle', () => {
  let args;
  const client = {};
  const factory = (...values) => {
    args = values;
    return client;
  };
  assert.equal(createBrowserSupabase({ supabaseUrl: '', supabaseKey: '' }, factory), null);
  const config = { supabaseUrl: 'https://example.supabase.co', supabaseKey: 'sb_publishable_test' };
  assert.equal(createBrowserSupabase(config, factory), client);
  assert.deepEqual(args, [
    config.supabaseUrl,
    config.supabaseKey,
    {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    },
  ]);
  const anon = `header.${Buffer.from(JSON.stringify({ role: 'anon' })).toString('base64url')}.signature`;
  assert.equal(
    createBrowserSupabase({ supabaseUrl: 'http://127.0.0.1:54321', supabaseKey: anon }, factory),
    client,
  );
});

test('browser Supabase config rejects privileged keys and credential-bearing or non-project URLs', () => {
  let constructions = 0;
  const forbiddenFactory = () => {
    constructions += 1;
    return {};
  };
  for (const supabaseKey of [
    'sb_secret_value',
    'sb_publishable_',
    'sb_publishable_has spaces',
    `header.${Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url')}.signature`,
  ]) {
    assert.throws(() =>
      createBrowserSupabase(
        { supabaseUrl: 'https://example.supabase.co', supabaseKey },
        forbiddenFactory,
      ),
    );
  }
  for (const supabaseUrl of [
    'bad url',
    'http://example.com',
    'https://user:password@example.com',
    'https://example.com/path',
    'https://example.com?key=secret',
  ]) {
    assert.throws(() =>
      createBrowserSupabase({ supabaseUrl, supabaseKey: 'sb_publishable_test' }, forbiddenFactory),
    );
  }
  assert.equal(constructions, 0);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { createApp } from '../src/app.js';
import { readSupabaseConfig } from '../src/config.js';
import { createSupabaseAuthService } from '../src/modules/auth/service.js';

const config = { url: 'https://example.supabase.co', publishableKey: 'sb_publishable_test' };
const userOne = '11111111-1111-4111-8111-111111111111';
const userTwo = '22222222-2222-4222-8222-222222222222';
const firstToken = 'header.first.signature';
const secondToken = 'header.second.signature';
const profile = (id, role = 'student') => ({
  id,
  full_name: 'Test User',
  role,
  created_at: '2026-09-23T10:00:00.000Z',
  updated_at: '2026-09-23T10:00:00.000Z',
});

async function request(
  app,
  { token, authorization, method = 'GET', url = '/api/auth/me', rawHeaders } = {},
) {
  const response = {
    writeHead(status, headers) {
      this.status = status;
      this.headers = headers;
    },
    end(body) {
      this.body = body;
    },
  };
  const header = authorization ?? (token ? `Bearer ${token}` : undefined);
  await app({ url, method, headers: { authorization: header }, rawHeaders }, response);
  return { ...response, json: response.body ? JSON.parse(response.body) : null };
}

function fixture({ getUser, findProfile, clientFactory } = {}) {
  const clients = [];
  const queries = [];
  const logged = [];
  const authService = createSupabaseAuthService({
    config,
    clientFactory:
      clientFactory ??
      ((url, key, options) => {
        clients.push({ url, key, options });
        let verifiedId;
        return {
          auth: {
            async getUser(token) {
              const id = token === secondToken ? userTwo : userOne;
              const result = getUser
                ? await getUser(token)
                : {
                    data: {
                      user: {
                        id,
                        email: `${id}@example.com`,
                        user_metadata: { role: 'business', full_name: 'Untrusted metadata' },
                        private_field: 'private auth value',
                      },
                    },
                    error: null,
                  };
              verifiedId = result.data?.user?.id;
              return result;
            },
          },
          from(table) {
            return {
              select(columns) {
                return {
                  eq(column, id) {
                    queries.push({ table, columns, column, id, verifiedId });
                    return {
                      async maybeSingle() {
                        if (findProfile) return findProfile(id);
                        return {
                          data: { ...profile(id), private_field: 'private profile value' },
                          error: null,
                        };
                      },
                    };
                  },
                };
              },
            };
          },
        };
      }),
  });
  return {
    clients,
    queries,
    logged,
    app: createApp({ authService, logger: { error: (...args) => logged.push(args) } }),
  };
}

test('unconfigured services return actionable 503 while health keeps working', async () => {
  const app = createApp();
  const response = await request(app);
  assert.equal(response.status, 503);
  assert.equal(response.json.error.code, 'AUTH_NOT_CONFIGURED');
  assert.equal((await request(app, { url: '/api/health' })).status, 200);
  assert.equal((await request(app, { url: '/api/tasks' })).status, 503);
});

test('verified users get their own database profiles with isolated clients and no metadata role trust', async () => {
  const { app, clients, queries } = fixture();
  const [first, second] = await Promise.all([
    request(app, { token: firstToken, url: `/api/auth/me?id=${userTwo}&role=business` }),
    request(app, { token: secondToken }),
  ]);
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  for (const [response, id] of [
    [first, userOne],
    [second, userTwo],
  ]) {
    assert.deepEqual(response.json, {
      data: { user: { id, email: `${id}@example.com` }, profile: profile(id) },
    });
    assert.equal(response.headers['Cache-Control'], 'no-store');
  }
  assert.equal(clients.length, 2);
  assert.deepEqual(
    clients.map((client) => client.options.global.headers.Authorization),
    [`Bearer ${firstToken}`, `Bearer ${secondToken}`],
  );
  for (const client of clients) {
    assert.equal(client.url, config.url);
    assert.equal(client.key, config.publishableKey);
    assert.deepEqual(client.options.auth, {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    });
  }
  assert.deepEqual(
    queries.map((query) => query.id),
    [userOne, userTwo],
  );
  for (const query of queries) {
    assert.equal(query.id, query.verifiedId);
    assert.equal(query.table, 'profiles');
    assert.equal(query.column, 'id');
    assert.equal(query.columns, 'id,full_name,role,created_at,updated_at');
  }
});

test('malformed, missing and duplicate authorization is rejected before making an upstream request', async () => {
  const { app, clients } = fixture();
  for (const authorization of [
    undefined,
    '',
    'Basic a.b.c',
    'Bearer unsigned',
    'Bearer a.b.',
    'Bearer a.b.c extra',
    'Bearer  a.b.c',
    `Bearer ${'x'.repeat(16_384)}`,
    ['Bearer a.b.c'],
  ]) {
    const response = await request(app, { authorization });
    assert.equal(response.status, 401);
    assert.equal(response.json.error.code, 'UNAUTHORIZED');
  }
  const duplicate = await request(app, {
    token: firstToken,
    rawHeaders: ['Authorization', `Bearer ${firstToken}`, 'authorization', `Bearer ${secondToken}`],
  });
  assert.equal(duplicate.status, 401);
  assert.equal(clients.length, 0);
});

test('expired or forged tokens are verified remotely and rejected without profile reads', async () => {
  for (const authError of [
    { status: 401 },
    { status: 403 },
    { status: 400 },
    { code: 'user_not_found' },
  ]) {
    const { app, queries } = fixture({
      getUser: async () => ({
        data: { user: null },
        error: { ...authError, message: 'sensitive token detail' },
      }),
    });
    const response = await request(app, { token: firstToken });
    assert.equal(response.status, 401);
    assert.equal(response.json.error.code, 'UNAUTHORIZED');
    assert.equal(queries.length, 0);
    assert.doesNotMatch(response.body, /sensitive/);
  }
});

test('missing profile has a specific actionable response', async () => {
  const { app } = fixture({ findProfile: async () => ({ data: null, error: null }) });
  const response = await request(app, { token: firstToken });
  assert.equal(response.status, 404);
  assert.equal(response.json.error.code, 'PROFILE_NOT_FOUND');
});

test('upstream failures and inconsistent profiles return sanitized 503 without logging secrets', async () => {
  const fail = async () => {
    throw new Error('secret database or token details');
  };
  for (const options of [
    {
      clientFactory: () => {
        throw new Error('secret client details');
      },
    },
    { getUser: fail },
    {
      getUser: async () => ({ data: null, error: { status: 500, message: 'secret auth details' } }),
    },
    {
      getUser: async () => ({
        data: null,
        error: { status: 429, message: 'secret rate limit details' },
      }),
    },
    { findProfile: fail },
    { findProfile: async () => ({ data: null, error: { message: 'secret database details' } }) },
    { findProfile: async () => ({ data: profile(userTwo), error: null }) },
    { findProfile: async () => ({ data: { ...profile(userOne), role: 'admin' }, error: null }) },
  ]) {
    const { app, logged } = fixture(options);
    const response = await request(app, { token: firstToken });
    assert.equal(response.status, 503);
    assert.equal(response.json.error.code, 'AUTH_UNAVAILABLE');
    assert.doesNotMatch(response.body, /secret/);
    assert.deepEqual(logged, []);
  }
});

test('auth routes enforce methods and preserve HEAD behavior', async () => {
  const { app, clients } = fixture();
  const unsupported = await request(app, { token: firstToken, method: 'POST' });
  assert.equal(unsupported.status, 405);
  assert.equal(unsupported.headers.Allow, 'GET, HEAD');
  assert.equal(clients.length, 0);
  const get = await request(app, { token: firstToken });
  const head = await request(app, { token: firstToken, method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.deepEqual(head.headers, get.headers);
  assert.equal(head.body, undefined);
  assert.equal((await request(app, { token: firstToken, url: '/api/auth/unknown' })).status, 404);
});

test('Supabase configuration accepts public keys and rejects privileged or invalid settings', () => {
  const legacyKey = (role) =>
    `header.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.signature`;
  assert.equal(readSupabaseConfig({}), null);
  assert.equal(readSupabaseConfig({ SUPABASE_URL: '', SUPABASE_PUBLISHABLE_KEY: '' }), null);
  assert.deepEqual(
    readSupabaseConfig({
      SUPABASE_URL: `${config.url}/`,
      SUPABASE_PUBLISHABLE_KEY: config.publishableKey,
    }),
    config,
  );
  assert.deepEqual(
    readSupabaseConfig({
      SUPABASE_URL: 'http://127.0.0.1:54321',
      SUPABASE_ANON_KEY: legacyKey('anon'),
    }),
    {
      url: 'http://127.0.0.1:54321',
      publishableKey: legacyKey('anon'),
    },
  );
  for (const SUPABASE_URL of [
    'bad url',
    'http://example.com',
    'https://user:password@example.com',
    'https://example.com/path',
    'https://example.com?key=secret',
  ]) {
    assert.throws(
      () => readSupabaseConfig({ SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY: config.publishableKey }),
      /SUPABASE_URL/,
    );
  }
  for (const SUPABASE_PUBLISHABLE_KEY of [
    'sb_secret_private',
    legacyKey('service_role'),
    legacyKey('authenticated'),
    'broken.key.jwt',
    'invalid',
  ]) {
    assert.throws(
      () => readSupabaseConfig({ SUPABASE_URL: config.url, SUPABASE_PUBLISHABLE_KEY }),
      /publishable or legacy anon key/,
    );
  }
  assert.throws(() => readSupabaseConfig({ SUPABASE_URL: config.url }), /Set both/);
  assert.throws(
    () => readSupabaseConfig({ SUPABASE_PUBLISHABLE_KEY: config.publishableKey }),
    /Set both/,
  );
});

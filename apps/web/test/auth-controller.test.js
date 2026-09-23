import assert from 'node:assert/strict';
import test from 'node:test';
import { createAuthController } from '../src/features/auth/controller.js';
import { createInitialState } from '../src/app/initial-state.js';
import { createStore } from '../src/app/store.js';

const id = '11111111-1111-4111-8111-111111111111';
const identity = {
  user: { id, email: 'user@example.com' },
  profile: {
    id,
    full_name: 'Test User',
    role: 'student',
    created_at: '2026-09-23T00:00:00Z',
    updated_at: '2026-09-23T00:00:00Z',
  },
};
const session = { access_token: 'header.payload.signature' };
const form = {
  fullName: 'Test User',
  email: 'user@example.com',
  password: 'test-password',
  role: 'business',
};

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

const flushTimers = () => new Promise((resolve) => setTimeout(resolve, 5));

function fixture(overrides = {}) {
  const store = createStore(createInitialState());
  const calls = {
    identity: [],
    register: [],
    login: [],
    logout: 0,
    unsubscribe: 0,
    authenticated: [],
    signedOut: 0,
    renders: 0,
  };
  let callback = () => {};
  const service = {
    configured: true,
    getSession: async () => null,
    getIdentity: async (token) => {
      calls.identity.push(token);
      return identity;
    },
    register: async (values) => {
      calls.register.push(values);
      return { user: identity.user, session: null };
    },
    login: async (values) => {
      calls.login.push(values);
      return { user: identity.user, session };
    },
    logout: async () => {
      calls.logout += 1;
    },
    subscribe(listener) {
      callback = listener;
      return () => {
        calls.unsubscribe += 1;
      };
    },
    ...overrides,
  };
  const controller = createAuthController({
    store,
    service,
    render: () => {
      calls.renders += 1;
    },
    onAuthenticated: (value) => calls.authenticated.push(value),
    onSignedOut: () => {
      calls.signedOut += 1;
    },
  });
  return { store, calls, service, controller, emit: (event, value) => callback(event, value) };
}

test('signup requiring email confirmation leaves no identity and does not navigate', async (t) => {
  const { controller, store, calls } = fixture();
  t.after(() => controller.dispose());
  await controller.start();
  assert.equal(await controller.register(form), true);
  assert.equal(store.getState().auth.status, 'anonymous');
  assert.equal(store.getState().auth.user, null);
  assert.equal(store.getState().auth.profile, null);
  assert.match(store.getState().auth.notice, /почту/);
  assert.equal(store.getState().auth.busy, false);
  assert.equal(calls.register.length, 1);
  assert.deepEqual(calls.identity, []);
  assert.deepEqual(calls.authenticated, []);
});

test('successful login uses backend identity and role, never the role submitted by the form', async (t) => {
  const { controller, store, calls } = fixture();
  t.after(() => controller.dispose());
  await controller.start();
  assert.equal(await controller.login(form), true);
  assert.equal(store.getState().auth.status, 'authenticated');
  assert.equal(store.getState().role, 'student');
  assert.deepEqual(store.getState().auth.profile, identity.profile);
  assert.deepEqual(calls.identity, [session.access_token]);
  assert.deepEqual(calls.authenticated, [identity]);
  assert.equal(store.getState().auth.busy, false);
});

test('duplicate form submissions are ignored while authentication is busy', async (t) => {
  const waiting = deferred();
  let submissions = 0;
  const { controller, store } = fixture({
    login: () => {
      submissions += 1;
      return waiting.promise;
    },
  });
  t.after(() => controller.dispose());
  await controller.start();
  const first = controller.login(form);
  assert.equal(store.getState().auth.busy, true);
  assert.equal(await controller.login(form), false);
  assert.equal(submissions, 1);
  waiting.resolve({ session });
  assert.equal(await first, true);
  assert.equal(store.getState().auth.busy, false);
});

test('restore verifies saved sessions with the backend and can retry a temporary profile failure', async (t) => {
  let attempts = 0;
  const { controller, store, calls } = fixture({
    getSession: async () => session,
    getIdentity: async () => {
      attempts += 1;
      if (attempts === 1)
        throw Object.assign(new Error('private server message'), { code: 'AUTH_UNAVAILABLE' });
      return identity;
    },
  });
  t.after(() => controller.dispose());
  assert.equal(await controller.start(), false);
  assert.equal(store.getState().auth.status, 'error');
  assert.equal(store.getState().auth.user, null);
  assert.equal(store.getState().auth.profile, null);
  assert.doesNotMatch(store.getState().auth.error, /private/);
  assert.deepEqual(calls.authenticated, []);
  assert.equal(await controller.retry(), true);
  assert.equal(store.getState().auth.status, 'authenticated');
  assert.equal(attempts, 2);
});

test('auth callbacks schedule profile work outside the SDK callback and coalesce duplicate sessions', async (t) => {
  const waiting = deferred();
  let insideCallback = false;
  let identityCalls = 0;
  const { controller, emit } = fixture({
    getIdentity: () => {
      assert.equal(insideCallback, false);
      identityCalls += 1;
      return waiting.promise;
    },
  });
  t.after(() => controller.dispose());
  await controller.start();
  insideCallback = true;
  assert.equal(emit('SIGNED_IN', session), undefined);
  emit('TOKEN_REFRESHED', session);
  insideCallback = false;
  assert.equal(identityCalls, 0);
  await flushTimers();
  assert.equal(identityCalls, 1);
  waiting.resolve(identity);
  await flushTimers();
});

test('logout clears identity and personal state but keeps the shared catalogue', async (t) => {
  const { controller, store, calls } = fixture({ getSession: async () => session });
  t.after(() => controller.dispose());
  await controller.start();
  store.update((state) => ({
    ...state,
    savedTaskIds: [5],
    proposalSent: true,
    catalog: { items: [{ id: 7 }], status: 'ready', error: '' },
  }));
  await controller.logout();
  assert.equal(store.getState().auth.status, 'anonymous');
  assert.equal(store.getState().auth.user, null);
  assert.deepEqual(store.getState().savedTaskIds, []);
  assert.equal(store.getState().proposalSent, false);
  assert.deepEqual(store.getState().catalog.items, [{ id: 7 }]);
  assert.equal(calls.signedOut, 1);
});

test('token refresh preserves personal state but a different verified account clears it', async (t) => {
  const secondId = '22222222-2222-4222-8222-222222222222';
  const secondIdentity = {
    user: { id: secondId, email: 'second@example.com' },
    profile: { ...identity.profile, id: secondId, role: 'business' },
  };
  const { controller, store, emit } = fixture({
    getSession: async () => session,
    getIdentity: async (token) =>
      token === 'second.account.signature' ? secondIdentity : identity,
  });
  t.after(() => controller.dispose());
  await controller.start();
  store.update((state) => ({ ...state, savedTaskIds: [5], proposalSent: true }));
  emit('TOKEN_REFRESHED', { access_token: 'refresh.payload.signature' });
  await flushTimers();
  assert.deepEqual(store.getState().savedTaskIds, [5]);
  emit('SIGNED_IN', { access_token: 'second.account.signature' });
  await flushTimers();
  assert.equal(store.getState().auth.user.id, secondId);
  assert.equal(store.getState().role, 'business');
  assert.deepEqual(store.getState().savedTaskIds, []);
  assert.equal(store.getState().proposalSent, false);
});

test('a profile request resolving after signout cannot restore identity', async (t) => {
  const waiting = deferred();
  const { controller, store, emit, calls } = fixture({ getIdentity: () => waiting.promise });
  t.after(() => controller.dispose());
  await controller.start();
  emit('SIGNED_IN', session);
  await flushTimers();
  emit('SIGNED_OUT', null);
  waiting.resolve(identity);
  await flushTimers();
  assert.equal(store.getState().auth.status, 'anonymous');
  assert.equal(store.getState().auth.user, null);
  assert.deepEqual(calls.authenticated, []);
});

test('a queued sign-in callback cannot reauthenticate after a newer signout', async (t) => {
  const { controller, store, emit, calls } = fixture();
  t.after(() => controller.dispose());
  await controller.start();
  emit('SIGNED_IN', session);
  emit('SIGNED_OUT', null);
  await flushTimers();
  assert.equal(store.getState().auth.status, 'anonymous');
  assert.equal(store.getState().auth.user, null);
  assert.deepEqual(calls.authenticated, []);
});

test('a delayed initial session cannot reauthenticate after a newer signout', async (t) => {
  const waiting = deferred();
  const { controller, store, emit, calls } = fixture({ getSession: () => waiting.promise });
  t.after(() => controller.dispose());
  const startup = controller.start();
  emit('SIGNED_OUT', null);
  waiting.resolve(session);
  await startup;
  await flushTimers();
  assert.equal(store.getState().auth.status, 'anonymous');
  assert.deepEqual(calls.authenticated, []);
});

test('a delayed login response cannot reauthenticate after a newer signout', async (t) => {
  const waiting = deferred();
  const { controller, store, emit, calls } = fixture({ login: () => waiting.promise });
  t.after(() => controller.dispose());
  await controller.start();
  const login = controller.login(form);
  emit('SIGNED_OUT', null);
  waiting.resolve({ session });
  await login;
  assert.equal(store.getState().auth.status, 'anonymous');
  assert.deepEqual(calls.authenticated, []);
});

test('a stale session restore failure cannot erase a newer verified login', async (t) => {
  const waiting = deferred();
  const { controller, store, emit } = fixture({ getSession: () => waiting.promise });
  t.after(() => controller.dispose());
  const startup = controller.start();
  emit('SIGNED_IN', session);
  await flushTimers();
  assert.equal(store.getState().auth.status, 'authenticated');
  waiting.reject(new Error('obsolete restore failure'));
  await startup;
  assert.equal(store.getState().auth.status, 'authenticated');
  assert.deepEqual(store.getState().auth.user, identity.user);
  assert.equal(store.getState().auth.error, '');
});

test('an old login completion cannot clear the busy flag of a newer login after signout', async (t) => {
  const oldRequest = deferred();
  const newRequest = deferred();
  let attempts = 0;
  const { controller, store, emit } = fixture({
    login: () => {
      attempts += 1;
      return attempts === 1 ? oldRequest.promise : newRequest.promise;
    },
  });
  t.after(() => controller.dispose());
  await controller.start();
  const first = controller.login(form);
  emit('SIGNED_OUT', null);
  const second = controller.login(form);
  assert.equal(store.getState().auth.busy, true);
  oldRequest.reject(
    Object.assign(new Error('stale login failure'), { code: 'invalid_credentials' }),
  );
  await first;
  assert.equal(store.getState().auth.busy, true);
  assert.equal(store.getState().auth.error, '');
  newRequest.resolve({ session });
  assert.equal(await second, true);
  assert.equal(store.getState().auth.busy, false);
});

test('disposal unsubscribes, cancels scheduled events and ignores late profile results', async () => {
  const waiting = deferred();
  const { controller, store, emit, calls } = fixture({ getIdentity: () => waiting.promise });
  await controller.start();
  emit('SIGNED_IN', session);
  await flushTimers();
  emit('TOKEN_REFRESHED', { access_token: 'new.token.signature' });
  const previousState = structuredClone(store.getState());
  const previousRenders = calls.renders;
  controller.dispose();
  waiting.resolve(identity);
  emit('SIGNED_OUT', null);
  await flushTimers();
  assert.equal(calls.unsubscribe, 1);
  assert.equal(calls.renders, previousRenders);
  assert.deepEqual(store.getState(), previousState);
  assert.deepEqual(calls.authenticated, []);
});

test('invalid registration data and unavailable configuration never call signup', async (t) => {
  const { controller, calls } = fixture();
  t.after(() => controller.dispose());
  await controller.start();
  for (const invalid of [
    { ...form, fullName: '' },
    { ...form, fullName: 'x'.repeat(121) },
    { ...form, role: 'admin' },
    { ...form, password: 'short' },
  ]) {
    assert.equal(await controller.register(invalid), false);
  }
  assert.deepEqual(calls.register, []);
  const unavailable = fixture({ configured: false });
  t.after(() => unavailable.controller.dispose());
  await unavailable.controller.start();
  assert.equal(await unavailable.controller.register(form), false);
  assert.deepEqual(unavailable.calls.register, []);
});

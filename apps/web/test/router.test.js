import assert from 'node:assert/strict';
import test from 'node:test';
import { demoTasks } from '@ai-sana/contracts/fixtures';
import { createInitialState } from '../src/app/initial-state.js';
import { createRouter, isAuthCallbackHash, parseRoute } from '../src/app/router.js';
import { createStore } from '../src/app/store.js';

function authRouter(
  t,
  { hash, status = 'anonymous', profileRole = 'business', selectedRole = 'business' },
) {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const events = new EventTarget();
  const replacements = [];
  const location = { hash };
  globalThis.window = {
    location,
    history: {
      replaceState(_data, _title, nextHash) {
        replacements.push(nextHash);
        location.hash = nextHash;
      },
    },
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
    scrollTo() {},
  };
  globalThis.document = { title: '' };
  const initialState = createInitialState();
  initialState.role = selectedRole;
  initialState.catalog = { status: 'ready', items: structuredClone(demoTasks), error: '' };
  initialState.auth = {
    ...initialState.auth,
    configured: true,
    status,
    user:
      status === 'authenticated' ? { id: 'verified-user', email: 'verified@example.com' } : null,
    profile:
      status === 'authenticated'
        ? { id: 'verified-user', full_name: 'Проверенный пользователь', role: profileRole }
        : null,
  };
  const store = createStore(initialState);
  const root = { innerHTML: '' };
  const router = createRouter({
    root,
    store,
    feedback: { closeModal() {} },
    motion: { init() {} },
  });
  t.after(() => {
    router.dispose();
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  });
  return { root, router, store, location, replacements };
}

test('hash routes preserve task IDs and the default entry points', () => {
  assert.deepEqual(parseRoute(''), { name: 'home', taskId: 2 });
  assert.deepEqual(parseRoute('#/detail'), { name: 'detail', taskId: 2 });
  assert.deepEqual(parseRoute('#/detail?id=3'), { name: 'detail', taskId: 3 });
});

test('router renders the selected task, falls back for unknown routes and cleans up listeners', (t) => {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  t.after(() => {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  });

  const events = new EventTarget();
  let scrolls = 0;
  let closedModals = 0;
  globalThis.window = {
    location: { hash: '#/detail?id=1' },
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
    scrollTo() {
      scrolls += 1;
    },
  };
  globalThis.document = { title: '' };
  const initialState = createInitialState();
  initialState.savedTaskIds = [1];
  initialState.catalog = { status: 'ready', items: structuredClone(demoTasks), error: '' };
  const store = createStore(initialState);
  const root = { innerHTML: '' };
  const router = createRouter({
    root,
    store,
    feedback: {
      closeModal() {
        closedModals += 1;
      },
    },
    motion: {
      init(element) {
        assert.equal(element, root);
      },
    },
  });
  router.start();
  assert.equal(store.getState().currentTaskId, 1);
  assert.equal(store.getState().saved, true);
  assert.ok(root.innerHTML.includes(`<h1>${demoTasks[0].title}</h1>`));
  router.navigate('detail?id=1');
  assert.equal(closedModals, 1, 'same-route navigation still closes an open modal');
  router.navigate('detail?id=3');
  events.dispatchEvent(new Event('hashchange'));
  assert.equal(store.getState().currentTaskId, 3);
  assert.equal(store.getState().saved, false, 'saving task 1 does not save task 3');
  assert.ok(root.innerHTML.includes(`<h1>${demoTasks[2].title}</h1>`));
  assert.ok(scrolls > 0);

  globalThis.window.location.hash = '#/__proto__';
  events.dispatchEvent(new Event('hashchange'));
  assert.ok(root.innerHTML.includes('landing-v2'));
  assert.equal(globalThis.document.title, 'AI Sana — реальные задачи, реальный опыт');

  router.dispose();
  const previousHtml = root.innerHTML;
  globalThis.window.location.hash = '#/detail?id=4';
  events.dispatchEvent(new Event('hashchange'));
  assert.equal(root.innerHTML, previousHtml);
});

test('anonymous users reach login instead of private profile or business content', (t) => {
  const { root, router, location, replacements } = authRouter(t, { hash: '#/profile' });
  for (const page of ['profile', 'dashboard']) {
    location.hash = `#/${page}`;
    router.render();
    assert.equal(location.hash, '#/login');
    assert.equal(replacements.at(-1), '#/login');
    assert.match(root.innerHTML, /id="login-form"/);
    assert.doesNotMatch(
      root.innerHTML,
      /class="profile-details"|Панель бизнеса|data-action="logout"/,
    );
  }
});

test('initializing auth keeps private content hidden without redirecting before session restoration', (t) => {
  const { root, router, location, replacements } = authRouter(t, {
    hash: '#/profile',
    status: 'initializing',
  });
  for (const page of ['profile', 'dashboard']) {
    location.hash = `#/${page}`;
    router.render();
    assert.match(root.innerHTML, /class="auth-loading"/);
    assert.match(root.innerHTML, /role="status"/);
    assert.doesNotMatch(root.innerHTML, /class="profile-details"|Панель бизнеса|id="login-form"/);
    assert.equal(location.hash, `#/${page}`);
  }
  assert.deepEqual(replacements, []);
});

test('verified profile role controls private access even when signup role has a different value', (t) => {
  const { root, router, location, replacements } = authRouter(t, {
    hash: '#/dashboard',
    status: 'authenticated',
    profileRole: 'student',
    selectedRole: 'business',
  });
  router.start();
  assert.equal(location.hash, '#/student');
  assert.deepEqual(replacements, ['#/student']);
  assert.match(root.innerHTML, /Найдите следующую задачу для своей команды/);
  assert.match(root.innerHTML, /Проверенный пользователь/);
  assert.doesNotMatch(root.innerHTML, /Панель бизнеса|id="login-form"/);
});

test('authenticated users are redirected from login and registration to their own cabinet', (t) => {
  const { root, router, store, location } = authRouter(t, {
    hash: '#/login',
    status: 'authenticated',
  });
  for (const role of ['business', 'student']) {
    store.update((state) => ({
      ...state,
      auth: { ...state.auth, profile: { ...state.auth.profile, role } },
    }));
    for (const page of ['login', 'register']) {
      location.hash = `#/${page}`;
      router.render();
      assert.equal(location.hash, role === 'business' ? '#/dashboard' : '#/student');
      assert.match(root.innerHTML, /Проверенный пользователь/);
      assert.doesNotMatch(root.innerHTML, /id="login-form"|id="register-form"/);
    }
  }
});

test('anonymous users can browse public catalog without an authentication redirect', (t) => {
  const { root, router, location, replacements } = authRouter(t, { hash: '#/catalog' });
  router.start();
  assert.equal(location.hash, '#/catalog');
  assert.deepEqual(replacements, []);
  assert.match(root.innerHTML, /Каталог бизнес-задач/);
  assert.ok(root.innerHTML.includes(demoTasks[0].title));
  assert.doesNotMatch(root.innerHTML, /id="login-form"|auth-loading/);
});

test('auth callback detection distinguishes Supabase results from ordinary application routes', () => {
  for (const hash of [
    '#access_token=test-access&refresh_token=test-refresh&type=signup',
    '#refresh_token=test-refresh',
    '#error=access_denied&error_description=Email+link+is+invalid',
    '#error_description=Email+link+is+invalid',
    '#error_code=otp_expired',
  ]) {
    assert.equal(isAuthCallbackHash(hash), true);
  }
  for (const hash of ['', '#/', '#/login', '#/detail?id=2', '#/catalog?error=ignored']) {
    assert.equal(isAuthCallbackHash(hash), false);
  }
});

test('confirmation callback tokens stay untouched until Supabase consumes them', (t) => {
  const callback =
    '#access_token=test-access&expires_in=3600&refresh_token=test-refresh&token_type=bearer&type=signup';
  const { root, router, location, replacements, store } = authRouter(t, {
    hash: callback,
    status: 'initializing',
  });
  router.start();
  assert.equal(location.hash, callback);
  assert.deepEqual(replacements, []);
  assert.match(root.innerHTML, /class="auth-loading"/);
  assert.match(root.innerHTML, /role="status"/);
  assert.doesNotMatch(root.innerHTML, /landing-v2|id="login-form"|test-access|test-refresh/);

  store.update((state) => ({ ...state, auth: { ...state.auth, status: 'anonymous' } }));
  router.render();
  assert.equal(
    location.hash,
    callback,
    'intermediate auth state does not erase confirmation tokens',
  );
  assert.deepEqual(replacements, []);
  assert.match(root.innerHTML, /class="auth-loading"/);

  location.hash = '#/login';
  router.render();
  assert.match(root.innerHTML, /id="login-form"/);
  assert.doesNotMatch(root.innerHTML, /auth-loading/);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { demoTasks } from '@ai-sana/contracts/fixtures';
import { createInitialState } from '../src/app/initial-state.js';
import { layout } from '../src/components/layout.js';
import * as pages from '../src/pages/index.js';

function authState(overrides = {}) {
  const state = createInitialState();
  state.auth = {
    configured: true,
    status: 'anonymous',
    user: null,
    profile: null,
    error: '',
    notice: '',
    busy: false,
    ...overrides,
  };
  state.catalog = { items: structuredClone(demoTasks), status: 'ready', error: '' };
  return state;
}

function signedIn(role = 'business', fullName = 'Айгерим Нур') {
  return authState({
    status: 'authenticated',
    user: { id: 'user-id', email: 'aigerim@example.com' },
    profile: { id: 'user-id', full_name: fullName, role },
  });
}

test('registration and login expose named inputs and accessible async feedback', () => {
  const state = authState();
  const register = pages.auth(state, true);
  assert.match(register, /name="full_name"[^>]*maxlength="120"[^>]*required/);
  assert.match(register, /name="email"/);
  assert.match(register, /name="password"/);
  assert.match(register, /minlength="6"/);
  assert.match(register, /id="auth-message"[^>]*role="alert"[^>]*hidden/);
  assert.match(register, /id="auth-notice"[^>]*role="status"[^>]*hidden/);
  assert.doesNotMatch(register, /data-auth-submit[^>]*disabled/);
  const login = pages.auth(state);
  assert.match(login, /data-action="forgot"/);
  assert.doesNotMatch(login, /Запомнить меня|type="checkbox"|name="full_name"/);
});

test('auth disables requests while busy or unavailable and renders escaped messages', () => {
  const state = authState({
    busy: true,
    error: '<img src=x onerror="alert(1)">',
    notice: '<b>Проверьте почту</b>',
  });
  const busy = pages.auth(state, true);
  assert.match(busy, /aria-busy="true"/);
  assert.match(busy, /data-auth-submit[^>]*disabled/);
  assert.match(busy, /Создаём аккаунт…/);
  assert.match(busy, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
  assert.match(busy, /&lt;b&gt;Проверьте почту&lt;\/b&gt;/);
  assert.doesNotMatch(busy, /<img src=x|<b>Проверьте почту/);
  const unavailable = pages.auth(authState({ configured: false }));
  assert.match(unavailable, /Регистрация и вход временно недоступны\./);
  assert.match(unavailable, /data-auth-submit[^>]*disabled/);
  assert.doesNotMatch(unavailable, /\.env|SUPABASE|VITE_/);
  const retry = pages.auth(authState({ status: 'error', error: 'Не удалось подключиться.' }));
  assert.match(retry, /data-action="retry-auth"/);
  assert.doesNotMatch(retry, /data-auth-retry[^>]*hidden/);
});

test('every workspace page uses authenticated identity and logout rather than fabricated users', () => {
  const state = signedIn();
  for (const name of [
    'dashboard',
    'myTasks',
    'student',
    'myProposals',
    'catalog',
    'detail',
    'create',
    'clarify',
    'editor',
    'proposals',
    'simple',
  ]) {
    const html = pages[name](state, 'profile');
    assert.ok(html.includes('Айгерим Нур'), name);
    assert.ok(html.includes('data-action="logout"'), name);
    assert.ok(html.includes('class="avatar">АН</span>'), name);
    assert.ok(!html.includes('Алия М.'), name);
    assert.ok(!html.includes('class="avatar">DW</span>'), name);
  }
  assert.match(pages.dashboard(state), /Добро пожаловать, Айгерим Нур!/);
  const profile = pages.simple(state, 'profile');
  assert.match(profile, /aigerim@example\.com/);
  assert.match(profile, /<dd>Бизнес<\/dd>/);
  assert.doesNotMatch(profile, /Data Wizards|Демонстрационный профиль/);
  const home = pages.landing(state);
  assert.doesNotMatch(home, /Личный кабинет ↗|data-action="profile"/);
  assert.doesNotMatch(home, /data-action="register"/);
});

test('profile, header and welcome escape external identity values', () => {
  const state = signedIn('student', '<script>alert(1)</script>');
  state.auth.user.email = '<img src=x onerror="alert(1)">@example.com';
  for (const html of [
    pages.simple(state, 'profile'),
    pages.dashboard(state),
    pages.catalog(state),
  ]) {
    assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    assert.doesNotMatch(html, /<script>|<img src=x/);
  }
  assert.match(
    pages.simple(state, 'profile'),
    /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;@example.com/,
  );
});

test('catalog and detail preserve verified role navigation in ready, loading and empty states', () => {
  const state = signedIn('business');
  state.role = 'student';
  for (const status of ['ready', 'loading', 'error']) {
    state.catalog.status = status;
    for (const render of [pages.catalog, pages.detail]) {
      const html = render(state);
      assert.match(html, /data-route="dashboard"/);
      assert.doesNotMatch(html, /data-route="my-proposals"/);
    }
  }
  state.catalog.status = 'ready';
  state.currentTaskId = 999;
  assert.match(pages.detail(state), /data-route="dashboard"/);
  const studentState = signedIn('student');
  studentState.role = 'business';
  assert.match(pages.catalog(studentState), /data-route="my-proposals"/);
});

test('anonymous layout offers login and never assigns a sample identity', () => {
  const html = layout('<p>Каталог</p>', 'catalog', 'student', authState().auth);
  assert.match(html, /Гость/);
  assert.match(html, /data-route="login"/);
  assert.doesNotMatch(html, /data-action="logout"|Data Wizards|Алия/);
});

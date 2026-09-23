import assert from 'node:assert/strict';
import test from 'node:test';
import { createInitialState } from '../src/app/initial-state.js';
import { layout, navItems } from '../src/components/layout.js';
import { simple } from '../src/pages/account.js';
import { landing } from '../src/pages/landing.js';

function signedIn(role) {
  const state = createInitialState();
  const id = '11111111-1111-4111-8111-111111111111';
  state.auth = {
    ...state.auth,
    status: 'authenticated',
    configured: true,
    user: { id, email: 'user@example.com' },
    profile: { id, role, full_name: 'Тестовый Пользователь' },
  };
  state.role = role;
  return state;
}

function section(html, pattern, name) {
  const match = pattern.exec(html);
  assert.ok(match, `${name} exists`);
  return match[1];
}

for (const role of ['business', 'student']) {
  test(`${role} navigation removes team while preserving sidebar profile and logout`, () => {
    const items = navItems(role);
    assert.equal(
      items.some(([route]) => route === 'team'),
      false,
    );
    assert.equal(
      items.some(([, title]) => title === 'Моя команда'),
      false,
    );
    assert.equal(
      items.some(([route]) => route === 'profile'),
      true,
    );
    const html = layout('<p>Контент страницы</p>', 'catalog', role, signedIn(role).auth);
    const sidebar = section(html, /<aside class="sidebar">([\s\S]*?)<\/aside>/, 'sidebar');
    assert.match(sidebar, /data-route="profile"/);
    assert.match(sidebar, /data-action="logout"/);
    assert.doesNotMatch(sidebar, /data-route="team"|Моя команда/);
  });

  test(`${role} page header retains the breadcrumb without top-right account controls`, () => {
    const html = layout('<p>Контент страницы</p>', 'catalog', role, signedIn(role).auth);
    const header = section(html, /<header class="main-head">([\s\S]*?)<\/header>/, 'main header');
    assert.match(header, /class="crumb"/);
    assert.match(header, /Рабочее пространство/);
    assert.match(header, /<strong>Каталог<\/strong>/);
    assert.doesNotMatch(
      header,
      /header-account|user-dot|header-logout|data-(?:action|route)="(?:logout|login|profile)"/,
    );
    assert.doesNotMatch(header, /Тестовый Пользователь|user@example\.com/);
  });

  test(`${role} mobile navigation includes profile and never team`, () => {
    const html = layout('<p>Контент страницы</p>', 'catalog', role, signedIn(role).auth);
    const mobile = section(html, /<nav class="mobile-nav">([\s\S]*?)<\/nav>/, 'mobile navigation');
    assert.match(mobile, /data-route="profile"/);
    assert.doesNotMatch(mobile, /data-route="team"|Моя команда/);
  });

  test(`${role} profile includes logout in page content for mobile users`, () => {
    const html = simple(signedIn(role), 'profile');
    const content = section(html, /<div class="content">([\s\S]*?)<\/main>/, 'profile content');
    assert.match(content, /Тестовый Пользователь/);
    assert.match(content, /user@example\.com/);
    assert.match(content, /data-action="logout"/);
    assert.doesNotMatch(content, /Data Wizards|Моя команда/);
  });

  test(`${role} signed-in landing header has no profile or personal-account button`, () => {
    const header = section(
      landing(signedIn(role)),
      /<header class="topbar">([\s\S]*?)<\/header>/,
      'landing header',
    );
    assert.doesNotMatch(header, /Личный кабинет|data-(?:action|route)="profile"|href="#\/profile"/);
    assert.doesNotMatch(header, /data-(?:action|route)="(?:login|register|logout)"/);
  });
}

test('anonymous headers remain clean while landing guests can still log in and register', () => {
  const state = createInitialState();
  state.auth.status = 'anonymous';
  const header = section(
    layout('<p>Каталог</p>', 'catalog', 'student', state.auth),
    /<header class="main-head">([\s\S]*?)<\/header>/,
    'main header',
  );
  assert.match(header, /class="crumb"/);
  assert.doesNotMatch(
    header,
    /header-account|user-dot|data-(?:action|route)="(?:logout|login|profile)"/,
  );
  const topbar = section(
    landing(state),
    /<header class="topbar">([\s\S]*?)<\/header>/,
    'landing header',
  );
  assert.match(topbar, /data-action="login"/);
  assert.match(topbar, /data-action="register"/);
  assert.doesNotMatch(topbar, /Личный кабинет|data-action="profile"/);
});
